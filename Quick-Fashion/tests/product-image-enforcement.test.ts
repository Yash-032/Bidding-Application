import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const commerceRenderers = [
  'app/components/AuctionCard.tsx',
  'app/products/[id]/page.tsx',
  'app/auctions/[id]/page.tsx',
  'app/cart/page.tsx',
  'app/checkout/page.tsx',
];

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(ts|tsx)$/.test(entry.name) ? [absolute] : [];
  }));
  return nested.flat();
}

describe('site-wide product image enforcement', () => {
  it('forbids ordinary image elements and public image URL access in every commerce renderer', async () => {
    for (const relative of commerceRenderers) {
      const source = await readFile(path.join(root, relative), 'utf8');
      expect(source, relative).not.toMatch(/<img\b|<picture\b|\bproduct\.images\b|https?:\/\/.*(?:png|jpe?g|webp|image)/i);
      expect(source, relative).toContain('ProtectedProductImage');
    }
  });

  it('has no product image file in public or static storage', async () => {
    for (const directory of ['public', 'static']) {
      const absolute = path.join(root, directory);
      const entries = await readdir(absolute, { recursive: true }).catch(() => []);
      expect(entries.filter((entry) => /\.(png|jpe?g|webp|avif)$/i.test(String(entry)))).toEqual([]);
    }
  });

  it('never serializes the legacy Product.images URL column', async () => {
    const listRoute = await readFile(path.join(root, 'app/api/products/route.ts'), 'utf8');
    const detailRoute = await readFile(path.join(root, 'app/api/products/[id]/route.ts'), 'utf8');
    expect(listRoute).toContain('images: _legacyImages');
    expect(detailRoute).toContain('images: _legacyImages');
    expect(listRoute).toContain('protectedImageIds');
    for (const file of await sourceFiles(path.join(root, 'app/api'))) {
      const source = await readFile(file, 'utf8');
      expect(source, path.relative(root, file)).not.toMatch(/\bproduct\s*:\s*true\b|\bproduct\.images\b/);
    }
  });

  it('reveals the single master canvas only after all tiles have completed', async () => {
    const source = await readFile(path.join(root, 'app/components/ProtectedProductImage.tsx'), 'utf8');
    const allTiles = source.indexOf('await Promise.all(manifest.tiles.map');
    const reveal = source.indexOf("frame.classList.add('ready')");
    expect(allTiles).toBeGreaterThan(-1);
    expect(reveal).toBeGreaterThan(allTiles);
    expect(source.match(/document\.createElement\('canvas'\)/g)).toHaveLength(1);
    expect(source).not.toMatch(/createObjectURL|<img\b|<picture\b/);
    expect(source).toContain("attachShadow({ mode: 'closed' })");
  });

  it('serves only opaque non-cacheable tile bytes', async () => {
    const source = await readFile(path.join(root, 'app/api/protected-images/[id]/tile/[tileId]/route.ts'), 'utf8');
    expect(source).toContain("'Content-Type': 'application/octet-stream'");
    expect(source).toContain("'X-Content-Type-Options': 'nosniff'");
    expect(source).toContain("'Cache-Control': 'private, no-store, max-age=0'");
  });
});
