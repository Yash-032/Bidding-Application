import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSessionUser } from '@/lib/auth/session';
import { processProductImage } from '@/lib/protected-images/processor';
import { deletePrivatePrefix } from '@/lib/protected-images/storage';
import { toErrorResponse, ValidationError } from '@/lib/utils/errors';

export const runtime = 'nodejs';
const photoKinds = ['SELFIE', 'FRONT', 'LEFT', 'RIGHT', 'BACK'] as const;

export async function POST(request: NextRequest) {
  const createdIds: string[] = [];
  try {
    const session = await requireSessionUser(request);
    const form = await request.formData();
    for (const kind of photoKinds) {
      const file = form.get(kind.toLowerCase());
      if (!(file instanceof File) || !file.size) throw new ValidationError(`Upload your ${kind.toLowerCase()} photo`);
      const processed = await processProductImage(Buffer.from(await file.arrayBuffer()));
      createdIds.push(processed.id);
      const existing = await prisma.personalSpacePhoto.findUnique({ where: { userId_kind: { userId: session.id, kind } } });
      await prisma.personalSpacePhoto.upsert({
        where: { userId_kind: { userId: session.id, kind } },
        create: { id: processed.id, userId: session.id, kind, width: processed.width, height: processed.height, originalKey: processed.originalKey, variants: processed.variants },
        update: { id: processed.id, width: processed.width, height: processed.height, originalKey: processed.originalKey, variants: processed.variants },
      });
      if (existing) await deletePrivatePrefix(existing.id);
    }
    return NextResponse.json({ uploaded: true });
  } catch (error) {
    await Promise.all(createdIds.map((id) => deletePrivatePrefix(id)));
    const { body, status } = toErrorResponse(error); return NextResponse.json(body, { status });
  }
}