import path from 'node:path';

function integer(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

const projectRoot = path.join(/* turbopackIgnore: true */ process.cwd());
const defaultStorageRoot = process.platform === 'win32'
  ? 'D:/shared-protected-tiles'
  : path.join(projectRoot, 'private', 'product-images');
const storageRoot = path.resolve(process.env.PRIVATE_IMAGE_STORAGE_PATH ?? defaultStorageRoot);
const forbiddenRoots = [path.resolve(projectRoot, 'public'), path.resolve(projectRoot, 'static')];
if (forbiddenRoots.some((root) => storageRoot === root || storageRoot.startsWith(`${root}${path.sep}`))) {
  throw new Error('PRIVATE_IMAGE_STORAGE_PATH must not be inside public/ or static/');
}

export const protectedImageConfig = {
  grid: integer('IMAGE_TILE_GRID', 4, 2, 8),
  manifestTtlSeconds: integer('IMAGE_MANIFEST_TTL_SECONDS', 45, 10, 300),
  maxUploadBytes: integer('IMAGE_MAX_UPLOAD_BYTES', 50 * 1024 * 1024, 1024, 100 * 1024 * 1024),
  variantWidths: (process.env.IMAGE_VARIANT_WIDTHS ?? '480,960,1600')
    .split(',')
    .map(Number)
    .filter((value) => Number.isInteger(value) && value >= 160 && value <= 4096)
    .sort((a, b) => a - b),
  storageRoot,
  // A catalog viewport can legitimately request 16 tiles for dozens of images,
  // with an extra aborted pass under React development Strict Mode.
  rateLimitPerMinute: integer('IMAGE_TILE_RATE_LIMIT', 2048, 64, 20_000),
};

export function imageSigningSecret() {
  const secret = process.env.IMAGE_SIGNING_SECRET ?? process.env.JWT_SECRET;
  if (!secret || (process.env.NODE_ENV === 'production' && secret.length < 32)) {
    throw new Error('IMAGE_SIGNING_SECRET must be configured with at least 32 characters in production');
  }
  return secret;
}
