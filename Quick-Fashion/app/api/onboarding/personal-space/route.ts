import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSessionUser } from '@/lib/auth/session';
import { toErrorResponse, ValidationError } from '@/lib/utils/errors';

const numberOrNull = (value: unknown, name: string) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new ValidationError(`${name} must be a positive number`);
  return parsed;
};

export async function POST(request: NextRequest) {
  try {
    const session = await requireSessionUser(request);
    const body = await request.json();
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim().slice(0, 100) : '';
    const location = typeof body.location === 'string' ? body.location.trim().slice(0, 120) : '';
    const gender = typeof body.gender === 'string' ? body.gender.trim().slice(0, 40) : '';
    const age = numberOrNull(body.age, 'Age');
    if (!fullName || !location || !gender || !age || age > 120) throw new ValidationError('Complete your name, location, age, and gender');
    const measures = {
      heightCm: numberOrNull(body.heightCm, 'Height'), weightKg: numberOrNull(body.weightKg, 'Weight'),
      chest: numberOrNull(body.chest, 'Chest/Bust'), waist: numberOrNull(body.waist, 'Waist'), hip: numberOrNull(body.hip, 'Hips'),
      legLengthCm: numberOrNull(body.legLengthCm, 'Leg length'), shoulderDepth: numberOrNull(body.shoulderDepth, 'Shoulder depth'),
    };
    await prisma.$transaction(async (tx) => {
      await tx.userProfile.upsert({
        where: { userId: session.id },
        create: { userId: session.id, fullName, location, age, gender, preferredSizes: [] },
        update: { fullName, location, age, gender },
      });
      await tx.measurement.upsert({
        where: { userId: session.id },
        create: { userId: session.id, status: 'AVAILABLE', unit: 'CM', ...measures },
        update: { status: 'AVAILABLE', unit: 'CM', ...measures },
      });
    });
    return NextResponse.json({ saved: true });
  } catch (error) { const { body, status } = toErrorResponse(error); return NextResponse.json(body, { status }); }
}