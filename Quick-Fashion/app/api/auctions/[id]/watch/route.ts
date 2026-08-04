import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSessionUser } from '@/lib/auth/session';
import { toErrorResponse } from '@/lib/utils/errors';

export async function POST(req: NextRequest, { params} : { params: Promise< { id: string } > }) {
    try {
        const user = await requireSessionUser(req);

        await prisma.auctionWatcher.upsert({
            where: { auctionId_userId: { auctionId: (await params).id, userId: user.id } },
            create: { auctionId: (await params).id, userId: user.id },
            update: {},
        });
        return NextResponse.json({ watching: true }, { status: 201 });
    } catch(err) {
        const { body, status } = toErrorResponse(err);
        return NextResponse.json(body, { status });
    }
}

export async function DELETE(req: NextRequest, { params} : { params: Promise< { id: string } > }) {
    try {
        const user = await requireSessionUser(req);
    
        await prisma.auctionWatcher.deleteMany({
            where: {auctionId: (await params).id, userId: user.id },
        });
    
        return NextResponse.json( { watching: false }, { status: 200 });
    } catch(err) {
        const { body, status } = toErrorResponse(err);
        return NextResponse.json(body, { status }); 
    }
}