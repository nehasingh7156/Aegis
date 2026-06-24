// Caching Service Abstraction - Redis with In-Memory fallback
const redis = require("redis");

let redisClient = null;
let isRedisConnected = false;

// Create Redis Client connecting to process.env.REDIS_URL or localhost
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
try {
  redisClient = redis.createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 3000,
      reconnectStrategy: (retries) => {
        if (retries > 3) {
          console.warn("Redis connection attempts exhausted. Falling back to in-memory cache.");
          isRedisConnected = false;
          return new Error("Redis connection failed");
        }
        return Math.min(retries * 500, 2000);
      }
    }
  });

  redisClient.on("error", (err) => {
    // Suppress errors to prevent process crashes
    console.warn("Redis Client Warning:", err.message);
    isRedisConnected = false;
  });

  redisClient.on("connect", () => {
    console.log("Redis connecting to:", redisUrl);
  });

  redisClient.on("ready", () => {
    console.log("Redis connected and ready.");
    isRedisConnected = true;
  });

  redisClient.connect().catch((err) => {
    console.warn("Redis connection failed on startup, using in-memory cache fallback:", err.message);
    isRedisConnected = false;
  });
} catch (err) {
  console.warn("Failed to initialize Redis client:", err.message);
}

// In-Memory cache fallback
const inMemoryCache = new Map();
const inMemoryExpirations = new Map();

/**
 * Get a value from the cache
 * @param {string} key 
 * @returns {Promise<any>}
 */
async function get(key) {
  if (isRedisConnected && redisClient) {
    try {
      const val = await redisClient.get(key);
      return val ? JSON.parse(val) : null;
    } catch (err) {
      console.warn("Redis GET error, falling back to memory:", err.message);
    }
  }

  // Fallback to in-memory
  if (inMemoryExpirations.has(key)) {
    const expiresAt = inMemoryExpirations.get(key);
    if (Date.now() > expiresAt) {
      inMemoryCache.delete(key);
      inMemoryExpirations.delete(key);
      return null;
    }
  }
  const val = inMemoryCache.get(key);
  return val ? JSON.parse(val) : null;
}

/**
 * Set a value in the cache with a TTL (Time-To-Live)
 * @param {string} key 
 * @param {any} value 
 * @param {number} ttlSeconds 
 * @returns {Promise<boolean>}
 */
async function set(key, value, ttlSeconds = 3600) {
  const valStr = JSON.stringify(value);

  if (isRedisConnected && redisClient) {
    try {
      await redisClient.set(key, valStr, { EX: ttlSeconds });
      return true;
    } catch (err) {
      console.warn("Redis SET error, falling back to memory:", err.message);
    }
  }

  // Fallback to in-memory
  inMemoryCache.set(key, valStr);
  inMemoryExpirations.set(key, Date.now() + (ttlSeconds * 1000));
  return true;
}

/**
 * Delete a value from the cache
 * @param {string} key 
 * @returns {Promise<boolean>}
 */
async function del(key) {
  if (isRedisConnected && redisClient) {
    try {
      await redisClient.del(key);
      return true;
    } catch (err) {
      console.warn("Redis DEL error, falling back to memory:", err.message);
    }
  }

  inMemoryCache.delete(key);
  inMemoryExpirations.delete(key);
  return true;
}

/**
 * Clear all values from the cache
 * @returns {Promise<boolean>}
 */
async function clear() {
  if (isRedisConnected && redisClient) {
    try {
      await redisClient.flushDb();
      return true;
    } catch (err) {
      console.warn("Redis FLUSHDB error, falling back to memory:", err.message);
    }
  }

  inMemoryCache.clear();
  inMemoryExpirations.clear();
  return true;
}

/**
 * Delete all keys matching a specific pattern (e.g., admissions_*)
 * @param {string} pattern 
 * @returns {Promise<boolean>}
 */
async function deletePattern(pattern) {
  if (isRedisConnected && redisClient) {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys && keys.length > 0) {
        await redisClient.del(keys);
      }
      return true;
    } catch (err) {
      console.warn("Redis deletePattern error, falling back to memory:", err.message);
    }
  }

  // Fallback to in-memory
  const regexPattern = "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".");
  const regex = new RegExp(regexPattern);
  
  for (const key of inMemoryCache.keys()) {
    if (regex.test(key)) {
      inMemoryCache.delete(key);
      inMemoryExpirations.delete(key);
    }
  }
  return true;
}

module.exports = {
  get,
  set,
  del,
  clear,
  deletePattern,
  isRedisConnected: () => isRedisConnected
};

