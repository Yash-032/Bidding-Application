import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '@/lib/prisma';
import { CatalogService } from '@/lib/catalog/catalog.service';
import { CategoryService, normalizeCategoryPath } from '@/lib/catalog/category.service';
import { processProductImage } from '@/lib/protected-images/processor';

/**
 * Garment batch processing CLI script
 * 
 * Usage:
 *   npx tsx scripts/bulk-create-garments.ts --folder <FOLDER_PATH> --targetEmail <MODEL_EMAIL> --sellerEmail <SELLER_EMAIL> [--manifest-only] [--startIndex <INDEX>] [--startFolder <FOLDER>] [--onlyFolder <FOLDER>] [--limit <COUNT>]
 * 
 * Or with User IDs:
 *   npx tsx scripts/bulk-create-garments.ts --folder <FOLDER_PATH> --targetUserId <MODEL_ID> --sellerId <SELLER_ID> [--startIndex 42]
 */

const catalogService = new CatalogService();
const categoryService = new CategoryService();

interface SelectedPhotos {
  hangerFront: string;
  hangerBack: string | null;
  modelFront: string;
  modelBack: string;
  randomModelPhotos: string[];
}

interface GarmentManifestItem {
  folderName: string;
  folderPath: string;
  photos: SelectedPhotos;
  metadata: {
    title: string;
    description: string;
    priceInRupees: number;
    categoryName: string;
    categoryPath: string;
    availableSizes: string[];
  };
  stockQuantity: number; // Always 1
  targetUserId: string;
  targetUserEmail?: string;
  sellerId: string;
  sellerEmail?: string;
}

interface SkippedFolderReport {
  folderName: string;
  folderPath: string;
  reason: string;
}

const GEMINI_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.1-pro-preview',
  'gemini-2.0-flash-exp',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-8b',
  'gemini-2.0-flash-lite-preview-02-05',
];

const DEFAULT_CATEGORIES = [
  'Shirt',
  'T-Shirt',
  'Sweatshirt',
  'Dress',
  'Jacket',
  'Bottoms',
  'Accessories',
  'Miscellaneous',
];

/**
 * Case-insensitive search for a subfolder matching a keyword (e.g. 'hanger' or 'photo')
 */
function findSubfolder(parentDir: string, keyword: string): string | null {
  if (!fs.existsSync(parentDir)) return null;
  const entries = fs.readdirSync(parentDir, { withFileTypes: true });
  const matched = entries.find(
    (e) => e.isDirectory() && e.name.toLowerCase().includes(keyword.toLowerCase())
  );
  return matched ? path.join(parentDir, matched.name) : null;
}

/**
 * Resolve user ID from either an email or a direct user UUID.
 * Gracefully handles offline DB connection in --manifest-only mode.
 */
async function resolveUserId(idOrEmail: string | null, roleLabel: string): Promise<{ id: string; email?: string }> {
  if (!idOrEmail) throw new Error(`Missing ${roleLabel}. Provide either email or user ID.`);
  
  const trimmed = idOrEmail.trim();

  try {
    if (trimmed.includes('@')) {
      const user = await prisma.user.findUnique({
        where: { email: trimmed.toLowerCase() },
        select: { id: true, email: true },
      });
      if (user) return { id: user.id, email: user.email };
      console.warn(`[User Lookup] Email "${trimmed}" not found in database. Using email string in manifest.`);
      return { id: trimmed, email: trimmed };
    }

    const user = await prisma.user.findUnique({
      where: { id: trimmed },
      select: { id: true, email: true },
    });
    if (user) return { id: user.id, email: user.email || undefined };
    return { id: trimmed };
  } catch (err: any) {
    if (err?.code === 'ECONNREFUSED' || String(err).includes('ECONNREFUSED')) {
      console.warn(`[Database Offline] PostgreSQL connection refused. Storing email/ID "${trimmed}" in manifest.`);
      return { id: trimmed, email: trimmed.includes('@') ? trimmed : undefined };
    }
    console.warn(`[User Lookup Warning] ${err.message || err}. Storing "${trimmed}" in manifest.`);
    return { id: trimmed, email: trimmed.includes('@') ? trimmed : undefined };
  }
}

