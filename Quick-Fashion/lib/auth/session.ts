import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { UnauthorizedError } from '@/lib/utils/errors';
import { UserRole } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';
const JWT_EXPIRY = '7d';
const SESSION_CACHE_TTL_MS = 30_000;

const globalForSessions = globalThis as unknown as {
  sessionUsers?: Map<string, { user: SessionUser; expiresAt: number }>;
  sessionLookups?: Map<string, Promise<SessionUser | null>>;
};
const sessionUsers = globalForSessions.sessionUsers ?? new Map<string, { user: SessionUser; expiresAt: number }>();
const sessionLookups = globalForSessions.sessionLookups ?? new Map<string, Promise<SessionUser | null>>();
globalForSessions.sessionUsers = sessionUsers;
globalForSessions.sessionLookups = sessionLookups;

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
export function getSessionClaims(req: NextRequest): SessionUser | null {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : req.cookies.get('quick_fashion_session')?.value;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as SessionUser;
  } catch {
    return null;
  }
}

export function requireSessionClaims(req: NextRequest): SessionUser {
  const user = getSessionClaims(req);
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Reads the bearer token and periodically validates the account against the DB. */
export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const decoded = getSessionClaims(req);
  if (!decoded) return null;
  const cached = sessionUsers.get(decoded.id);
  if (cached && cached.expiresAt > Date.now()) return cached.user;
  if (cached) sessionUsers.delete(decoded.id);

  const existingLookup = sessionLookups.get(decoded.id);
  if (existingLookup) return existingLookup;

  const lookup = prisma.user.findUnique({
    where: { id: decoded.id },
    select: { id: true, email: true, role: true, isVerified: true },
  }).then((user) => {
    if (!user) return null;
    const sessionUser = { id: user.id, email: user.email, role: user.role, isVerified: user.isVerified };
    if (sessionUsers.size >= 1_000) sessionUsers.clear();
    sessionUsers.set(user.id, { user: sessionUser, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
    return sessionUser;
  });
  sessionLookups.set(decoded.id, lookup);
  try {
    return await lookup;
  } finally {
    sessionLookups.delete(decoded.id);
  }
}

/** Throws UnauthorizedError if there's no valid session - use in routes that require auth. */
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
