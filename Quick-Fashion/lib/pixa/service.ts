import { prisma } from '@/lib/prisma';
import type { PixaProfile } from './adapter';

const fields = ['shoulderWidth', 'chest', 'waist', 'hip', 'neck', 'sleeveLength', 'armLength', 'thigh', 'calf'] as const;
const passwordHashForExternalAccount = 'pixa-external-account';

export async function linkPixaAccount(profile: PixaProfile) {
  return prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { pixaSubjectId: profile.sub } });
    if (!user) {
      user = await tx.user.findUnique({ where: { email: profile.email } });
      if (user && user.pixaSubjectId && user.pixaSubjectId !== profile.sub) throw new Error('This email is already linked to another Pixa account');
      user = user
        ? await tx.user.update({ where: { id: user.id }, data: { pixaSubjectId: profile.sub } })
        : await tx.user.create({ data: { email: profile.email, pixaSubjectId: profile.sub, passwordHash: passwordHashForExternalAccount, isVerified: true } });
      if (!user) throw new Error('Could not link Pixa account');
      if (!(await tx.wallet.findUnique({ where: { userId: user.id } }))) await tx.wallet.create({ data: { userId: user.id } });
      if (!(await tx.userProfile.findUnique({ where: { userId: user.id } }))) await tx.userProfile.create({ data: { userId: user.id, preferredSizes: [] } });
      if (!(await tx.cart.findUnique({ where: { userId: user.id } }))) await tx.cart.create({ data: { userId: user.id } });
    }
    const source = profile.measurements;
    const data = source ? {
      status: 'AVAILABLE', unit: source.unit ?? 'CM', pixaUpdatedAt: source.updatedAt ? new Date(source.updatedAt) : new Date(),
      ...Object.fromEntries(fields.map((field) => [field, typeof source[field] === 'number' ? source[field] : null])),
    } : { status: 'PHOTO_REQUIRED', pixaUpdatedAt: null, ...Object.fromEntries(fields.map((field) => [field, null])) };
    const measurement = await tx.measurement.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
    return { user, measurement };
  });
}