/**
 * Scan PHOTOS folder to find Front, Back, and Random extra model photos.
 * 
 * FRONT & BACK SELECTION RULES:
 * 1. Sort all image files in PHOTOS folder alphabetically (01.jpg, 02.jpg, ...).
 * 2. Scans for explicit 'F' or 'FRONT' and 'B' or 'BACK' in filename:
 *    - FRONT: matching 'front', 'F' (case-insensitive filename marker e.g., '01_F', '-F-', 'F.jpg')
 *    - BACK:  matching 'back', 'B' (case-insensitive filename marker e.g., '02_B', '-B-', 'B.jpg')
 * 3. Fallback heuristic (if no explicit 'F' or 'B' name matches):
 *    - FRONT: Choose photo #1 (index 0)
 *    - BACK: Choose photo #5 or #6 (index 4 or 5 if available, else last available photo)
 */
function parseModelPhotos(photosDirPath: string): { modelFront: string; modelBack: string; randomModelPhotos: string[] } | null {
  if (!fs.existsSync(photosDirPath)) return null;

  const entries = fs.readdirSync(photosDirPath, { withFileTypes: true });
  const imageFiles = entries
    .filter((e) => e.isFile() && /\.(jpe?g|png|webp|avif)$/i.test(e.name))
    .map((e) => path.join(photosDirPath, e.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true, sensitivity: 'base' }));

  if (imageFiles.length === 0) return null;

  // 1. Check explicit FRONT match (contains 'front' or delimited/standalone 'F')
  let frontIdx = imageFiles.findIndex((p) => {
    const name = path.basename(p, path.extname(p));
    return /front/i.test(name) || /(?:^|_|-|\s)f(?:$|_|-|\s|[0-9])/i.test(name);
  });

  // 2. Check explicit BACK match (contains 'back' or delimited/standalone 'B')
  let backIdx = imageFiles.findIndex((p) => {
    const name = path.basename(p, path.extname(p));
    return /back/i.test(name) || /(?:^|_|-|\s)b(?:$|_|-|\s|[0-9])/i.test(name);
  });

  // Fallback if FRONT not matched by name -> Pick photo #1 (index 0)
  if (frontIdx === -1) {
    frontIdx = 0;
  }

  // Fallback if BACK not matched by name -> Pick photo #5 or #6 (index 5 or 4, or last available photo)
  if (backIdx === -1) {
    if (imageFiles.length >= 6) {
      backIdx = 5; // #6 photo
    } else if (imageFiles.length >= 5) {
      backIdx = 4; // #5 photo
    } else {
      backIdx = Math.max(0, imageFiles.length - 1); // Last available photo
    }
  }

  const modelFront = imageFiles[frontIdx];
  const modelBack = imageFiles[backIdx];

  // 3. Select 3-4 random extra photos excluding Front & Back
  const remaining = imageFiles.filter((p) => p !== modelFront && p !== modelBack);
  const shuffled = [...remaining].sort(() => Math.random() - 0.5);
  const randomCount = Math.min(Math.max(3, Math.floor(Math.random() * 2) + 3), shuffled.length);
  const randomModelPhotos = shuffled.slice(0, randomCount);

  return { modelFront, modelBack, randomModelPhotos };
}

/**
 * Parse a single garment folder (e.g. 01_FS_SB)
 */
