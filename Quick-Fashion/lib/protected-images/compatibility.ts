import type { ProductImage } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/prisma';
import { protectedImageConfig } from './config';
import { chooseVariant, processProductImage } from './processor';
import { deletePrivatePrefix } from './storage';
import {
  acquireCatalogCompatibilityLock,
  releaseCatalogCompatibilityLock,
} from './redis';
import type { StoredVariants } from './types';

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function isCatalogSourceKey(key: string) {
  return key.startsWith('catalog:');
}

export function hasRenderableVariants(value: unknown) {
  try {
    const variants = value as StoredVariants;
    return Boolean(chooseVariant(variants, 160)?.tiles.length);
  } catch {
    return false;
  }
}

async function readCatalogSource(originalKey: string) {
  const parts = originalKey.slice('catalog:'.length).split('/');
  if (parts.length !== 3 || parts.some((part) => !/^[a-z0-9._-]+$/i.test(part))) {
    throw new Error('Invalid catalog source reference');
  }
  return readFile(path.join(protectedImageConfig.storageRoot, 'media', ...parts));
}

/** Converts a legacy catalog source object only when it is first rendered. */
export async function ensureCatalogImageIsProtected(image: ProductImage) {
  if (!isCatalogSourceKey(image.originalKey) || hasRenderableVariants(image.variants)) {
    return image;
  }

  const locked = await acquireCatalogCompatibilityLock(image.id);
  if (!locked) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      await delay(500);
      const updated = await prisma.productImage.findUnique({ where: { id: image.id } });
      if (!updated) throw new Error('Protected image no longer exists');
      if (hasRenderableVariants(updated.variants) || !isCatalogSourceKey(updated.originalKey)) {
        return updated;
      }
    }
    throw new Error('Catalog image is still being prepared');
  }

  try {
    const current = await prisma.productImage.findUnique({ where: { id: image.id } });
    if (!current) throw new Error('Protected image no longer exists');
    if (!isCatalogSourceKey(current.originalKey) || hasRenderableVariants(current.variants)) {
      return current;
    }

    const processed = await processProductImage(
      await readCatalogSource(current.originalKey),
      { imageId: current.id },
    );
    try {
      return await prisma.productImage.update({
        where: { id: current.id },
        data: {
          originalKey: processed.originalKey,
          width: processed.width,
          height: processed.height,
          variants: processed.variants,
          status: 'ACTIVE',
        },
      });
    } catch (error) {
      await deletePrivatePrefix(current.id);
      throw error;
    }
  } finally {
    await releaseCatalogCompatibilityLock(image.id);
  }
}
