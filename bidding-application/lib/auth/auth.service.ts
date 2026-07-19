import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
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
    console.time("findUser");
    const existing = await prisma.user.findUnique({ where: { email: req.email } });
    if (existing) throw new ConflictError('An account with this email already exists');
    console.timeEnd("findUser");
    
    if (req.password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }
    
    console.time("hash");
    const passwordHash = await bcrypt.hash(req.password, SALT_ROUNDS);
    console.timeEnd("hash");

    console.time('signup transaction');
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: req.email, phone: req.phone, passwordHash },
      });
      await tx.wallet.create({ data: { userId: created.id } });
      return created;
    });
    console.timeEnd('signup transaction');
    
    console.time("jwt");
    const verificationToken = this.generateVerificationToken(user.id);
    console.timeEnd("jwt");

    return {
      user: { id: user.id, email: user.email, role: user.role },
      verificationToken,
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

  private generateVerificationToken(userId: string): string {
    const secret = process.env.EMAIL_VERIFICATION_SECRET ?? 'dev-secret-change-me';
    return crypto.createHmac('sha256', secret).update(userId).digest('hex');
  }
}
