import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendOtpEmail } from '@/lib/email/mailer';
import { signSessionToken } from './session';
import { ConflictError, UnauthorizedError, ValidationError, NotFoundError } from '@/lib/utils/errors';

const SALT_ROUNDS = 12;

export interface SignupRequest {
  email: string;
  password: string;
  phone?: string;
}

export class AuthService {
  async signup(req: SignupRequest) {
    const existing = await prisma.user.findUnique({ where: { email: req.email } });
    if (existing) throw new ConflictError('An account with this email already exists');
    
    if (req.password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long');
    }

    const passwordHash = await bcrypt.hash(req.password, SALT_ROUNDS);
    
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: req.email, phone: req.phone, passwordHash },
      });
      await tx.wallet.create({ data: { userId: created.id } });
      await tx.userProfile.create({ data: { userId: created.id, preferredSizes: [] } });
      await tx.cart.create({ data: { userId: created.id } });
      return created;
    });

    const token = signSessionToken({
      id: user.id,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
    });

    return {
      token,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedError('Invalid email or password');

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) throw new UnauthorizedError('Invalid email or password');

    const token = signSessionToken({
      id: user.id,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
    });

    return { token, user: { id: user.id, email: user.email, role: user.role } };
  }

  async verifyEmail(userId: string, token: string) {
    const expected = this.generateVerificationToken(userId);
    if (token !== expected) throw new ValidationError('Invalid or expired verification token');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User not found');

    await prisma.user.update({ where: { id: userId }, data: { isVerified: true } });
    return { verified: true };
  }

  async requestEmailOtp(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundError('Account not found');
    const code = crypto.randomInt(100000, 1_000_000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.$transaction([
      prisma.emailOtp.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: new Date() } }),
      prisma.emailOtp.create({ data: { userId: user.id, codeHash: this.hashOtp(user.id, code), expiresAt } }),
    ]);
    await sendOtpEmail(user.email, code);
    return { sent: true };
  }

  async verifyEmailOtp(email: string, code: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new ValidationError('OTP is invalid or expired');
    const otp = await prisma.emailOtp.findFirst({ where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    if (!otp || otp.attempts >= 5) throw new ValidationError('OTP is invalid or expired');
    const expected = Buffer.from(otp.codeHash);
    const received = Buffer.from(this.hashOtp(user.id, code));
    const valid = expected.length === received.length && crypto.timingSafeEqual(expected, received);
    if (!valid) {
      await prisma.emailOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new ValidationError('OTP is invalid or expired');
    }
    await prisma.$transaction([
      prisma.emailOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } }),
      prisma.user.update({ where: { id: user.id }, data: { isVerified: true } }),
    ]);
    return { verified: true };
  }

  private hashOtp(userId: string, code: string): string {
    const secret = process.env.EMAIL_OTP_SECRET ?? process.env.EMAIL_VERIFICATION_SECRET ?? 'dev-secret-change-me';
    return crypto.createHmac('sha256', secret).update(`${userId}:${code}`).digest('hex');
  }
  
  private generateVerificationToken(userId: string): string {
    const secret = process.env.EMAIL_VERIFICATION_SECRET ?? 'dev-secret-change-me';
    return crypto.createHmac('sha256', secret).update(userId).digest('hex');
  }
}
