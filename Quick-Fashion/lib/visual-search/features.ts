export const FEATURE_COUNT = 20;

export const FEATURE_NAMES = [
  'is_shirt', 'is_tshirt', 'is_dress', 'is_jacket', 'is_bottoms',
  'is_formal', 'is_casual', 'is_patterned', 'is_solid', 'is_denim',
  'is_dark', 'is_light', 'is_warm_tone', 'is_cool_tone', 'is_neutral_tone',
  'is_cotton', 'is_linen', 'is_silk', 'is_summer', 'is_winter',
] as const;

export type VisualGarmentCategory = 'shirt' | 't-shirt' | 'dress' | 'jacket' | 'bottoms' | 'sweatshirt' | 'sweater';

const VISUAL_CATEGORY_INDEX: Record<VisualGarmentCategory, number> = {
  shirt: 0,
  't-shirt': 1,
  dress: 2,
  jacket: 3,
  bottoms: 4,
  sweatshirt: 5,
  sweater: 6,
};

export function normalizeVisualGarmentCategory(value?: string | null): VisualGarmentCategory | null {
  if (!value) return null;
  const text = value.toLowerCase().replace(/[_/]+/g, ' ').replace(/\s+/g, ' ').trim();

  if (/\b(t[ -]?shirts?|tees?|polos?)\b/.test(text)) return 't-shirt';
  if (/\b(jackets?|outerwear|blazers?|coats?|hoodies?|cardigans?|shrugs?)\b/.test(text)) return 'jacket';
  if (/\b(bottoms?|bottomwear|pants?|trousers?|jeans?|shorts?|skirts?|chinos?|joggers?|leggings?)\b/.test(text)) return 'bottoms';
  if (/\b(dresses?|gowns?|frocks?)\b/.test(text)) return 'dress';
  if (/\b(shirts?|blouses?|overshirts?)\b/.test(text)) return 'shirt';
  if (/\b(sweatshirts?|hoodies?|cardigans?|shrugs?)\b/.test(text)) return 'sweatshirt';
  if (/\b(sweaters?|pullovers?)\b/.test(text)) return 'sweater';
  return null;
}

function setExclusiveCategory(vector: number[], category: VisualGarmentCategory) {
  for (let index = 0; index < 7; index += 1) vector[index] = 0;
  vector[VISUAL_CATEGORY_INDEX[category]] = 1;
}

export function productVisualCategorySpecificity(
  product: {
    title: string;
    category: string;
    categoryNode?: { path: string; name: string } | null;
  },
  desired: VisualGarmentCategory,
): number {
  const root = product.categoryNode?.path.toLowerCase().split('/')[0] ?? '';
  const directRoots: Record<VisualGarmentCategory, string[]> = {
    shirt: ['shirt'],
    't-shirt': ['t-shirt'],
    dress: ['dress'],
    jacket: ['jackets', 'denim-jackets'],
    bottoms: ['bottoms'],
    sweatshirt: ['sweatshirt'],
    sweater: ['sweater'],
  };
  if (directRoots[desired].includes(root)) return 2;

  const title = product.title.toLowerCase();
  const directTitle: Record<VisualGarmentCategory, RegExp> = {
    shirt: /\b(shirts?|blouses?|overshirts?)\b/,
    't-shirt': /\b(t[ -]?shirts?|tees?|polos?)\b/,
    dress: /\b(dresses?|gowns?|frocks?)\b/,
    jacket: /\b(jackets?|blazers?|coats?)\b/,
    bottoms: /\b(bottoms?|pants?|trousers?|jeans?|shorts?|skirts?|chinos?|joggers?|leggings?)\b/,
    sweatshirt: /\b(sweatshirts?|hoodies?|cardigans?|shrugs?)\b/,
    sweater: /\b(sweaters?|pullovers?)\b/,
  };
  if (directTitle[desired].test(title)) return 2;

  const productFamily =
    normalizeVisualGarmentCategory(product.categoryNode?.path) ??
    normalizeVisualGarmentCategory(product.categoryNode?.name) ??
    normalizeVisualGarmentCategory(product.category) ??
    normalizeVisualGarmentCategory(product.title);
  return productFamily === desired ? 1 : 0;
}

export function vectorGarmentCategory(vector: number[]): VisualGarmentCategory | null {
  const entry = Object.entries(VISUAL_CATEGORY_INDEX).find(([, index]) => vector[index] === 1);
  return (entry?.[0] as VisualGarmentCategory | undefined) ?? null;
}

