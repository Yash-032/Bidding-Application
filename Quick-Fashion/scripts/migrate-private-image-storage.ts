import 'dotenv/config';
import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { protectedImageConfig } from '../lib/protected-images/config';

type StorageSnapshot = {
  files: number;
  bytes: number;
};

async function snapshot(root: string): Promise<StorageSnapshot> {
  const entries = await readdir(root, { withFileTypes: true });
  const result: StorageSnapshot = { files: 0, bytes: 0 };
  for (const entry of entries) {
    const item = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await snapshot(item);
      result.files += nested.files;
      result.bytes += nested.bytes;
    } else if (entry.isFile()) {
      result.files += 1;
      result.bytes += (await stat(item)).size;
    }
  }
  return result;
}

async function main() {
  const source = path.resolve(
    process.env.PRIVATE_IMAGE_STORAGE_MIGRATION_SOURCE
      ?? path.join(process.cwd(), 'private', 'product-images'),
  );
  const destination = protectedImageConfig.storageRoot;
  if (source === destination || destination.startsWith(`${source}${path.sep}`)) {
    throw new Error('The shared storage destination must be different from the legacy storage source');
  }

  await mkdir(destination, { recursive: true });
  const before = await snapshot(source);
  await cp(source, destination, {
    recursive: true,
    force: false,
    errorOnExist: false,
    preserveTimestamps: true,
  });
  const after = await snapshot(destination);
  if (after.files < before.files || after.bytes < before.bytes) {
    throw new Error('Shared storage verification failed: not every legacy image file was copied');
  }

  console.info(
    `Shared private image storage is ready at ${destination} (${before.files} files, ${before.bytes} bytes copied or verified).`,
  );
  console.info('The legacy private/product-images folder was intentionally kept as a rollback copy.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
