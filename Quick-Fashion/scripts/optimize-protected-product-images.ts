import 'dotenv/config';
import sharp from 'sharp';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { obfuscateRawTile, randomId } from '../lib/protected-images/crypto';
import {
  deletePrivateObject,
  getPrivateObject,
  putPrivateObject,
} from '../lib/protected-images/storage';
import type { StoredVariants } from '../lib/protected-images/types';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 20_000,
  idleTimeoutMillis: 10_000,
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function optimizeImage(image: { id: string; variants: Prisma.JsonValue }) {
  const variants = structuredClone(image.variants) as StoredVariants;
  const newKeys: string[] = [];
  const replacedKeys: string[] = [];
  let oldBytes = 0;
  let newBytes = 0;

  try {
    for (const variant of Object.values(variants)) {
      await Promise.all(variant.tiles.map(async (tile) => {
        if (tile.codec === 'webp-lossless') return;

        const encoded = await getPrivateObject(tile.storageKey);
        const expectedLength = 16 + tile.width * tile.height * 4;
        if (encoded.length !== expectedLength) {
          throw new Error(`Tile ${tile.id} has an unexpected legacy payload length`);
        }
        const key = Buffer.from(tile.decodeKey, 'base64url');
        const raw = Buffer.allocUnsafe(encoded.length - 16);
        for (let index = 16; index < encoded.length; index += 1) {
          raw[index - 16] = encoded[index] ^ key[(index - 16) % key.length];
        }

        const compressed = await sharp(raw, {
          raw: { width: tile.width, height: tile.height, channels: 4 },
        }).webp({ lossless: true, effort: 3 }).toBuffer();
        const protectedTile = obfuscateRawTile(compressed);
        const storageKey = `${image.id}/${randomId(24)}`;
        await putPrivateObject(storageKey, protectedTile.encoded);

        newKeys.push(storageKey);
        replacedKeys.push(tile.storageKey);
        oldBytes += encoded.length;
        newBytes += protectedTile.encoded.length;
        tile.storageKey = storageKey;
        tile.sha256 = protectedTile.sha256;
        tile.decodeKey = protectedTile.decodeKey;
        tile.codec = 'webp-lossless';
      }));
    }

    if (!newKeys.length) {
      console.info(`Already optimized ${image.id}`);
      return;
    }

    await prisma.productImage.update({
      where: { id: image.id },
      data: { variants: variants as unknown as Prisma.InputJsonValue },
    });
    await Promise.allSettled(replacedKeys.map(deletePrivateObject));
    const savedPercent = oldBytes
      ? Math.round((1 - newBytes / oldBytes) * 100)
      : 0;
    console.info(
      `Optimized ${image.id}: ${oldBytes} -> ${newBytes} bytes (${savedPercent}% smaller)`,
    );
  } catch (error) {
    await Promise.allSettled(newKeys.map(deletePrivateObject));
    throw error;
  }
}

async function main() {
  const images = await prisma.productImage.findMany({
    where: { status: { not: 'DELETED' } },
    select: { id: true, variants: true },
    orderBy: { createdAt: 'asc' },
  });

  for (const image of images) {
    try {
      await optimizeImage(image);
    } catch (error) {
      process.exitCode = 1;
      console.error(
        `Failed to optimize ${image.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}

main().finally(async () => {
  await prisma.$disconnect();
  await pool.end();
});
