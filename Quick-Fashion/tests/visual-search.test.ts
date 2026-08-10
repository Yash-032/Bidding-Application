import { describe, expect, it } from 'vitest';
import {
  productToFeatureVector,
  imageAnalysisToFeatureVector,
  weightedCosineSimilarity,
  cosineSimilarity,
  normalizeVisualGarmentCategory,
  vectorMatchesGarmentCategory,
  productVisualCategorySpecificity,
} from '../lib/visual-search/features';

describe('Visual Search Feature Extraction & Similarity', () => {
  it('correctly maps Gemini Vision labels to feature vectors', () => {
    const vector = imageAnalysisToFeatureVector({
      colourClusters: [{ r: 20, g: 30, b: 180, weight: 0.8 }],
      brightness: 70,
      saturation: 0.6,
      colourVariance: 15,
      warmRatio: 0.1,
      coolRatio: 0.7,
      geminiLabels: {
        category: 'shirt',
        style: 'formal',
        pattern: 'solid',
        material: 'cotton',
        season: 'summer',
        colourDescription: 'dark navy blue',
      },
    });

    // is_shirt (0) should be 1
    expect(vector[0]).toBe(1);
    // is_formal (5) should be 1
    expect(vector[5]).toBe(1);
    // is_solid (8) should be 1
    expect(vector[8]).toBe(1);
    // is_dark (10) should be 1 (from "dark" in colour description or brightness < 85)
    expect(vector[10]).toBe(1);
    // is_cool_tone (13) should be 1 (from "blue" in colour description)
    expect(vector[13]).toBe(1);
    // is_cotton (15) should be 1
    expect(vector[15]).toBe(1);
    // is_summer (18) should be 1
    expect(vector[18]).toBe(1);
  });

  it('ranks category-matching products higher when using weighted cosine similarity', () => {
    // Query: Blue formal shirt
    const queryVector = imageAnalysisToFeatureVector({
      colourClusters: [{ r: 20, g: 30, b: 180, weight: 0.8 }],
      brightness: 70,
      saturation: 0.6,
      colourVariance: 15,
      warmRatio: 0.1,
      coolRatio: 0.7,
      geminiLabels: {
        category: 'shirt',
        style: 'formal',
        pattern: 'solid',
        material: 'cotton',
        season: 'summer',
        colourDescription: 'dark navy blue',
      },
    });

    // Product 1: Navy formal shirt (category match + colour match)
    const shirtProduct = productToFeatureVector({
      title: 'Classic Navy Oxford Shirt',
      description: 'Formal navy blue cotton shirt for modern wear',
      category: 'shirt',
    });

    // Product 2: Navy formal jacket (same colour + style, but DIFFERENT category)
    const jacketProduct = productToFeatureVector({
      title: 'Navy Tailored Blazer Jacket',
      description: 'Formal navy blue jacket blazer',
      category: 'jacket',
    });

    const shirtSimilarity = weightedCosineSimilarity(queryVector, shirtProduct);
    const jacketSimilarity = weightedCosineSimilarity(queryVector, jacketProduct);

    // Shirt MUST rank higher than jacket for a shirt query
    expect(shirtSimilarity).toBeGreaterThan(jacketSimilarity);
  });

  it('falls back to sharp pixel analysis when Gemini labels are null', () => {
    const vector = imageAnalysisToFeatureVector({
      colourClusters: [{ r: 220, g: 80, b: 30, weight: 0.9 }],
      brightness: 110,
      saturation: 0.7,
      colourVariance: 50, // high variance -> pattern
      warmRatio: 0.8,
      coolRatio: 0.1,
      geminiLabels: null,
    });

    // is_warm_tone (12) from warmRatio > 0.3
    expect(vector[12]).toBe(1);
    // is_patterned (7) from colourVariance > 40
    expect(vector[7]).toBe(1);
  });

  it('normalizes detailed Gemini labels into catalog garment families', () => {
    expect(normalizeVisualGarmentCategory('denim jacket')).toBe('jacket');
    expect(normalizeVisualGarmentCategory('Outerwear')).toBe('jacket');
    expect(normalizeVisualGarmentCategory('graphic t shirt')).toBe('t-shirt');
  });

  it('keeps product garment categories mutually exclusive', () => {
    const tShirt = productToFeatureVector({
      title: 'Graphic Half Sleeve T-Shirt',
      description: 'Casual cotton tee',
      category: 'HALF SLEEVES',
      categoryNode: { path: 't-shirt/half-sleeves', name: 'Half sleeves' },
    });

    expect(tShirt[0]).toBe(0);
    expect(tShirt[1]).toBe(1);
  });

  it('maps a denim jacket query and jacket products to the same candidate family', () => {
    const query = imageAnalysisToFeatureVector({
      colourClusters: [{ r: 30, g: 50, b: 120, weight: 0.8 }],
      brightness: 70,
      saturation: 0.5,
      colourVariance: 20,
      warmRatio: 0.1,
      coolRatio: 0.7,
      geminiLabels: {
        category: 'denim jacket',
        style: 'casual',
        pattern: 'denim',
        material: 'denim',
        season: 'all-season',
        colourDescription: 'dark blue',
      },
    });
    const jacket = productToFeatureVector({
      title: 'Levi Denim Jacket',
      description: 'Blue denim outerwear',
      category: 'OTHER',
    });
    const shirt = productToFeatureVector({
      title: 'Blue Cotton Shirt',
      description: 'Casual blue shirt',
      category: 'SHIRT',
    });

    expect(query[3]).toBe(1);
    expect(query[9]).toBe(1);
    expect(vectorMatchesGarmentCategory(jacket, 'jacket')).toBe(true);
    expect(vectorMatchesGarmentCategory(shirt, 'jacket')).toBe(false);
  });
  it('ranks exact jackets ahead of related outerwear', () => {
    expect(productVisualCategorySpecificity({
      title: 'Denim Dungaree Jacket',
      category: 'DENIM JACKETS',
      categoryNode: { path: 'denim-jackets', name: 'Denim Jackets' },
    }, 'jacket')).toBe(2);
    expect(productVisualCategorySpecificity({
      title: 'Fringe Shrug',
      category: 'SHRUG',
      categoryNode: { path: 'shrug', name: 'Shrug' },
    }, 'jacket')).toBe(1);
    expect(productVisualCategorySpecificity({
      title: 'Cotton Shirt',
      category: 'SHIRT',
      categoryNode: { path: 'shirt', name: 'Shirt' },
    }, 'jacket')).toBe(0);
  });});
