import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { protectedImageConfig } from './config';

function resolvePrivateKey(key: string) {
  if (!/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/i.test(key)) throw new Error('Invalid private storage key');
  const resolved = path.resolve(protectedImageConfig.storageRoot, key);
  if (!resolved.startsWith(`${protectedImageConfig.storageRoot}${path.sep}`)) throw new Error('Invalid private storage path');
  return resolved;
}

export async function putPrivateObject(key: string, value: Buffer) {
  const target = resolvePrivateKey(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value, { flag: 'wx' });
}

export function getPrivateObject(key: string) {
  return readFile(resolvePrivateKey(key));
}

export async function deletePrivateObject(key: string) {
  await rm(resolvePrivateKey(key), { force: true });
}

export async function deletePrivatePrefix(prefix: string) {
  const target = resolvePrivateKey(prefix);
  await rm(target, { recursive: true, force: true });
}
