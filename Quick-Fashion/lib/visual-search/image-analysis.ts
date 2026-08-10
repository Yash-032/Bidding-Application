import sharp from 'sharp';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ImageAnalysisResult {
  /** Multiple dominant colour clusters (k-means-like) */
  colourClusters: Array<{ r: number; g: number; b: number; weight: number }>;
  /** Overall brightness (0-255) */
  brightness: number;
  /** Average saturation (0-1) */
  saturation: number;
  /** Colour variance — high = patterned, low = solid */
  colourVariance: number;
  /** Warm pixel ratio (0-1) */
  warmRatio: number;
  /** Cool pixel ratio (0-1) */
  coolRatio: number;
  /** Original image aspect ratio (height / width) */
  aspectRatio: number;
  /** Sharp-inferred category fallback when Gemini is unavailable */
  inferredCategoryFallback: string;
  /** Gemini-detected garment attributes (null if API key not set or quota exceeded) */
  geminiLabels: GeminiGarmentLabels | null;
}

/** Structured labels returned by Gemini Vision analysis. */
export interface GeminiGarmentLabels {
  category: string;     // e.g. "shirt", "dress", "jacket", "t-shirt", "bottoms"
  style: string;        // e.g. "formal", "casual", "sporty"
  pattern: string;      // e.g. "solid", "striped", "floral", "plaid", "printed"
  material: string;     // e.g. "cotton", "silk", "denim", "linen", "wool"
  season: string;       // e.g. "summer", "winter", "all-season"
  colourDescription: string; // e.g. "dark navy blue", "light pastel pink"
  [key: string]: string;
}

/* ================================================================== */
/*  Sharp-based pixel & geometry analysis                             */
/* ================================================================== */

/**
 * Analyse raw pixel data extracted via sharp.
 * Produces colour clusters, brightness/saturation stats, variance, and shape heuristics.
 */
function analysePixelData(
  rawPixels: Buffer,
  width: number,
  height: number,
  aspectRatio: number,
): Omit<ImageAnalysisResult, 'geminiLabels'> {
  const pixelCount = width * height;

  // --- Pass 1: Compute overall stats ---
  let rSum = 0, gSum = 0, bSum = 0;
  let brightnessSum = 0;
  let saturationSum = 0;
  let warmCount = 0, coolCount = 0;
  let foregroundCount = 0;
  let topForegroundCount = 0;
  let bottomForegroundCount = 0;

  // Collect foreground pixel data for clustering
  const foregroundPixels: Array<{ r: number; g: number; b: number }> = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const offset = i * 3;
      const r = rawPixels[offset];
      const g = rawPixels[offset + 1];
      const b = rawPixels[offset + 2];

      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      // Skip likely-background pixels (very bright or very dark)
      if (brightness < 15 || brightness > 245) continue;

      foregroundCount++;
      if (y < height / 2) topForegroundCount++;
      else bottomForegroundCount++;

      rSum += r;
      gSum += g;
      bSum += b;
      brightnessSum += brightness;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      saturationSum += sat;

      foregroundPixels.push({ r, g, b });

      // Warm/cool classification (only for saturated pixels)
      if (sat > 0.15) {
        if (r > g && r > b) warmCount++;
        else if (b > r || (g > r && g > b)) coolCount++;
      }
    }
  }

  if (foregroundCount === 0) foregroundCount = 1;

  const avgBrightness = brightnessSum / foregroundCount;
  const avgSaturation = saturationSum / foregroundCount;

  // --- Colour variance (standard deviation of RGB values) ---
  const avgR = rSum / foregroundCount;
  const avgG = gSum / foregroundCount;
  const avgB = bSum / foregroundCount;
  let variance = 0;

  for (const px of foregroundPixels) {
    variance += (px.r - avgR) ** 2 + (px.g - avgG) ** 2 + (px.b - avgB) ** 2;
  }
  variance = Math.sqrt(variance / (foregroundCount * 3));

  // --- Simple k-means clustering (k=4) ---
  const clusters = kMeansClusters(foregroundPixels, 4);

  // --- Shape & Category Fallback Heuristic ---
  const topVsBottomRatio = topForegroundCount / Math.max(bottomForegroundCount, 1);
  let inferredCategoryFallback = 'shirt';

  if (aspectRatio > 1.35) {
    // Tall/Vertical garment
    if (topVsBottomRatio < 0.45) {
      inferredCategoryFallback = 'bottoms'; // Pants / trousers / skirt
    } else if (topVsBottomRatio >= 0.45 && topVsBottomRatio <= 1.4) {
      inferredCategoryFallback = 'dress';   // Full-length dress / gown
    } else {
      inferredCategoryFallback = 'shirt';
    }
  } else {
    // Square / Wide garment
    if (variance > 45 || avgBrightness < 80) {
      inferredCategoryFallback = 'jacket';
    } else if (avgSaturation > 0.3) {
      inferredCategoryFallback = 't-shirt';
    } else {
      inferredCategoryFallback = 'shirt';
    }
  }

  return {
    colourClusters: clusters,
    brightness: Math.round(avgBrightness),
    saturation: Math.round(avgSaturation * 1000) / 1000,
    colourVariance: Math.round(variance * 100) / 100,
    warmRatio: warmCount / foregroundCount,
    coolRatio: coolCount / foregroundCount,
    aspectRatio: Math.round(aspectRatio * 100) / 100,
    inferredCategoryFallback,
  };
}

