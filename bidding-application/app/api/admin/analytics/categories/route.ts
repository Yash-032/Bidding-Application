import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser, requireRole } from '@/lib/auth/session';
import { AnalyticsService } from '@/lib/admin/analytics.service';
import { toErrorResponse } from '@/lib/utils/errors';

const analytics = new AnalyticsService();

export async function GET(req: NextRequest) {
  try {
    const admin = await requireSessionUser(req);
    requireRole(admin, 'ADMIN');

    const { searchParams } = new URL(req.url);
    const startStr = searchParams.get('startDate');
    const endStr = searchParams.get('endDate');

    const endDate = endStr ? new Date(endStr) : new Date();
    const startDate = startStr ? new Date(startStr) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const data = await analytics.getCategories(startDate, endDate);
    return NextResponse.json(data);
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
