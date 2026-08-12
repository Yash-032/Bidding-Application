import type { CategoryTreeNode, ProductListItem } from '@/lib/api';

type DesignLabCatalog = {
  categories: CategoryTreeNode[];
  products: ProductListItem[];
};

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function loadDesignLabCatalog(category?: string): Promise<DesignLabCatalog> {
  const query = category ? `?category=${encodeURIComponent(category)}` : '';
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(`/api/design-lab/catalog${query}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Could not load design lab');
      return body as DesignLabCatalog;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await wait(700);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Could not load design lab');
}

export async function loadDesignLabProducts(category?: string) {
  return (await loadDesignLabCatalog(category)).products;
}

export function productBelongsToPath(product: ProductListItem, path: string) {
  const productPath = product.categoryNode?.path;
  return Boolean(productPath && (productPath === path || productPath.startsWith(`${path}/`)));
}
