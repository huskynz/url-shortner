import { createClient } from 'redis';

function normalizeRedisUrl(url) {
  return (url || '').trim().replace(/^['"]|['"]$/g, '');
}

const REDIS_URL = normalizeRedisUrl(process.env.REDIS_URL) || 'redis://localhost:6379';
const CIRCUIT_BREAKER_THRESHOLD = Number(process.env.REDIS_CIRCUIT_BREAKER_THRESHOLD || 3);
const CIRCUIT_BREAKER_RESET_MS = Number(process.env.REDIS_CIRCUIT_BREAKER_RESET_MS || 30_000);
const KEEP_ALIVE_INTERVAL_MS = Number(process.env.REDIS_KEEP_ALIVE_INTERVAL_MS || 30_000);
const POOL_SIZE = Number(process.env.REDIS_POOL_SIZE || 2);

const globalRedis = globalThis.__redisSingleton || {
  pool: [],
  poolIndex: -1,
  connectPromises: new Map(),
  keepAliveInterval: null,
  failureCount: 0,
  circuitOpenUntil: 0,
  lastHealthLog: 0
};

if (!globalThis.__redisSingleton) {
  globalThis.__redisSingleton = globalRedis;
}

function isCircuitOpen() {
  const now = Date.now();
  if (globalRedis.circuitOpenUntil > now) {
    return true;
  }

  if (globalRedis.circuitOpenUntil && globalRedis.circuitOpenUntil <= now) {
    console.warn('[redis] Circuit breaker closed after cooldown. Retrying connections.');
    globalRedis.failureCount = 0;
    globalRedis.circuitOpenUntil = 0;
  }

  return false;
}

function recordFailure(error) {
  globalRedis.failureCount += 1;
  console.error('[redis] Connection failure', error);

  if (globalRedis.failureCount >= CIRCUIT_BREAKER_THRESHOLD && !isCircuitOpen()) {
    globalRedis.circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_RESET_MS;
    console.warn(`[redis] Circuit breaker opened for ${CIRCUIT_BREAKER_RESET_MS}ms after repeated failures.`);
  }
}

function recordSuccess() {
  if (globalRedis.failureCount > 0 || globalRedis.circuitOpenUntil > 0) {
    console.info('[redis] Connection restored. Resetting circuit breaker.');
  }
  globalRedis.failureCount = 0;
  globalRedis.circuitOpenUntil = 0;
}

function buildClient() {
  const client = createClient({
    url: REDIS_URL,
    socket: {
      keepAlive: KEEP_ALIVE_INTERVAL_MS,
      reconnectStrategy: (retries) => Math.min(retries * 50, 1000)
    }
  });

  client.on('ready', () => {
    recordSuccess();
    const now = Date.now();
    if (now - globalRedis.lastHealthLog > 60_000) {
      console.info('[redis] Client ready and healthy.');
      globalRedis.lastHealthLog = now;
    }
  });

  client.on('error', (err) => {
    recordFailure(err);
  });

  client.on('end', () => {
    console.warn('[redis] Connection closed.');
  });

  return client;
}

async function connectClient(client) {
  if (client.isOpen) {
    return client;
  }

  if (!globalRedis.connectPromises.has(client)) {
    const connectPromise = client.connect().then(() => {
      startKeepAlive();
      return client;
    }).catch((err) => {
      globalRedis.connectPromises.delete(client);
      recordFailure(err);
      throw err;
    });

    globalRedis.connectPromises.set(client, connectPromise);
  }

  return globalRedis.connectPromises.get(client);
}

function startKeepAlive() {
  if (globalRedis.keepAliveInterval) return;

  globalRedis.keepAliveInterval = setInterval(async () => {
    if (isCircuitOpen()) return;
    try {
      const client = await getRedisClient();
      if (client) {
        await client.ping();
      }
    } catch (err) {
      recordFailure(err);
    }
  }, KEEP_ALIVE_INTERVAL_MS).unref?.();
}

function getOrCreateClient() {
  if (globalRedis.pool.length < POOL_SIZE) {
    const client = buildClient();
    globalRedis.pool.push(client);
  }

  globalRedis.poolIndex = (globalRedis.poolIndex + 1) % globalRedis.pool.length;
  return globalRedis.pool[globalRedis.poolIndex];
}

export async function getRedisClient() {
  if (isCircuitOpen()) {
    return null;
  }

  const client = getOrCreateClient();
  try {
    await connectClient(client);
    return client;
  } catch (err) {
    // Fall back quickly if Redis is unavailable
    return null;
  }
}

export function isRedisHealthy() {
  return !isCircuitOpen() && globalRedis.failureCount === 0;
}

const redisClient = getOrCreateClient();

export default redisClient;
