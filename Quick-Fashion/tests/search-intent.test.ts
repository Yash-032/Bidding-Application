import { describe, expect, it } from 'vitest';

import {
  inferSearchIntent,
  isCategoryCompatible,
  rootOfCategoryPath,
} from '@/lib/discovery/search-intent';

describe('semantic garment search intent', () => {
  it('treats shorts as bottomwear instead of a typo for shirts', () => {
    const intent = inferSearchIntent('shorts');

    expect(intent?.key).toBe('shorts');
    expect(intent?.preferredPaths).toContain('bottoms/denim-shorts');
    expect(isCategoryCompatible('bottoms/denim-shorts/small-bottoms', intent!)).toBe(true);
    expect(isCategoryCompatible('shirt/half-sleeves', intent!)).toBe(false);
  });

  it('understands garment-family synonyms semantically', () => {
    expect(inferSearchIntent('casual trousers')?.key).toBe('bottoms');
    expect(inferSearchIntent('summer blazer')?.key).toBe('outerwear');
    expect(inferSearchIntent('evening gown')?.key).toBe('dresses');
  });

  it('leaves unknown spellings for generalized category typo recovery', () => {
    expect(inferSearchIntent('jaket')).toBeNull();
    expect(inferSearchIntent('jeens')).toBeNull();
  });

  it('derives compatibility from hierarchical category roots', () => {
    expect(rootOfCategoryPath('bottoms/jeans/long-bottoms')).toBe('bottoms');
  });
});
