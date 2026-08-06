import { prisma } from '@/lib/prisma';
import { decryptSecret, encryptSecret } from '@/lib/security/encrypted-secret';
import { refreshPixaProfile, type PixaProfile } from './adapter';
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

export async function linkPixaAccount(
  profile: PixaProfile,
  refreshToken?: string
) {
  return prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({
      where: {
        pixaSubjectId: profile.sub,
      },
    });

    if (!user) {
      user = await tx.user.findUnique({
        where: {
          email: profile.email,
        },
      });

      if (user && user.pixaSubjectId && user.pixaSubjectId !== profile.sub) {
        throw new Error(
          'This email is already linked to another Pixa account'
        );
      }

      user = user
        ? await tx.user.update({
            where: {
              id: user.id,
            },
            data: {
              pixaSubjectId: profile.sub,
            },
          })
        : await tx.user.create({
            data: {
              email: profile.email,
              pixaSubjectId: profile.sub,
              passwordHash: passwordHashForExternalAccount,
              isVerified: true,
            },
          });

      if (!(await tx.wallet.findUnique({ where: { userId: user.id } }))) {
        await tx.wallet.create({
          data: {
            userId: user.id,
          },
        });
      }

      if (!(await tx.userProfile.findUnique({ where: { userId: user.id } }))) {
        await tx.userProfile.create({
          data: {
            userId: user.id,
            preferredSizes: [],
          },
        });
      }

      if (!(await tx.cart.findUnique({ where: { userId: user.id } }))) {
        await tx.cart.create({
          data: {
            userId: user.id,
          },
        });
      }
    }

    const measurement = await tx.measurement.upsert({
      where: {
        userId: user.id,
      },
      create: {
        userId: user.id,
        ...measurementData(profile),
      },
      update: measurementData(profile),
    });

    if (refreshToken) {
      await tx.pixaConnection.upsert({
        where: {
          userId: user.id,
        },
        create: {
          userId: user.id,
          refreshTokenCiphertext: encryptSecret(refreshToken),
        },
        update: {
          refreshTokenCiphertext: encryptSecret(refreshToken),
        },
      });
    }

    return {
      user,
      measurement,
    };
  });
}

export async function refreshMeasurementsFromPixa(userId: string) {
  const connection = await prisma.pixaConnection.findUnique({
    where: {
      userId,
    },
    include: {
      user: {
        select: {
          pixaSubjectId: true,
        },
      },
    },
  });

  if (!connection?.user.pixaSubjectId) {
    return;
  }

  let result;
  try {
    result = await refreshPixaProfile(
      decryptSecret(connection.refreshTokenCiphertext)
    );
  } catch {
    await prisma.pixaConnection.delete({ where: { userId } }).catch(() => undefined);
    throw new PixaReauthenticationRequired();
  }

  if (result.profile.sub !== connection.user.pixaSubjectId) {
    throw new Error('Pixa identity changed unexpectedly');
  }

  await prisma.$transaction(async (tx) => {
    await tx.measurement.upsert({
      where: {
        userId,
      },
      create: {
        userId,
        ...measurementData(result.profile),
      },
      update: measurementData(result.profile),
    });

    if (result.refreshToken) {
      await tx.pixaConnection.update({
        where: {
          userId,
        },
        data: {
          refreshTokenCiphertext: encryptSecret(result.refreshToken),
        },
      });
    }
  });
}