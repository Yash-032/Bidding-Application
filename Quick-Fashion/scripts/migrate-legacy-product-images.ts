import 'dotenv/config';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { processProductImage } from '../lib/protected-images/processor';
import { deletePrivatePrefix } from '../lib/protected-images/storage';
import { protectedImageConfig } from '../lib/protected-images/config';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 20_000,
  idleTimeoutMillis: 10_000,
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function isPrivateAddress(address: string) {
  if (!isIP(address)) return true;
  return address === '::1' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:')
    || address.startsWith('10.') || address.startsWith('127.') || address.startsWith('169.254.')
    || address.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(address);
}

async function downloadLegacyImage(source: string) {
  let url = new URL(source);
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    if (url.protocol !== 'https:') throw new Error('Legacy image imports require HTTPS');
    const addresses = await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
      throw new Error('Legacy image URL resolves to a private or invalid address');
    }
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirectCount === 3) throw new Error('Legacy image has too many or invalid redirects');
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new Error(`Legacy image download failed (${response.status})`);
    if (!response.headers.get('content-type')?.toLowerCase().startsWith('image/')) {
      throw new Error('Legacy URL is a web page, not a direct image file');
    }
    const declaredSize = Number(response.headers.get('content-length') ?? 0);
    if (declaredSize > protectedImageConfig.maxUploadBytes) throw new Error('Legacy image is too large');
    const value = Buffer.from(await response.arrayBuffer());
    if (value.length > protectedImageConfig.maxUploadBytes) throw new Error('Legacy image is too large');
    return value;
  }
  throw new Error('Legacy image redirect could not be resolved');
}

async function main() {
  const products = await prisma.product.findMany({
    where: { images: { isEmpty: false } },
    select: { id: true, sellerId: true, images: true },
  });
  for (const product of products) {
    const created: string[] = [];
    try {
      for (const [sortOrder, source] of product.images.entries()) {
        const processed = await processProductImage(await downloadLegacyImage(source));
        created.push(processed.id);
        await prisma.productImage.create({
          data: {
            id: processed.id,
            productId: product.id,
            uploaderId: product.sellerId,
            sortOrder,
            width: processed.width,
            height: processed.height,
            originalKey: processed.originalKey,
            variants: processed.variants,
            status: 'ACTIVE',
          },
        });
      }
      await prisma.product.update({ where: { id: product.id }, data: { images: [] } });
      console.info(`Migrated ${created.length} image(s) for product ${product.id}`);
    } catch (error) {
      await prisma.productImage.deleteMany({ where: { id: { in: created } } });
      await Promise.allSettled(created.map(deletePrivatePrefix));
      console.error(`Failed product ${product.id}:`, error);
      process.exitCode = 1;
    }
  }
}

main().finally(async () => {
  await prisma.$disconnect();
  await pool.end();
});
