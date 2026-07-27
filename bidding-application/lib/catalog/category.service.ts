import { prisma } from '@/lib/prisma';
import { ValidationError } from '@/lib/utils/errors';

export interface CategoryTreeNode {
  id: string;
  name: string;
  slug: string;
  path: string;
  parentId: string | null;
  sortOrder: number;
  productCount: number;
  children: CategoryTreeNode[];
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function normalizeCategoryPath(value: string) {
  return String(value || '')
    .split('/')
    .map(slugify)
    .filter(Boolean)
    .join('/');
}

export class CategoryService {
  async listTree() {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      include: { _count: { select: { products: { where: { isActive: true } } } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const nodes = new Map<string, CategoryTreeNode>();
    for (const category of categories) {
      nodes.set(category.id, {
        id: category.id,
        name: category.name,
        slug: category.slug,
        path: category.path,
        parentId: category.parentId,
        sortOrder: category.sortOrder,
        productCount: category._count.products,
        children: [],
      });
    }

    const roots: CategoryTreeNode[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId ? nodes.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async create(input: { name: string; parentPath?: string; sortOrder?: number }) {
    const name = input.name?.trim();
    const slug = slugify(name || '');
    if (!name || !slug) throw new ValidationError('Enter a valid category name');

    const parentPath = input.parentPath ? normalizeCategoryPath(input.parentPath) : '';
    const parent = parentPath
      ? await prisma.category.findUnique({ where: { path: parentPath } })
      : null;
    if (input.parentPath && !parent) throw new ValidationError('Parent category was not found');

    const path = parent ? `${parent.path}/${slug}` : slug;
    return prisma.category.create({
      data: {
        name,
        slug,
        path,
        parentId: parent?.id,
        sortOrder: Number.isInteger(input.sortOrder) ? input.sortOrder : 0,
      },
    });
  }
}
