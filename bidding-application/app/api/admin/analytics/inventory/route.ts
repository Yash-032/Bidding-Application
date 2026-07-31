import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser, requireRole } from '@/lib/auth/session';
import { AnalyticsService } from '@/lib/admin/analytics.service';
import { toErrorResponse } from '@/lib/utils/errors';

const analytics = new AnalyticsService();

export async function GET(req: NextRequest) {
  try {
    const admin = await requireSessionUser(req);
    requireRole(admin, 'ADMIN');

    // Inventory metrics don't rely on range filters since stock levels and alerts are real-time.
    const data = await analytics.getInventory();
    return NextResponse.json(data);
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
