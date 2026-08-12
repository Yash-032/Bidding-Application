import { prisma } from '@/lib/prisma';
import { deletePrivatePrefix, getPrivateObject } from '@/lib/protected-images/storage';
import { chooseVariant, processProductImage } from '@/lib/protected-images/processor';
import type { StoredVariants } from '@/lib/protected-images/types';
import sharp from 'sharp';

type RemoveBgGlobals = typeof globalThis & {
  __removeBgProtectedDerivatives?: Map<string, Promise<string>>;
};

const globals = globalThis as RemoveBgGlobals;
const derivativesInProgress = globals.__removeBgProtectedDerivatives ?? new Map<string, Promise<string>>();
globals.__removeBgProtectedDerivatives = derivativesInProgress;

const derivativeStatus = (sourceId: string) => `REMOVE_BG:${sourceId}`;

async function reconstructProtectedStill(variants: StoredVariants) {
  const variant = chooseVariant(variants, 1600);
  if (!variant?.tiles.length) throw new Error('This product has no usable still image');

  const layers = await Promise.all(variant.tiles.map(async (tile) => {
    const encoded = await getPrivateObject(tile.storageKey);
    const protectedBytes = encoded.subarray(16);
    const key = Buffer.from(tile.decodeKey, 'base64url');
    const decoded = Buffer.allocUnsafe(protectedBytes.length);
    for (let index = 0; index < protectedBytes.length; index += 1) {
      decoded[index] = protectedBytes[index] ^ key[index % key.length];
    }
    return { input: decoded, left: tile.x, top: tile.y };
  }));

  return sharp({
    create: {
      width: variant.width,
      height: variant.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(layers).png().toBuffer();
}

async function prepareRemoveBgInput(original: Buffer, variants: StoredVariants) {
  try {
    // Normalizing through Sharp guarantees remove.bg receives a real still PNG,
    // regardless of the source filename or its missing content-type metadata.
    return await sharp(original, { failOn: 'error', limitInputPixels: 40_000_000 })
      .rotate()
      .png()
      .toBuffer();
  } catch {
    // Some imported catalog rows retain a video (for example MP4) as their
    // original object while their protected variants contain a valid poster.
    return reconstructProtectedStill(variants);
  }
}

async function requestRemoveBg(inputPng: Buffer) {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) throw new Error('REMOVE_BG_API_KEY is not configured');

  const form = new FormData();
  form.append('size', 'auto');
  form.append('format', 'png');
  form.append('type', 'auto');
  form.append('image_file', new Blob([new Uint8Array(inputPng)], { type: 'image/png' }), 'garment.png');

  const response = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      Accept: 'image/png',
    },
    body: form,
    cache: 'no-store',
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`remove.bg failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ''}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function ensureProtectedRemoveBgDerivative(sourceId: string) {
  const cached = await prisma.productImage.findFirst({
    where: { status: derivativeStatus(sourceId) },
    select: { id: true },
  });
  if (cached) return cached.id;

  const running = derivativesInProgress.get(sourceId);
  if (running) return running;

  const operation = (async () => {
    const source = await prisma.productImage.findUnique({
      where: { id: sourceId },
      include: { product: { select: { isActive: true } } },
    });
    if (!source?.product?.isActive) throw new Error('Source product image is unavailable');

    const original = await getPrivateObject(source.originalKey);
    const stillPng = await prepareRemoveBgInput(original, source.variants as StoredVariants);
    const transparentPng = await requestRemoveBg(stillPng);
    const processed = await processProductImage(transparentPng);

    try {
      await prisma.productImage.create({
        data: {
          id: processed.id,
          uploaderId: source.uploaderId,
          width: processed.width,
          height: processed.height,
          originalKey: processed.originalKey,
          variants: processed.variants,
          status: derivativeStatus(sourceId),
        },
      });
      return processed.id;
    } catch (error) {
      await deletePrivatePrefix(processed.id);
      throw error;
    }
  })().finally(() => derivativesInProgress.delete(sourceId));

  derivativesInProgress.set(sourceId, operation);
  return operation;
}