function parseGarmentFolder(garmentDirPath: string): { photos: SelectedPhotos } | { error: string } {
  const folderName = path.basename(garmentDirPath);

  // 1. Flexibly find HANGER / HANGERS directory (e.g. HANGER, HANGERS, Hanger, Hangers)
  const hangerDir = findSubfolder(garmentDirPath, 'hanger');
  if (!hangerDir) {
    return { error: 'Missing HANGER / HANGERS directory' };
  }

  // Look for '01' subfolder or use hangerDir directly if images exist inside hangerDir
  const hanger01Dir = findSubfolder(hangerDir, '01') || findSubfolder(hangerDir, '1') || hangerDir;

  const hangerEntries = fs.readdirSync(hanger01Dir, { withFileTypes: true });
  const hangerFiles = hangerEntries.filter((e) => e.isFile() && /\.(jpe?g|png|webp|avif)$/i.test(e.name));

  const hangerFrontFile = hangerFiles.find((e) => /^f\.(jpe?g|png|webp|avif)$/i.test(e.name) || /front|hanger_f|_f\./i.test(e.name));
  if (!hangerFrontFile) {
    const relPath = path.relative(garmentDirPath, hanger01Dir);
    return { error: `Missing required hanger front image (F.jpg or F.png) in ${relPath}` };
  }

  const hangerFront = path.join(hanger01Dir, hangerFrontFile.name);

  const hangerBackFile = hangerFiles.find((e) => /^b\.(jpe?g|png|webp|avif)$/i.test(e.name) || /back|hanger_b|_b\./i.test(e.name));
  const hangerBack = hangerBackFile ? path.join(hanger01Dir, hangerBackFile.name) : null;

  // 2. Flexibly find PHOTO / PHOTOS directory (e.g. PHOTO, PHOTOS, Photo, Photos)
  const photosDir = findSubfolder(garmentDirPath, 'photo');
  if (!photosDir) {
    return { error: 'Missing PHOTO / PHOTOS directory' };
  }

  const modelPhotos = parseModelPhotos(photosDir);
  if (!modelPhotos) {
    const relPath = path.relative(garmentDirPath, photosDir);
    return { error: `Missing or empty image files in ${relPath}` };
  }

  return {
    photos: {
      hangerFront,
      hangerBack,
      modelFront: modelPhotos.modelFront,
      modelBack: modelPhotos.modelBack,
      randomModelPhotos: modelPhotos.randomModelPhotos,
    },
  };
}

/**
 * Helper to retrieve all available Gemini API keys from environment variables.
 * Supports:
 * - Comma-separated keys in GEMINI_API_KEYS or GEMINI_API_KEY (e.g. GEMINI_API_KEY=key1,key2,key3)
 * - Numbered env variables: GEMINI_API_KEY_1, GEMINI_API_KEY_2, etc.
 */