export function vectorMatchesGarmentCategory(vector: number[], category: VisualGarmentCategory): boolean {
  return vector[VISUAL_CATEGORY_INDEX[category]] === 1;
}

const KEYWORD_MAP: Record<string, number[]> = {
  // Category features (indices 0-4)
  shirt:    [0], blouse: [0], button: [0],
  tshirt:   [1], 't-shirt': [1], tee: [1], polo: [1],
  dress:    [2], gown: [2], frock: [2],
  jacket:   [3], blazer: [3], coat: [3], hoodie: [3], cardigan: [3],
  bottoms:  [4], pants: [4], trousers: [4], jeans: [4], shorts: [4], skirt: [4],
  // Style features (indices 5-9)
  formal:   [5], office: [5], tailored: [5], elegant: [5], classic: [5],
  casual:   [6], relaxed: [6], everyday: [6], sporty: [6], streetwear: [6],
  patterned:[7], striped: [7], plaid: [7], floral: [7], printed: [7], check: [7],
  solid:    [8], plain: [8], minimal: [8],
  denim:    [9],
  // Colour features (indices 10-14) — set from text or image analysis
  dark:     [10], black: [10], navy: [10], charcoal: [10],
  light:    [11], white: [11], cream: [11], ivory: [11], pastel: [11],
  warm:     [12], red: [12], orange: [12], yellow: [12], rust: [12], burgundy: [12], maroon: [12],
  cool:     [13], blue: [13], teal: [13], green: [13], mint: [13], purple: [13], lavender: [13],
  neutral:  [14], beige: [14], grey: [14], gray: [14], taupe: [14], khaki: [14], brown: [14],
  // Material features (indices 15-17)
  cotton:   [15], jersey: [15],
  linen:    [16],
  silk:     [17], satin: [17], chiffon: [17],
  // Season features (indices 18-19)
  summer:   [18], lightweight: [18], breathable: [18], airy: [18],
  winter:   [19], warm_clothing: [19], heavy: [19], wool: [19], fleece: [19],
};

/* ── Category path → feature index mapping ───────────────────── */

const CATEGORY_PATH_MAP: Record<string, number[]> = {
  shirt:    [0, 5],
  't-shirt':[1, 6],
  dress:    [2],
  jacket:   [3],
  jackets:  [3],
  bottoms:  [4],
  jeans:    [4, 9],
};

/* ====================================================================
   Feature vector generators
   ==================================================================== */

/**
 * Generate a binary feature vector from product metadata.
 * Scans title + description for keywords and maps category path.
 */
export function productToFeatureVector(product: {
  title: string;
  description: string;
  category: string;
  categoryNode?: { path: string; name: string } | null;
}): number[] {
  const vector = new Array(FEATURE_COUNT).fill(0);
  const text = `${product.title} ${product.description} ${product.category}`.toLowerCase();

  // Scan keywords
  for (const [keyword, indices] of Object.entries(KEYWORD_MAP)) {
    // Word-boundary aware matching
    const regex = new RegExp(`\\b${keyword.replace('-', '[-\\s]?')}\\b`, 'i');
    if (regex.test(text)) {
      for (const idx of indices) {
        vector[idx] = 1;
      }
    }
  }

  // Category path mapping
  if (product.categoryNode?.path) {
    const segments = product.categoryNode.path.toLowerCase().split('/');
    for (const segment of segments) {
      const indices = CATEGORY_PATH_MAP[segment];
      if (indices) {
        for (const idx of indices) {
          vector[idx] = 1;
        }
      }
    }
  }

  // Category is a mutually-exclusive garment family. Prefer the authoritative
  // category path, then legacy category, then product text for older rows.
  const productCategory =
    normalizeVisualGarmentCategory(product.categoryNode?.path) ??
    normalizeVisualGarmentCategory(product.categoryNode?.name) ??
    normalizeVisualGarmentCategory(product.category) ??
    normalizeVisualGarmentCategory(`${product.title} ${product.description}`);
  if (productCategory) setExclusiveCategory(vector, productCategory);

  if (vector[10] === 0 && vector[11] === 0 && vector[12] === 0 && vector[13] === 0 && vector[14] === 0) {
    vector[14] = 1; // neutral_tone default
  }

  // If no style features were set, default to casual
  if (vector[5] === 0 && vector[6] === 0) {
    vector[6] = 1; // casual default
  }

  // If no solid/patterned was set, default to solid
  if (vector[7] === 0 && vector[8] === 0) {
    vector[8] = 1; // solid default
  }

  return vector;
}

