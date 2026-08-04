import { createClient, type RedisClientType } from 'redis';

const globalRedis = globalThis as unknown as { protectedImageRedis?: RedisClientType; protectedImageRedisConnect?: Promise<RedisClientType> };

async function client() {
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required for protected image delivery');
  if (globalRedis.protectedImageRedis?.isReady) return globalRedis.protectedImageRedis;
  if (!globalRedis.protectedImageRedisConnect) {
    const instance = createClient({ url: process.env.REDIS_URL });
    instance.on('error', (error) => console.error('[protected-image] Redis error', error));
    globalRedis.protectedImageRedis = instance as RedisClientType;
    globalRedis.protectedImageRedisConnect = instance.connect().then(() => instance as RedisClientType);
  }
  return globalRedis.protectedImageRedisConnect;
}

export type TileNonceGrant = {
  sessionId: string;
  imageId: string;
  tileId: string;
  storageKey: string;
};

export type TileNonceGrantEntry = {
  nonce: string;
  grant: TileNonceGrant;
};

export async function issueNonceGrants(entries: TileNonceGrantEntry[], ttlSeconds: number) {
  const redis = await client();
  const transaction = redis.multi();
  for (const entry of entries) {
    transaction.set(
      `protected-image:nonce:${entry.nonce}`,
      JSON.stringify(entry.grant),
      { NX: true, EX: ttlSeconds },
    );
  }
  const results = await transaction.exec();
  if (results.some((result) => String(result) !== 'OK')) {
    throw new Error('Could not atomically issue tile nonces');
  }
}

export async function issueNonce(
  nonce: string,
  grant: TileNonceGrant,
  ttlSeconds: number,
) {
  await issueNonceGrants([{ nonce, grant }], ttlSeconds);
}

export async function consumeNonce(nonce: string, sessionId: string) {
  const redis = await client();
  return consumeNonceAtomically(redis, nonce, sessionId);
}

export async function consumeNonceAtomically(
  redis: { sendCommand(command: string[]): Promise<unknown> },
  nonce: string,
  sessionId: string,
) {
  // GETDEL is a single atomic Redis operation. A URL cannot win this check twice.
  const serializedGrant = await redis.sendCommand(['GETDEL', `protected-image:nonce:${nonce}`]);
  if (serializedGrant === null) return null;

  try {
    const grant = JSON.parse(String(serializedGrant)) as Partial<TileNonceGrant>;
    if (
      grant.sessionId !== sessionId ||
      typeof grant.imageId !== 'string' ||
      typeof grant.tileId !== 'string' ||
      typeof grant.storageKey !== 'string'
    ) {
      return null;
    }
    return grant as TileNonceGrant;
  } catch {
    return null;
  }
}

export async function checkRateLimit(sessionId: string, limit: number) {
  const redis = await client();
  const key = `protected-image:rate:${sessionId}:${Math.floor(Date.now() / 60_000)}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 70);
  return count <= limit;
}

export async function acquireCatalogCompatibilityLock(imageId: string) {
  const redis = await client();
  const result = await redis.set(
    `protected-image:catalog-migration:${imageId}`,
    '1',
    { NX: true, EX: 120 },
  );
  return result === 'OK';
}

export async function releaseCatalogCompatibilityLock(imageId: string) {
  const redis = await client();
  await redis.del(`protected-image:catalog-migration:${imageId}`);
}

const consumeGrantWithLimitsScript = `
local sessionCount = redis.call('INCR', KEYS[1])
if sessionCount == 1 then redis.call('EXPIRE', KEYS[1], 70) end
local networkCount = redis.call('INCR', KEYS[2])
if networkCount == 1 then redis.call('EXPIRE', KEYS[2], 70) end
if sessionCount > tonumber(ARGV[2]) or networkCount > tonumber(ARGV[3]) then
  return { 'rate_limited' }
end

local serializedGrant = redis.call('GET', KEYS[3])
if not serializedGrant then return { 'invalid_nonce' } end
local decoded, grant = pcall(cjson.decode, serializedGrant)
if not decoded or grant.sessionId ~= ARGV[1] then
  return { 'invalid_nonce' }
end
redis.call('DEL', KEYS[3])
return { 'ok', serializedGrant }
`;

export async function consumeTileGrantWithRateLimits(input: {
  nonce: string;
  sessionId: string;
  networkKey: string;
  sessionLimit: number;
  networkLimit: number;
}): Promise<
  | { status: 'ok'; grant: TileNonceGrant }
  | { status: 'rate_limited' | 'invalid_nonce' }
> {
  const redis = await client();
  const minute = Math.floor(Date.now() / 60_000);
  const result = await redis.eval(consumeGrantWithLimitsScript, {
    keys: [
      `protected-image:rate:session:${input.sessionId}:${minute}`,
      `protected-image:rate:network:${input.networkKey}:${minute}`,
      `protected-image:nonce:${input.nonce}`,
    ],
    arguments: [
      input.sessionId,
      String(input.sessionLimit),
      String(input.networkLimit),
    ],
  }) as unknown[];
  const status = String(result[0]);
  if (status !== 'ok') {
    return { status: status === 'rate_limited' ? 'rate_limited' : 'invalid_nonce' };
  }

  try {
    const grant = JSON.parse(String(result[1])) as TileNonceGrant;
    if (
      grant.sessionId !== input.sessionId ||
      typeof grant.imageId !== 'string' ||
      typeof grant.tileId !== 'string' ||
      typeof grant.storageKey !== 'string'
    ) {
      return { status: 'invalid_nonce' };
    }
    return { status: 'ok', grant };
  } catch {
    return { status: 'invalid_nonce' };
  }
}