function getGeminiApiKeys(): string[] {
  const keys: string[] = [];

  const rawEnv = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
  if (rawEnv) {
    rawEnv
      .split(',')
      .map((k) => k.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean)
      .forEach((k) => {
        if (!keys.includes(k)) keys.push(k);
      });
  }

  Object.keys(process.env).forEach((envKey) => {
    if (/^GEMINI_API_KEY_\d+$/i.test(envKey) && process.env[envKey]) {
      const val = process.env[envKey]!.trim().replace(/^["']|["']$/g, '');
      if (val && !keys.includes(val)) {
        keys.push(val);
      }
    }
  });

  return keys;
}

// Track active API key index across calls during script execution
let currentApiKeyIndex = 0;

/**
 * Call Gemini Vision using ONLY HANGER images (F and B)
 */
async function generateGeminiMetadata(
  photos: SelectedPhotos,
  existingCategoryNames: string[],
): Promise<{ title: string; description: string; priceInRupees: number; categoryName: string; availableSizes: string[] }> {
  const apiKeys = getGeminiApiKeys();
  if (apiKeys.length === 0) {
    console.warn('[Gemini] No GEMINI_API_KEY found in environment. Using fallback metadata generator.');
    return {
      title: 'Fashion Garment',
      description: 'High-quality stylish fashion garment tailored for a premium look.',
      priceInRupees: 2499,
      categoryName: existingCategoryNames[0] || 'T-Shirt',
      availableSizes: ['S', 'M', 'L', 'XL'],
    };
  }

  // Read HANGER Front image (do not rotate)
  let frontBuf = fs.readFileSync(photos.hangerFront);
  if (frontBuf.length > 12 * 1024 * 1024) {
    frontBuf = await sharp(frontBuf)
      .resize({ width: 3840, height: 3840, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
  }

  const frontExt = path.extname(photos.hangerFront).replace('.', '').toLowerCase();
  const frontMime = frontExt === 'png' ? 'image/png' : frontExt === 'webp' ? 'image/webp' : 'image/jpeg';

  const contents: any[] = [
    `You are a high-end fashion catalog curator. Analyze the attached HANGER image(s) of this garment (front view and optional back view).
DO NOT guess based on model photos (only hanger images are provided).

STRICT CATEGORY SELECTION RULE:
You MUST choose the "categoryName" ONLY from the list of valid website categories below.
DO NOT invent, combine, or create any new category names under any circumstances!
Category creation is strictly prohibited for AI.

List of valid website categories:
${existingCategoryNames.map((c) => `- ${c}`).join('\n')}

Respond with ONLY a valid JSON object (no markdown, no preamble, no markdown backticks) with the following structure:
{
  "title": "A short, stylish, premium product title (e.g. 'Classic Tailored Navy Single-Breasted Blazer')",
  "description": "A comprehensive, appealing product description highlighting material, cut, silhouette, and styling options.",
  "priceInRupees": 2499, // Integer value between 999 and 7999 INR depending on quality/garment type
  "categoryName": "Choose EXACT category name from the valid list above",
  "availableSizes": ["S", "M", "L", "XL"]
}`,
    {
      inlineData: {
        data: frontBuf.toString('base64'),
        mimeType: frontMime,
      },
    },
  ];

  // If HANGER Back image exists, attach it as well
  if (photos.hangerBack && fs.existsSync(photos.hangerBack)) {
    let backBuf = fs.readFileSync(photos.hangerBack);
    if (backBuf.length > 12 * 1024 * 1024) {
      backBuf = await sharp(backBuf)
        .resize({ width: 3840, height: 3840, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer();
    }
    const backExt = path.extname(photos.hangerBack).replace('.', '').toLowerCase();
    const backMime = backExt === 'png' ? 'image/png' : backExt === 'webp' ? 'image/webp' : 'image/jpeg';
    contents.push({
      inlineData: {
        data: backBuf.toString('base64'),
        mimeType: backMime,
      },
    });
  }

  // Outer retry loop (up to 3 global attempts) for rate limits across keys/models
  const MAX_GLOBAL_RETRIES = 3;
  for (let globalAttempt = 1; globalAttempt <= MAX_GLOBAL_RETRIES; globalAttempt++) {
    const keysCount = apiKeys.length;
    let hitAnyRateLimit = false;

    for (let keyAttempt = 0; keyAttempt < keysCount; keyAttempt++) {
      const keyIndex = (currentApiKeyIndex + keyAttempt) % keysCount;
      const apiKey = apiKeys[keyIndex];
      const genAI = new GoogleGenerativeAI(apiKey);

      for (const modelName of GEMINI_MODELS) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(contents);
          const text = result.response.text().trim();
          const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
          const parsed = JSON.parse(cleaned);

          // Keep using this working key index for subsequent items
          currentApiKeyIndex = keyIndex;

          return {
            title: parsed.title || 'Tailored Garment',
            description: parsed.description || 'Premium fashion item.',
            priceInRupees: Number(parsed.priceInRupees) || 2499,
            categoryName: parsed.categoryName || existingCategoryNames[0] || 'T-Shirt',
            availableSizes: Array.isArray(parsed.availableSizes) && parsed.availableSizes.length ? parsed.availableSizes : ['S', 'M', 'L', 'XL'],
          };
        } catch (err: any) {
          const isRateLimit =
            err?.status === 429 ||
            err?.message?.includes('429') ||
            err?.message?.toLowerCase().includes('quota') ||
            err?.message?.toLowerCase().includes('rate limit') ||
            err?.message?.toLowerCase().includes('resource_exhausted');

          if (isRateLimit) hitAnyRateLimit = true;

          console.warn(
            `[Gemini] Model "${modelName}" with Key #${keyIndex + 1} failed (${isRateLimit ? 'Rate limit / Quota exceeded' : err.message}).`
          );
        }
      }
      if (keysCount > 1) {
        console.warn(`[Gemini] Key #${keyIndex + 1} exhausted models. Switching to next API key...`);
      }
    }

    if (hitAnyRateLimit && globalAttempt < MAX_GLOBAL_RETRIES) {
      console.warn(`[Gemini] All keys/models hit rate limits. Waiting 5s before retry (Attempt ${globalAttempt}/${MAX_GLOBAL_RETRIES})...`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  return {
    title: 'Tailored Garment',
    description: 'High quality fashionable garment.',
    priceInRupees: 2499,
    categoryName: existingCategoryNames[0] || 'T-Shirt',
    availableSizes: ['S', 'M', 'L', 'XL'],
  };
}

/**
 * Resolve category strictly from existing database categories (NEVER creates a new category)
 */
async function resolveCategory(categoryNameInput: string): Promise<{ id: string; name: string; path: string }> {
  const normPath = normalizeCategoryPath(categoryNameInput);
  
  // 1. Try finding by path or exact case-insensitive name match
  let category = await prisma.category.findFirst({
    where: { OR: [{ path: normPath }, { name: { equals: categoryNameInput, mode: 'insensitive' } }], isActive: true },
  });

  if (category) return category;

  // 2. If unmapped, fallback to 'T-Shirt' or first active category in database (NEVER CREATE NEW CATEGORY)
  let fallback = await prisma.category.findFirst({
    where: { OR: [{ path: 't-shirt' }, { name: { contains: 'T-Shirt', mode: 'insensitive' } }], isActive: true },
  });

  if (!fallback) {
    fallback = await prisma.category.findFirst({ where: { isActive: true } });
  }

  if (!fallback) {
    throw new Error('No active categories found in database.');
  }

  return fallback;
}

/**
 * Clean up existing duplicate product records in database for a target user
 */
async function cleanupDuplicates(targetUserId: string) {
  try {
    const products = await prisma.product.findMany({
      where: { targetUserId, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true },
    });

    const seenTitles = new Set<string>();
    const duplicateIds: string[] = [];

    for (const p of products) {
      if (seenTitles.has(p.title)) {
        duplicateIds.push(p.id);
      } else {
        seenTitles.add(p.title);
      }
    }

    if (duplicateIds.length > 0) {
      console.log(`🧹 Deduplicating: Deactivating ${duplicateIds.length} duplicate product records...`);
      await prisma.product.updateMany({
        where: { id: { in: duplicateIds } },
        data: { isActive: false },
      });
    }
  } catch {
    // Ignore cleanup errors if DB offline
  }
}

/**
 * Main script runner
 */
async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };

  const rootFolder = getArg('--folder');
  const targetEmail = getArg('--targetEmail') || getArg('--targetUserEmail') || getArg('--targetUserId');
  const sellerEmail = getArg('--sellerEmail') || getArg('--sellerUserEmail') || getArg('--sellerId');
  const manifestOnly = args.includes('--manifest-only');
  const manifestPathInput = getArg('--manifest');
  const startIndexArg = getArg('--startIndex') || getArg('--startFrom') || getArg('--offset');
  const startFolderArg = getArg('--startFolder') || getArg('--folderName');
  const onlyFolderArg = getArg('--onlyFolder') || getArg('--filter');
  const limitArg = getArg('--limit') || getArg('--max');
  const delayArg = getArg('--delay');
  const interItemDelayMs = delayArg !== null && !isNaN(parseInt(delayArg, 10)) ? parseInt(delayArg, 10) : 500;

  if (!manifestPathInput && (!rootFolder || !targetEmail || !sellerEmail)) {
    console.error(`
Usage:
  npx tsx scripts/bulk-create-garments.ts --folder <PATH> --targetEmail <MODEL_EMAIL> --sellerEmail <SELLER_EMAIL> [options]

Options:
  --folder        Absolute path to the model root directory containing garment folders.
  --targetEmail   Email of the model user to assign garments to (or --targetUserId).
  --sellerEmail   Email of the seller creating the products (or --sellerId).
  --startIndex    Start processing from 1-based folder index (e.g. --startIndex 42).
  --startFolder   Start processing from subfolder matching name/number (e.g. --startFolder 42 or 42_FS_SB).
  --onlyFolder    Process ONLY subfolder matching name/number (e.g. --onlyFolder 42).
  --limit         Limit total number of folders to process (e.g. --limit 10).
  --delay         Delay in ms between folder API calls to avoid rate limits (default: 500ms).
  --manifest-only Only generate 'garments_manifest.json' without committing to database.
  --manifest      Path to existing 'garments_manifest.json' to execute ingestion directly.
`);
    process.exit(1);
  }

  // Phase A: Ingestion from an existing manifest file
  if (manifestPathInput) {
    if (!fs.existsSync(manifestPathInput)) {
      console.error(`Manifest file not found: ${manifestPathInput}`);
      process.exit(1);
    }
    console.log(`Reading manifest file: ${manifestPathInput}...`);
    const manifestItems: GarmentManifestItem[] = JSON.parse(fs.readFileSync(manifestPathInput, 'utf8'));
    await ingestManifest(manifestItems);
    return;
  }

  // Resolve target model user and seller user IDs/emails
  console.log(`Resolving user details...`);
  const resolvedTargetUser = await resolveUserId(targetEmail, 'Target Model User');
  const resolvedSeller = await resolveUserId(sellerEmail, 'Seller User');

  const absoluteRoot = path.resolve(rootFolder!);
  if (!fs.existsSync(absoluteRoot)) {
    console.error(`Root folder does not exist: ${absoluteRoot}`);
    process.exit(1);
  }

  const modelName = path.basename(absoluteRoot);
  console.log(`\n======================================================`);
  console.log(`  GARMENT CREATION PIPELINE FOR MODEL: "${modelName}"`);
  console.log(`======================================================\n`);

  // Fetch active categories from website/database (or fallback if offline)
  let categoryNames = DEFAULT_CATEGORIES;
  try {
    const activeCategories = await prisma.category.findMany({
      where: { isActive: true },
      select: { name: true, path: true },
    });
    if (activeCategories.length > 0) {
      categoryNames = activeCategories.map((c) => c.name);
    }
  } catch {
    console.warn('[Database Offline] Using default category list for Gemini analysis.');
  }

  // Scan root directory for garment subfolders & sort naturally
  const entries = fs.readdirSync(absoluteRoot, { withFileTypes: true });
  let allGarmentDirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => path.join(absoluteRoot, e.name))
    .sort((a, b) =>
      path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true, sensitivity: 'base' })
    );

  if (allGarmentDirs.length === 0) {
    console.error(`No subfolders found in root folder: ${absoluteRoot}`);
    process.exit(1);
  }

  let startingIndex = 0; // 0-based internal index

  if (startFolderArg) {
    const targetFolder = startFolderArg.trim().toLowerCase();
    const foundIdx = allGarmentDirs.findIndex((dirPath) => {
      const name = path.basename(dirPath).toLowerCase();
      return (
        name === targetFolder ||
        name.startsWith(targetFolder + '_') ||
        name.startsWith(targetFolder + '-') ||
        name.startsWith(targetFolder + ' ') ||
        name.includes(targetFolder)
      );
    });
    if (foundIdx !== -1) {
      startingIndex = foundIdx;
      console.log(`📌 Found starting folder "${path.basename(allGarmentDirs[foundIdx])}" at position #${foundIdx + 1} of ${allGarmentDirs.length}`);
    } else {
      console.error(`❌ Could not find subfolder matching "${startFolderArg}" in ${absoluteRoot}`);
      process.exit(1);
    }
  } else if (startIndexArg) {
    const parsedIndex = parseInt(startIndexArg, 10);
    if (isNaN(parsedIndex) || parsedIndex < 1) {
      console.error(`Invalid --startIndex value: "${startIndexArg}". Must be a positive integer (e.g. 1, 42).`);
      process.exit(1);
    }
    startingIndex = Math.min(parsedIndex - 1, allGarmentDirs.length - 1);
    console.log(`📌 Starting process from folder #${startingIndex + 1} ("${path.basename(allGarmentDirs[startingIndex])}") out of ${allGarmentDirs.length}`);
  }

  let garmentDirs = allGarmentDirs;

  if (onlyFolderArg) {
    const filterTerm = onlyFolderArg.trim().toLowerCase();
    const filtered = allGarmentDirs.filter((dirPath) => {
      const name = path.basename(dirPath).toLowerCase();
      return name === filterTerm || name.startsWith(filterTerm + '_') || name.startsWith(filterTerm + '-') || name.includes(filterTerm);
    });
    if (filtered.length === 0) {
      console.error(`❌ No subfolders found matching filter term "${onlyFolderArg}"`);
      process.exit(1);
    }
    garmentDirs = filtered;
    console.log(`🎯 Filtered to ${garmentDirs.length} specific folder(s) matching "${onlyFolderArg}"`);
  } else if (startingIndex > 0) {
    garmentDirs = allGarmentDirs.slice(startingIndex);
  }

  if (limitArg) {
    const parsedLimit = parseInt(limitArg, 10);
    if (!isNaN(parsedLimit) && parsedLimit > 0) {
      garmentDirs = garmentDirs.slice(0, parsedLimit);
      console.log(`⏱️ Limit applied: Processing ${garmentDirs.length} folder(s).`);
    }
  }

  const manifestItems: GarmentManifestItem[] = [];
  const skippedFolders: SkippedFolderReport[] = [];

  console.log(`Found ${garmentDirs.length} potential garment folders. Parsing images & generating Gemini metadata...\n`);

  for (let i = 0; i < garmentDirs.length; i++) {
    const dirPath = garmentDirs[i];
    const folderName = path.basename(dirPath);

    if (interItemDelayMs > 0 && i > 0) {
      await new Promise((r) => setTimeout(r, interItemDelayMs));
    }

    process.stdout.write(`[${i + 1}/${garmentDirs.length}] Processing folder: ${folderName}... `);

    const parseResult = parseGarmentFolder(dirPath);

    if ('error' in parseResult) {
      console.log(`❌ SKIPPED (${parseResult.error})`);
      skippedFolders.push({
        folderName,
        folderPath: dirPath,
        reason: parseResult.error,
      });
      continue;
    }

    const { photos } = parseResult;

    // Call Gemini using ONLY HANGER photos (as per explicit instruction)
    const metadata = await generateGeminiMetadata(photos, categoryNames);
    const categoryPath = normalizeCategoryPath(metadata.categoryName);

    manifestItems.push({
      folderName,
      folderPath: dirPath,
      photos,
      metadata: {
        ...metadata,
        categoryPath,
      },
      stockQuantity: 1, // ALWAYS 1
      targetUserId: resolvedTargetUser.id,
      targetUserEmail: resolvedTargetUser.email || targetEmail || undefined,
      sellerId: resolvedSeller.id,
      sellerEmail: resolvedSeller.email || sellerEmail || undefined,
    });

    console.log(`✅ READY ("${metadata.title}" -> ${metadata.categoryName}, ₹${metadata.priceInRupees})`);
  }

  // Save garments_manifest.json
  const manifestFileName = `garments_manifest_${modelName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.json`;
  const manifestPath = path.join(process.cwd(), manifestFileName);
  fs.writeFileSync(manifestPath, JSON.stringify(manifestItems, null, 2));

  console.log(`\n======================================================`);
  console.log(`  PROCESSING SUMMARY FOR MODEL: "${modelName}"`);
  console.log(`======================================================`);
  console.log(` Total garment folders scanned : ${garmentDirs.length}`);
  console.log(` Successfully prepared garments : ${manifestItems.length}`);
  console.log(` Skipped / Incomplete folders   : ${skippedFolders.length}`);
  console.log(` Manifest JSON saved to         : ${manifestPath}\n`);

  if (skippedFolders.length > 0) {
    console.log(`⚠️  FOLDERS LEFT TO ADD ON (${skippedFolders.length} folders skipped):`);
    console.log(`------------------------------------------------------`);
    skippedFolders.forEach((sf, idx) => {
      console.log(` ${idx + 1}. [${sf.folderName}] -> Reason: ${sf.reason}`);
    });
    console.log(`------------------------------------------------------\n`);
  }

  if (manifestOnly) {
    console.log(`[Manifest Only Mode] Completed. You can review '${manifestFileName}' and run with --manifest '${manifestFileName}' when ready.`);
    return;
  }

  // Phase B: Upload photos & Create products in backend DB
  console.log(`Proceeding to backend route ingestion & database creation...\n`);
  await ingestManifest(manifestItems);
}

/**
 * Ingest ready manifest items into database & upload protected images
 */
async function ingestManifest(items: GarmentManifestItem[]) {
  let createdCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`[${i + 1}/${items.length}] Ingesting product: "${item.metadata.title}" (${item.folderName})...`);

    try {
      // Ensure targetUserId and sellerId are actual UUIDs in DB before ingestion
      let targetUserId = item.targetUserId;
      if (targetUserId.includes('@') || item.targetUserEmail) {
        const email = item.targetUserEmail || targetUserId;
        const res = await resolveUserId(email, 'Target Model User');
        targetUserId = res.id;
      }

      let sellerId = item.sellerId;
      if (sellerId.includes('@') || item.sellerEmail) {
        const email = item.sellerEmail || sellerId;
        const res = await resolveUserId(email, 'Seller User');
        sellerId = res.id;
      }

      // Cleanup any duplicate product previously created with exact same title
      await cleanupDuplicates(targetUserId);

      // Check if product with title & targetUserId already exists
      const existingProduct = await prisma.product.findFirst({
        where: {
          targetUserId,
          title: item.metadata.title,
          isActive: true,
        },
      });

      if (existingProduct) {
        console.log(`   └─ ⏭️ Product "${item.metadata.title}" already exists in database (ID: ${existingProduct.id}). Skipping duplicate creation.`);
        createdCount++;
        continue;
      }

      // viewType mapping:
      // Front photo -> 'FRONT'
      // Back photo -> 'BACK'
      // All other photos (hanger front & extra model photos) -> 'MODEL'
      const imageUploadQueue: Array<{ filePath: string; viewType: string }> = [
        { filePath: item.photos.modelFront, viewType: 'FRONT' },
        { filePath: item.photos.modelBack, viewType: 'BACK' },
        { filePath: item.photos.hangerFront, viewType: 'MODEL' },
      ];

      for (const randomPhoto of item.photos.randomModelPhotos) {
        imageUploadQueue.push({ filePath: randomPhoto, viewType: 'MODEL' });
      }

      const protectedImageIds: string[] = [];
      const imageViews: Array<{ id: string; viewType: string }> = [];

      // Process each image via protected image processor (no rotation applied)
      for (const img of imageUploadQueue) {
        if (!fs.existsSync(img.filePath)) continue;
        let buf = fs.readFileSync(img.filePath);

        // Auto-downscale large studio image files (>12MB) to stay within upload limits
        if (buf.length > 12 * 1024 * 1024) {
          console.log(`   └─ 📷 Auto-downscaling large image file (${(buf.length / 1024 / 1024).toFixed(1)} MB): ${path.basename(img.filePath)}...`);
          buf = await sharp(buf)
            .resize({ width: 3840, height: 3840, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 90 })
            .toBuffer();
        }

        const processed = await processProductImage(buf);

        await prisma.productImage.create({
          data: {
            id: processed.id,
            uploaderId: sellerId,
            width: processed.width,
            height: processed.height,
            originalKey: processed.originalKey,
            variants: processed.variants as any,
            status: 'STAGED',
          },
        });

        protectedImageIds.push(processed.id);
        imageViews.push({ id: processed.id, viewType: img.viewType });
      }

      // Resolve category ONLY from existing database categories (NEVER create new category)
      const cat = await resolveCategory(item.metadata.categoryName);

      // Create product record via CatalogService
      const product = await catalogService.createProduct({
        sellerId,
        targetUserId,
        title: item.metadata.title,
        description: item.metadata.description,
        protectedImageIds,
        imageViews,
        priceInRupees: BigInt(item.metadata.priceInRupees),
        categoryPath: cat.path,
        availableSizes: item.metadata.availableSizes,
        stockQuantity: 1, // ALWAYS 1
      });

      console.log(`   └─ ✅ Created Product ID: ${product.id}`);
      createdCount++;
    } catch (err: any) {
      console.error(`   └─ ❌ Failed to ingest garment "${item.metadata.title}" (${item.folderName}): ${err.message || err}`);
    }
  }

  console.log(`\n🎉 Ingestion finished! Successfully created ${createdCount}/${items.length} garments in database!`);
}

main()
  .catch((err) => {
    console.error('Fatal error during bulk garment creation:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
