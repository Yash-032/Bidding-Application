import { prisma } from '@/lib/prisma';
import { decryptSecret, encryptSecret } from '@/lib/security/encrypted-secret';
import { getPixaProfile, refreshPixaTokens, type PixaProfile } from './adapter';
import { PixaReauthenticationRequired } from './errors';

const fields = [
  'shoulderWidth',
  'chest',
  'waist',
  'hip',
  'neck',
  'sleeveLength',
  'armLength',
  'thigh',
  'calf',
] as const;

const passwordHashForExternalAccount = 'pixa-external-account';

const measurementData = (profile: PixaProfile) =>
  profile.measurements
    ? {
        status: 'AVAILABLE',
        unit: profile.measurements.unit ?? 'CM',
        pixaUpdatedAt: profile.measurements.updatedAt
          ? new Date(profile.measurements.updatedAt)
          : new Date(),
        ...Object.fromEntries(
          fields.map((field) => [
            field,
            typeof profile.measurements?.[field] === 'number'
              ? profile.measurements[field]
              : null,
          ])
        ),
      }
    : {
        status: 'PHOTO_REQUIRED',
        pixaUpdatedAt: null,
        ...Object.fromEntries(fields.map((field) => [field, null])),
      };

async function resolvePixaUser(profile: PixaProfile) {
  const linkedUser = await prisma.user.findUnique({
    where: { pixaSubjectId: profile.sub },
  });
  if (linkedUser) return linkedUser;

  const emailUser = await prisma.user.findUnique({
    where: { email: profile.email },
  });

  if (emailUser?.pixaSubjectId && emailUser.pixaSubjectId !== profile.sub) {
    throw new Error('This email is already linked to another Pixa account');
  }

  if (emailUser) {
    return prisma.user.update({
      where: { id: emailUser.id },
      data: { pixaSubjectId: profile.sub },
    });
  }

  try {
    return await prisma.user.create({
      data: {
        email: profile.email,
        pixaSubjectId: profile.sub,
        passwordHash: passwordHashForExternalAccount,
        isVerified: true,
      },
    });
  } catch (error) {
    // A simultaneous callback may have created the unique user first. Resolve
    // that idempotently while still rejecting a conflicting identity link.
    const racedUser = await prisma.user.findFirst({
      where: {
        OR: [
          { pixaSubjectId: profile.sub },
          { email: profile.email },
        ],
      },
    });
    if (!racedUser) throw error;
    if (racedUser.pixaSubjectId && racedUser.pixaSubjectId !== profile.sub) {
      throw new Error('This email is already linked to another Pixa account');
    }
    if (!racedUser.pixaSubjectId) {
      return prisma.user.update({
        where: { id: racedUser.id },
        data: { pixaSubjectId: profile.sub },
      });
    }
    return racedUser;
  }
}

export async function linkPixaAccount(profile: PixaProfile, refreshToken?: string) {
  // Do not use an interactive transaction here. With the PostgreSQL driver
  // adapter, a busy pool can time out before the transaction even starts.
  // Every operation below is an idempotent unique-key upsert, so a callback can
  // safely retry without creating duplicate local records.
  const user = await resolvePixaUser(profile);

  await Promise.all([
    prisma.wallet.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    }),
    prisma.userProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, preferredSizes: [] },
      update: {},
    }),
    prisma.cart.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    }),
  ]);

  const measurement = await prisma.measurement.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      ...measurementData(profile),
    },
    update: measurementData(profile),
  });

  if (refreshToken) {
    const refreshTokenCiphertext = encryptSecret(refreshToken);
    await prisma.pixaConnection.upsert({
      where: { userId: user.id },
      create: { userId: user.id, refreshTokenCiphertext },
      update: { refreshTokenCiphertext },
    });
  }

  return { user, measurement };
}

type PixaRefreshGlobals = typeof globalThis & {
  __quickFashionPixaRefreshes?: Map<string, Promise<void>>;
};

const pixaRefreshGlobals = globalThis as PixaRefreshGlobals;
const refreshesByUser = pixaRefreshGlobals.__quickFashionPixaRefreshes
  ?? new Map<string, Promise<void>>();
pixaRefreshGlobals.__quickFashionPixaRefreshes = refreshesByUser;

const refreshCooldownMs = 15_000;

async function performMeasurementRefresh(userId: string) {
  const connection = await prisma.pixaConnection.findUnique({
    where: { userId },
    include: {
      user: {
        select: { pixaSubjectId: true },
      },
    },
  });

  if (!connection?.user.pixaSubjectId) return;

  // The authorization-code callback already fetched and stored the newest
  // measurements. Avoid rotating the new refresh token again immediately when
  // the redirected page makes duplicate development-mode requests.
  if (Date.now() - connection.updatedAt.getTime() < refreshCooldownMs) return;

  const oldCiphertext = connection.refreshTokenCiphertext;
  let tokens;

  try {
    tokens = await refreshPixaTokens(decryptSecret(oldCiphertext));
  } catch {
    // Another server instance may have rotated and saved the token while this
    // request was in flight. Never delete or reject that newer credential.
    const latestConnection = await prisma.pixaConnection.findUnique({
      where: { userId },
      select: { refreshTokenCiphertext: true },
    });
    if (
      latestConnection
      && latestConnection.refreshTokenCiphertext !== oldCiphertext
    ) {
      return;
    }

    await prisma.pixaConnection.deleteMany({
      where: {
        userId,
        refreshTokenCiphertext: oldCiphertext,
      },
    });
    throw new PixaReauthenticationRequired();
  }

  // Pixa rotates refresh tokens. Persist R2 before any later network or
  // measurement work so no subsequent request can read and reuse revoked R1.
  if (tokens.refreshToken) {
    const rotatedCiphertext = encryptSecret(tokens.refreshToken);
    const replaced = await prisma.pixaConnection.updateMany({
      where: {
        userId,
        refreshTokenCiphertext: oldCiphertext,
      },
      data: {
        refreshTokenCiphertext: rotatedCiphertext,
        updatedAt: new Date(),
      },
    });

    if (replaced.count !== 1) {
      // A newer token won the compare-and-swap. Do not overwrite it.
      return;
    }
  } else {
    await prisma.pixaConnection.updateMany({
      where: {
        userId,
        refreshTokenCiphertext: oldCiphertext,
      },
      data: { updatedAt: new Date() },
    });
  }

  const profile = await getPixaProfile(tokens.accessToken);

  if (profile.sub !== connection.user.pixaSubjectId) {
    throw new Error('Pixa identity changed unexpectedly');
  }

  await prisma.measurement.upsert({
    where: { userId },
    create: {
      userId,
      ...measurementData(profile),
    },
    update: measurementData(profile),
  });
}

export function refreshMeasurementsFromPixa(userId: string) {
  const existingRefresh = refreshesByUser.get(userId);
  if (existingRefresh) return existingRefresh;

  const refresh = performMeasurementRefresh(userId)
    .finally(() => {
      if (refreshesByUser.get(userId) === refresh) {
        refreshesByUser.delete(userId);
      }
    });

  refreshesByUser.set(userId, refresh);
  return refresh;
}