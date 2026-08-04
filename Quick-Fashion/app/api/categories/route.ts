import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireSessionUser } from '@/lib/auth/session';
import { CategoryService } from '@/lib/catalog/category.service';
import { toErrorResponse } from '@/lib/utils/errors';

const categories = new CategoryService();

export async function GET() {
  try {
    return NextResponse.json(
      { categories: await categories.listTree() },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
    );
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    requireRole(user, 'ADMIN');
    const body = await request.json();
    const category = await categories.create({
      name: body.name,
      parentPath: body.parentPath || undefined,
      sortOrder: Number(body.sortOrder || 0),
    });
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