/**
 * RGB colour information extracted from an uploaded image.
 * @deprecated Use ImageAnalysisResult from image-analysis.ts instead.
 */
export interface DominantColour {
  r: number;
  g: number;
  b: number;
  hex: string;
}

/* ── Gemini label → feature index mapping ─────────────────────────── */

const GEMINI_CATEGORY_MAP: Record<string, number[]> = {
  shirt:     [0, 5],      // is_shirt + is_formal
  blouse:    [0, 5],
  't-shirt': [1, 6],      // is_tshirt + is_casual
  tee:       [1, 6],
  polo:      [1, 6],
  dress:     [2],
  gown:      [2],
  jacket:    [3],
  blazer:    [3, 5],
  coat:      [3],
  hoodie:    [3, 6],
  cardigan:  [3],
  bottoms:   [4],
  pants:     [4],
  jeans:     [4, 9],      // is_bottoms + is_denim
  shorts:    [4, 6],
  skirt:     [4],
  trousers:  [4, 5],
};

const GEMINI_STYLE_MAP: Record<string, number[]> = {
  formal:     [5],
  office:     [5],
  tailored:   [5],
  elegant:    [5],
  classic:    [5],
  casual:     [6],
  relaxed:    [6],
  sporty:     [6],
  streetwear: [6],
  everyday:   [6],
};

const GEMINI_PATTERN_MAP: Record<string, number[]> = {
  solid:    [8],
  plain:    [8],
  minimal:  [8],
  striped:  [7],
  plaid:    [7],
  floral:   [7],
  printed:  [7],
  check:    [7],
  denim:    [9],
};

const GEMINI_MATERIAL_MAP: Record<string, number[]> = {
  cotton:  [15],
  jersey:  [15],
  linen:   [16],
  silk:    [17],
  satin:   [17],
  chiffon: [17],
  denim:   [9],
  wool:    [19],   // also implies winter
  fleece:  [19],
};

const GEMINI_SEASON_MAP: Record<string, number[]> = {
  summer:      [18],
  winter:      [19],
  'all-season': [],   // no specific season bit
};

/**
 * Map Gemini colour description text to feature indices using the
 * existing KEYWORD_MAP colour entries.
 */
function mapColourDescription(desc: string): number[] {
  const indices: number[] = [];
  const text = desc.toLowerCase();

  // Colour keyword → feature index (indices 10-14 from KEYWORD_MAP)
  const colourKeywords: Record<string, number> = {
    dark: 10, black: 10, navy: 10, charcoal: 10,
    light: 11, white: 11, cream: 11, ivory: 11, pastel: 11,
    red: 12, orange: 12, yellow: 12, rust: 12, burgundy: 12, maroon: 12, warm: 12, coral: 12, pink: 12,
    blue: 13, teal: 13, green: 13, mint: 13, purple: 13, lavender: 13, cool: 13, aqua: 13, cyan: 13,
    beige: 14, grey: 14, gray: 14, taupe: 14, khaki: 14, brown: 14, neutral: 14, olive: 14, tan: 14,
  };

  for (const [keyword, idx] of Object.entries(colourKeywords)) {
    if (text.includes(keyword)) {
      indices.push(idx);
    }
  }

  return [...new Set(indices)]; // deduplicate
}

/* ── Server-side analysis types (matching image-analysis.ts) ──────── */

interface ImageAnalysisInput {
  colourClusters: Array<{ r: number; g: number; b: number; weight: number }>;
  brightness: number;
  saturation: number;
  colourVariance: number;
  warmRatio: number;
  coolRatio: number;
  aspectRatio?: number;
  inferredCategoryFallback?: string;
  geminiLabels: {
    category: string;
    style: string;
    pattern: string;
    material: string;
    season: string;
    colourDescription: string;
  } | null;
}

/**
 * Generate a binary feature vector from rich server-side image analysis.
 * Uses Gemini Vision labels for category/style/pattern/material/season,
 * and sharp pixel statistics for colour features.
 */