/**
 * Simple k-means colour clustering.  Good enough for detecting dominant
 * colours and separating garment from background remnants.
 */
function kMeansClusters(
  pixels: Array<{ r: number; g: number; b: number }>,
  k: number,
  iterations = 8,
): Array<{ r: number; g: number; b: number; weight: number }> {
  if (pixels.length === 0) {
    return [{ r: 128, g: 128, b: 128, weight: 1 }];
  }

  // Initialise centroids with evenly-spaced samples
  const step = Math.max(1, Math.floor(pixels.length / k));
  const centroids = Array.from({ length: k }, (_, i) => {
    const px = pixels[Math.min(i * step, pixels.length - 1)];
    return { r: px.r, g: px.g, b: px.b };
  });

  const assignments = new Int32Array(pixels.length);

  for (let iter = 0; iter < iterations; iter++) {
    // Assign pixels to nearest centroid
    for (let i = 0; i < pixels.length; i++) {
      let minDist = Infinity;
      for (let c = 0; c < k; c++) {
        const dr = pixels[i].r - centroids[c].r;
        const dg = pixels[i].g - centroids[c].g;
        const db = pixels[i].b - centroids[c].b;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < minDist) {
          minDist = dist;
          assignments[i] = c;
        }
      }
    }

    // Update centroids
    const sums = Array.from({ length: k }, () => ({ r: 0, g: 0, b: 0, n: 0 }));
    for (let i = 0; i < pixels.length; i++) {
      const c = assignments[i];
      sums[c].r += pixels[i].r;
      sums[c].g += pixels[i].g;
      sums[c].b += pixels[i].b;
      sums[c].n++;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c].n > 0) {
        centroids[c].r = Math.round(sums[c].r / sums[c].n);
        centroids[c].g = Math.round(sums[c].g / sums[c].n);
        centroids[c].b = Math.round(sums[c].b / sums[c].n);
      }
    }
  }

  // Compute cluster weights
  const counts = new Array(k).fill(0);
  for (let i = 0; i < pixels.length; i++) counts[assignments[i]]++;
  const total = pixels.length;

  return centroids
    .map((c, i) => ({
      r: c.r,
      g: c.g,
      b: c.b,
      weight: Math.round((counts[i] / total) * 1000) / 1000,
    }))
    .filter((c) => c.weight > 0.02)      // drop negligible clusters
    .sort((a, b) => b.weight - a.weight); // most prominent first
}

/* ================================================================== */
/*  Gemini Vision analysis with model fallback chain                   */
/* ================================================================== */

