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

export async function issueNonce(nonce: string, sessionId: string, ttlSeconds: number) {
  const redis = await client();
  const result = await redis.set(`protected-image:nonce:${nonce}`, sessionId, { NX: true, EX: ttlSeconds });
  if (result !== 'OK') throw new Error('Could not atomically issue tile nonce');
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
  const owner = await redis.sendCommand(['GETDEL', `protected-image:nonce:${nonce}`]);
  return owner !== null && String(owner) === sessionId;
}

export async function checkRateLimit(sessionId: string, limit: number) {
  const redis = await client();
  const key = `protected-image:rate:${sessionId}:${Math.floor(Date.now() / 60_000)}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 70);
  return count <= limit;
}
