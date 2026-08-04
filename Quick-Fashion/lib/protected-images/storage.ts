import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { protectedImageConfig } from './config';

function isSafeSegment(segment: string) {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(segment)
    && segment !== '.'
    && segment !== '..';
}

export function getPrivateStorageRoot() {
  return protectedImageConfig.storageRoot;
}

export function getPrivateMediaPath(...segments: string[]) {
  if (!segments.length || segments.some((segment) => !isSafeSegment(segment))) {
    throw new Error('Invalid private media path');
  }
  const mediaRoot = path.resolve(protectedImageConfig.storageRoot, 'media');
  const resolved = path.resolve(mediaRoot, ...segments);
  if (!resolved.startsWith(`${mediaRoot}${path.sep}`)) {
    throw new Error('Invalid private media path');
  }
  return resolved;
}

function resolveCatalogKey(key: string) {
  const segments = key.slice('catalog:'.length).split('/');
  if (segments.length !== 3) throw new Error('Invalid catalog storage key');
  return getPrivateMediaPath(...segments);
}

function resolvePrivateKey(key: string) {
  if (key.startsWith('catalog:')) return resolveCatalogKey(key);
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
  if (prefix.startsWith('catalog:')) throw new Error('Catalog media prefixes cannot be deleted through this helper');
  const target = resolvePrivateKey(prefix);
  await rm(target, { recursive: true, force: true });
}
