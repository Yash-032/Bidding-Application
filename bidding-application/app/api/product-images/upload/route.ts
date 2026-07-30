import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireSessionUser } from '@/lib/auth/session';
import { processProductImage } from '@/lib/protected-images/processor';
import { deletePrivatePrefix } from '@/lib/protected-images/storage';
import { prisma } from '@/lib/prisma';
import { toErrorResponse, ValidationError } from '@/lib/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const created: string[] = [];
  try {
    const user = await requireSessionUser(request);
    requireRole(user, 'SELLER', 'ADMIN');
    const form = await request.formData();
    const files = form.getAll('images').filter((value): value is File => value instanceof File);
    if (!files.length || files.length > 12) throw new ValidationError('Upload between 1 and 12 product images');

    const images = [];
    for (const file of files) {
      let processed;
      try {
        processed = await processProductImage(Buffer.from(await file.arrayBuffer()));
      } catch (error) {
        if (error instanceof ValidationError) throw new ValidationError(`${file.name}: ${error.message}`);
        throw error;
      }
      created.push(processed.id);
      const image = await prisma.productImage.create({
        data: {
          id: processed.id,
          uploaderId: user.id,
          width: processed.width,
          height: processed.height,
          originalKey: processed.originalKey,
          variants: processed.variants,
        },
        select: { id: true, width: true, height: true },
      });
      images.push(image);
    }
    console.info(JSON.stringify({ event: 'protected_image_upload', uploaderId: user.id, count: images.length }));
    return NextResponse.json({ images }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    await Promise.allSettled(created.map(deletePrivatePrefix));
    if (created.length) await prisma.productImage.deleteMany({ where: { id: { in: created } } }).catch(() => undefined);
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
