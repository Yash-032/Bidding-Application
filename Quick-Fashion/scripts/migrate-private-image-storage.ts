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
  const candidateSources = process.env.PRIVATE_IMAGE_STORAGE_MIGRATION_SOURCE
    ? [path.resolve(process.env.PRIVATE_IMAGE_STORAGE_MIGRATION_SOURCE)]
    : [
        path.join(process.cwd(), 'shared-private-product-images'),
        path.join(process.cwd(), 'private', 'product-images'),
      ];

  const destination = protectedImageConfig.storageRoot;
  await mkdir(destination, { recursive: true });

  let totalFilesCopied = 0;
  let totalBytesCopied = 0;

  for (const source of candidateSources) {
    const exists = await stat(source).then((s) => s.isDirectory()).catch(() => false);
    if (!exists) continue;
    if (source === destination || destination.startsWith(`${source}${path.sep}`)) {
      console.warn(`Skipping source ${source} as it matches destination ${destination}`);
      continue;
    }

    const before = await snapshot(source);
    if (before.files === 0) continue;

    console.info(`Migrating ${before.files} file(s) (${before.bytes} bytes) from ${source} to ${destination}...`);
    await cp(source, destination, {
      recursive: true,
      force: false,
      errorOnExist: false,
      preserveTimestamps: true,
    });
    totalFilesCopied += before.files;
    totalBytesCopied += before.bytes;
  }

  const destinationSnapshot = await snapshot(destination);
  console.info(
    `Shared private image storage is ready at ${destination} (${destinationSnapshot.files} total files, ${destinationSnapshot.bytes} bytes).`,
  );
  console.info('Legacy source folders were intentionally kept as rollback copies.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
