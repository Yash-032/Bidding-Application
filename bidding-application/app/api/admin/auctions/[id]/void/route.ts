import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser, requireRole } from '@/lib/auth/session';
import { AdminService } from '@/lib/admin/admin.service';
import { toErrorResponse } from '@/lib/utils/errors';

const adminService = new AdminService();

export async function POST(req: NextRequest, { params }: { params: Promise< { id: string } >}) {
    try {
        const admin = await requireSessionUser(req);
        requireRole(admin, 'ADMIN');
        
        const { reason } = await req.json();
        if (!reason) {
            return NextResponse.json({ error: 'reason is required' }, { status: 400 });
        }

        const result = await adminService.voidAuction(admin.id, (await params).id, reason);
        return NextResponse.json(result);
    } catch(err) {
        const { body, status } = toErrorResponse(err);
        return NextResponse.json(body, { status });
    }
}