export function imageAnalysisToFeatureVector(
  analysis: ImageAnalysisInput,
  selectedCategory?: string,
): number[] {
  const vector = new Array(FEATURE_COUNT).fill(0);

  // ═══════════════════════════════════════════════════════════════════
  //  1. Gemini Vision labels → feature bits (category, style, etc.)
  // ═══════════════════════════════════════════════════════════════════

  if (analysis.geminiLabels) {
    const labels = analysis.geminiLabels;

    // Category variants such as "denim jacket", "jackets", and "outerwear"
    // all resolve to the same mutually-exclusive visual garment family.
    const detectedCategory = normalizeVisualGarmentCategory(labels.category);
    if (detectedCategory) setExclusiveCategory(vector, detectedCategory);

    // Style
    const styleKey = labels.style.toLowerCase();
    for (const idx of GEMINI_STYLE_MAP[styleKey] ?? []) vector[idx] = 1;

    // Pattern
    const patternKey = labels.pattern.toLowerCase();
    for (const idx of GEMINI_PATTERN_MAP[patternKey] ?? []) vector[idx] = 1;

    // Material
    const materialKey = labels.material.toLowerCase();
    for (const idx of GEMINI_MATERIAL_MAP[materialKey] ?? []) vector[idx] = 1;

    // Season
    const seasonKey = labels.season.toLowerCase();
    for (const idx of GEMINI_SEASON_MAP[seasonKey] ?? []) vector[idx] = 1;

    // Colour description → colour feature bits
    for (const idx of mapColourDescription(labels.colourDescription)) {
      vector[idx] = 1;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  2. User-selected category override / supplement
  // ═══════════════════════════════════════════════════════════════════

  const selectedGarmentCategory = normalizeVisualGarmentCategory(selectedCategory);
  if (selectedGarmentCategory) {
    setExclusiveCategory(vector, selectedGarmentCategory);
  }


  const hasCategory = vector[0] || vector[1] || vector[2] || vector[3] || vector[4];
  if (!hasCategory && analysis.inferredCategoryFallback) {
    const fallbackCategory = normalizeVisualGarmentCategory(analysis.inferredCategoryFallback);
    if (fallbackCategory) setExclusiveCategory(vector, fallbackCategory);
  }



  const hasColourFromGemini = vector[10] || vector[11] || vector[12] || vector[13] || vector[14];

  if (!hasColourFromGemini) {
    // Dark vs light
    if (analysis.brightness < 85) {
      vector[10] = 1;
    } else if (analysis.brightness > 180) {
      vector[11] = 1;
    }

    // Warm vs cool vs neutral (using pixel ratios from sharp analysis)
    if (analysis.warmRatio > 0.3) {
      vector[12] = 1;
    } else if (analysis.coolRatio > 0.3) {
      vector[13] = 1;
    } else {
      vector[14] = 1;
    }
  }


  if (vector[7] === 0 && vector[8] === 0) {
    // High colour variance (>40) suggests a pattern; low (<25) suggests solid
    if (analysis.colourVariance > 40) {
      vector[7] = 1; // is_patterned
    } else {
      vector[8] = 1; // is_solid
    }
  }


  if (vector[18] === 0 && vector[19] === 0) {
    if (analysis.brightness > 160) {
      vector[18] = 1; // summer
    } else if (analysis.brightness < 80) {
      vector[19] = 1; // winter
    }
  }

  // Default to neutral if no colour features were set
  if (vector[10] === 0 && vector[11] === 0 && vector[12] === 0 && vector[13] === 0 && vector[14] === 0) {
    vector[14] = 1;
  }
  // Default to casual if no style was set
  if (vector[5] === 0 && vector[6] === 0) vector[6] = 1;
  // Default to solid if no pattern was set
  if (vector[7] === 0 && vector[8] === 0) vector[8] = 1;

  return vector;
}

/* ── Similarity functions ────────────────────────────────────────── */

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  if (magnitude === 0) return 0;
  return dot / magnitude;
}

/**
 * Feature weights by group — category features are weighted 3× because
 * matching the garment type is the most important visual signal.
 *
 * Indices:   0-4  = category (3×)
 *            5-9  = style    (2×)
 *            10-14 = colour  (1.5×)
 *            15-17 = material (1×)
 *            18-19 = season   (1×)
 */
const FEATURE_WEIGHTS = [
  3, 3, 3, 3, 3,       // category
  2, 2, 2, 2, 2,       // style
  1.5, 1.5, 1.5, 1.5, 1.5, // colour
  1, 1, 1,             // material
  1, 1,                // season
];

/**
 * Weighted cosine similarity — gives more importance to category and
 * style features so that garment-type matches rank higher than
 * colour-only matches.
 */ 
export function weightedCosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    const w = FEATURE_WEIGHTS[i] ?? 1;
    const wa = a[i] * w;
    const wb = b[i] * w;
    dot += wa * wb;
    magA += wa * wa;
    magB += wb * wb;
  }

  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  if (magnitude === 0) return 0;
  return dot / magnitude;
}
