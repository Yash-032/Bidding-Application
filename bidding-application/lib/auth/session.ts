import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { UnauthorizedError } from '@/lib/utils/errors';
import { UserRole } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';
const JWT_EXPIRY = '7d';

export interface SessionUser {
    id: string;
    email: string;
    role: UserRole;
    isVerified: boolean;
}

export function signSessionToken(user: SessionUser): string {
    return jwt.sign(user, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/** Reads the bearer token from the Authorization header and validates it against the DB. */
export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice('Bearer '.length);
  let decoded: SessionUser;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as SessionUser;
  } catch {
    return null;
  }
  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (!user) return null;

  return { id: user.id, email: user.email, role: user.role, isVerified: user.isVerified };
}

/** Throws UnauthorizedError if there's no valid session — use in routes that require auth. */
export async function requireSessionUser(req: NextRequest): Promise<SessionUser> {
  const user = await getSessionUser(req);
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Throws if the session user's role isn't one of the allowed roles. */
export function requireRole(user: SessionUser, ...roles: UserRole[]) {
  if (!roles.includes(user.role)) {
    throw new UnauthorizedError(`Requires one of roles: ${roles.join(', ')}`);
  }
}