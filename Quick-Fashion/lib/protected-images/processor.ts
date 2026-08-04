import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { protectedImageConfig } from './config';
import { obfuscateRawTile, randomId } from './crypto';
import { deletePrivatePrefix, putPrivateObject } from './storage';
import type { StoredVariant, StoredVariants } from './types';
import { ValidationError } from '@/lib/utils/errors';

const allowedFormats = new Set(['jpeg', 'png', 'webp']);
type ImageMetadata = Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;

function isAllowedProductImage(metadata: ImageMetadata) {
  if (allowedFormats.has(metadata.format)) return true;
  // libvips/Sharp reports AVIF as a HEIF container compressed with AV1.
  // HEIC uses the same container with HEVC and remains intentionally rejected.
  return metadata.format === 'heif'
    && (metadata.compression === 'av1' || metadata.mediaType === 'image/avif');
}

export async function processProductImage(input: Buffer, options?: { imageId?: string }) {
  if (!input.length || input.length > protectedImageConfig.maxUploadBytes) {
    throw new ValidationError(`Image must be no larger than ${Math.floor(protectedImageConfig.maxUploadBytes / 1024 / 1024)} MB`);
  }
  let metadata: ImageMetadata;
  try {
    metadata = await sharp(input, { failOn: 'error', limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new ValidationError('The file content is damaged or is not a decodable JPEG, PNG, WebP, or AVIF image');
  }
  if (!metadata.width || !metadata.height || !isAllowedProductImage(metadata)) {
    const detected = metadata.format === 'heif' && metadata.compression === 'hevc'
      ? 'HEIC'
      : metadata.format.toUpperCase();
    throw new ValidationError(`Detected ${detected}; upload a JPEG, PNG, WebP, or AVIF product image`);
  }

  const imageId = options?.imageId ?? randomUUID();
  const originalKey = `${imageId}/${randomId(24)}`;
  const variants: StoredVariants = {};
  try {
    await putPrivateObject(originalKey, input);
    const widths = [...new Set([...protectedImageConfig.variantWidths, Math.min(metadata.width, 4096)])]
      .filter((width) => width <= metadata.width)
      .sort((a, b) => a - b);

    for (const targetWidth of widths) {
      const { data, info } = await sharp(input)
        .rotate()
        .resize({ width: targetWidth, withoutEnlargement: true })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const variant: StoredVariant = { width: info.width, height: info.height, tiles: [] };
      const grid = protectedImageConfig.grid;
      for (let row = 0; row < grid; row += 1) {
        for (let column = 0; column < grid; column += 1) {
          const x = Math.floor(column * info.width / grid);
          const y = Math.floor(row * info.height / grid);
          const right = Math.floor((column + 1) * info.width / grid);
          const bottom = Math.floor((row + 1) * info.height / grid);
          const width = right - x;
          const height = bottom - y;
          const rawTile = Buffer.allocUnsafe(width * height * 4);
          for (let tileRow = 0; tileRow < height; tileRow += 1) {
            const sourceStart = ((y + tileRow) * info.width + x) * 4;
            data.copy(rawTile, tileRow * width * 4, sourceStart, sourceStart + width * 4);
          }
          const tileId = randomId();
          const storageKey = `${imageId}/${randomId(24)}`;
          // Lossless WebP keeps the reconstructed pixels exact while avoiding
          // the very large raw-RGBA transfer previously used for every tile.
          // The complete compressed payload is then obfuscated, so its stored
          // and network forms do not expose a recognizable image header.
          const compressedTile = await sharp(rawTile, {
            raw: { width, height, channels: 4 },
          }).webp({ lossless: true, effort: 3 }).toBuffer();
          const protectedTile = obfuscateRawTile(compressedTile);
          await putPrivateObject(storageKey, protectedTile.encoded);
          variant.tiles.push({
            id: tileId, x, y, width, height, storageKey,
            sha256: protectedTile.sha256,
            decodeKey: protectedTile.decodeKey,
            codec: 'webp-lossless',
          });
        }
      }
      variants[String(info.width)] = variant;
    }
    const largest = Object.values(variants).sort((a, b) => b.width - a.width)[0];
    return { id: imageId, width: largest.width, height: largest.height, originalKey, variants };
  } catch (error) {
    await deletePrivatePrefix(imageId);
    throw error;
  }
}

export function chooseVariant(variants: StoredVariants, requestedWidth: number) {
  const available = Object.values(variants).sort((a, b) => a.width - b.width);
  return available.find((variant) => variant.width >= requestedWidth) ?? available.at(-1);
}
