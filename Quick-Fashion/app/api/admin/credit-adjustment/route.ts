import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser, requireRole } from '@/lib/auth/session';
import { AdminService } from '@/lib/admin/admin.service';
import { toErrorResponse } from '@/lib/utils/errors';

const adminService = new AdminService();

export async function POST(req: NextRequest) {
    try {
        const admin = await requireSessionUser(req);
        requireRole(admin, 'ADMIN');
        
        const { targetUserId, amount, reason } = await req.json();
        if (!targetUserId || amount == null || !reason) {
            return NextResponse.json(
                { error: 'targetUserId, amount, and reason are required' },
                { status: 400 },
            );
        }

        const result = await adminService.adjustCredits(admin.id, targetUserId, BigInt(amount), reason);
        
        return NextResponse.json({
            availableBalance: result.availableBalance.toString(),
            lockedBalance: result.lockedBalance.toString(),
        });
    } catch(err) {
        const { body, status } = toErrorResponse(err);
        return NextResponse.json(body, { status });
    }
}