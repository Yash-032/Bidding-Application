import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireSessionUser } from '@/lib/auth/session';
import { AnalyticsService } from '@/lib/admin/analytics.service';
import { toErrorResponse } from '@/lib/utils/errors';

const analytics = new AnalyticsService();

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    requireRole(await requireSessionUser(request), 'ADMIN');
    const { userId } = await params;
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const data = await analytics.getCustomerInsights(userId, startDate, endDate);
    if (!data) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