const GEMINI_PROMPT = `You are a fashion garment classifier. Analyse this garment image and respond with ONLY a JSON object (no markdown, no explanation) containing these fields:

{
  "category": one of: "shirt", "t-shirt", "dress", "jacket", "bottoms", "swatshirt", "sweater", "unknown"
  "style": one of: "formal", "casual", "sporty", "elegant", "streetwear", "unknown"
  "pattern": one of: "solid", "striped", "plaid", "floral", "printed", "check", "denim", "unknown"
  "material": one of: "cotton", "silk", "denim", "linen", "wool", "jersey", "satin", "chiffon", "unknown"
  "season": one of: "summer", "winter", "all-season"
  "colourDescription": a short description of the garment's primary colour(s), e.g. "dark navy blue", "light pastel pink", "red and white striped"
}

Important rules:
- "shirt" means button-up shirts and blouses
- "t-shirt" means casual pullover tops, tees, polos
- "bottoms" includes pants, jeans, shorts, skirts, trousers
- "jacket" includes blazers, coats, hoodies, cardigans
- "sweatshirt" includes sweatshirts and hooded sweatshirts
- "sweater" includes sweaters and pullovers
- If the image is not a garment, set all fields to "unknown"
- Respond with ONLY the JSON object, nothing else`;

/** Candidate Gemini models to try in order when encountering 429 rate limits or 404 model name mismatches */
const CANDIDATE_GEMINI_MODELS = [
  'gemini-3.6-flash',
  
];

async function classifyWithGemini(
  imageBase64: string,
  mimeType: string,
): Promise<GeminiGarmentLabels | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const genAI = new GoogleGenerativeAI(apiKey);
  const base64Data = imageBase64.includes(',')
    ? imageBase64.split(',')[1]
    : imageBase64;

  for (const modelName of CANDIDATE_GEMINI_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        GEMINI_PROMPT,
        {
          inlineData: {
            data: base64Data,
            mimeType,
          },
        },
      ]);

      const text = result.response.text().trim();
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      return {
        category: parsed.category ?? 'unknown',
        style: parsed.style ?? 'unknown',
        pattern: parsed.pattern ?? 'unknown',
        material: parsed.material ?? 'unknown',
        season: parsed.season ?? 'all-season',
        colourDescription: parsed.colourDescription ?? 'unknown',
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const isRetryable =
        msg.includes('429') ||
        msg.includes('404') ||
        msg.includes('Quota exceeded') ||
        msg.includes('TOO_MANY_REQUESTS') ||
        msg.includes('not found');

      if (isRetryable) {
        console.warn(`[visual-search] ${modelName} unavailable/rate-limited, trying next candidate model...`);
        continue;
      }

      console.error(`[visual-search] Gemini classification error with ${modelName}:`, error);
      break;
    }
  }

  console.warn('[visual-search] All Gemini models rate-limited or unavailable; falling back to Sharp image geometry & pixel analysis.');
  return null;
}

/* ================================================================== */
/*  Public: full image analysis pipeline                                */
/* ================================================================== */

/**
 * Analyse an uploaded garment image.
 *
 * 1. Uses sharp to extract pixel-level statistics (colour clusters,
 *    brightness, saturation, variance, aspect ratio, shape heuristics).
 * 2. Uses Gemini Vision (with automatic model fallback chain for 429 quota)
 *    to classify garment attributes.
 */
export async function analyseImage(
  imageBase64: string,
  mimeType: string = 'image/jpeg',
): Promise<ImageAnalysisResult> {
  const base64Data = imageBase64.includes(',')
    ? imageBase64.split(',')[1]
    : imageBase64;

  const buf = Buffer.from(base64Data, 'base64');

  // Extract original image aspect ratio
  const metadata = await sharp(buf).metadata();
  const originalWidth = metadata.width || 1;
  const originalHeight = metadata.height || 1;
  const aspectRatio = originalHeight / originalWidth;

  const { data: rawPixels, info } = await sharp(buf)
    .resize(96, 96, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Pixel and shape analysis
  const pixelStats = analysePixelData(rawPixels, info.width, info.height, aspectRatio);

  // Gemini classification with rate limit fallback chain
  const geminiLabels = await classifyWithGemini(imageBase64, mimeType);

  return {
    ...pixelStats,
    geminiLabels,
  };
}

