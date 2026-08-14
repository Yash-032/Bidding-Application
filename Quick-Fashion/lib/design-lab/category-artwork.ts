import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { processProductImage } from '@/lib/protected-images/processor';
import { categoryArtworkVersions } from './category-artwork-versions';

const categoryArtworkFiles = {
  shirt: 'shirt.png',
  't-shirt': 't-shirt.png',
  tops: 'sweater-alt.png',
  bottoms: 'bottoms.png',
  dress: 'dress.png',
  sweater: 'sweater.png',
  sweatshirt: 'sweatshirt.png',
  hoodie: 'hoodie.png',
  'crop-tops': 'crop-tops.png',
  shrug: 'shrug.png',
  jackets: 'jackets.png',
  'denim-jackets': 'denim-jackets.png',
} as const;

export type DesignLabCategoryArtworkPath = keyof typeof categoryArtworkFiles;

type CategoryArtworkGlobals = typeof globalThis & {
  __designLabCategoryArtwork?: Map<string, Promise<Awaited<ReturnType<typeof processProductImage>>>>;
};

const globals = globalThis as CategoryArtworkGlobals;
const artworkInProgress = globals.__designLabCategoryArtwork ?? new Map();
globals.__designLabCategoryArtwork = artworkInProgress;

export function hasDesignLabCategoryArtwork(value: string): value is DesignLabCategoryArtworkPath {
  return Object.hasOwn(categoryArtworkFiles, value);
}

export function ensureProtectedCategoryArtwork(categoryPath: string) {
  if (!hasDesignLabCategoryArtwork(categoryPath)) {
    throw new Error('Category artwork is unavailable');
  }

  const artwork = categoryArtworkVersions[categoryPath];
  if (!artwork) throw new Error(`Category artwork version is unavailable for ${categoryPath}`);
  const artworkCacheKey = `category-artwork:${categoryPath}:${artwork.version}`;
  const cached = artworkInProgress.get(artworkCacheKey);
  if (cached) return cached;

  const operation = readFile(path.join(
    process.cwd(),
    'app',
    'design-lab',
    'category-assets',
    categoryArtworkFiles[categoryPath],
  )).then((source) => processProductImage(source, { imageId: `category-${categoryPath}-${artwork.version}` }));

  artworkInProgress.set(artworkCacheKey, operation);
  operation.catch(() => artworkInProgress.delete(artworkCacheKey));
  return operation;
}
