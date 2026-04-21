const logger = require('../lib/logger');
require('dotenv').config();

const memoryStore = new Map();
const status = {
  backend: 'memory',
  configured: Boolean(process.env.REDIS_URL),
  connected: false,
  last_error: null,
  last_connected_at: null,
};

let initPromise = null;
let redisClient = null;
let initLogged = false;

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nowMs() {
  return Date.now();
}

function ttlMsToSeconds(ttlMs) {
  return Math.max(1, Math.ceil((toPositiveNumber(ttlMs, 0) || 0) / 1000));
}

function makeKey(key) {
  const prefix = String(process.env.REDIS_KEY_PREFIX || 'kaisen').trim();
  return `${prefix}:${String(key || '').trim()}`;
}

function memoryGetEntry(key) {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expires_at && nowMs() >= entry.expires_at) {
    memoryStore.delete(key);
    return null;
  }
  return entry;
}

async function getRedisClient() {
  if (redisClient) return redisClient;
  if (initPromise) return initPromise;
  if (!process.env.REDIS_URL) return null;

  initPromise = (async () => {
    try {
      let Redis = null;
      try {
        // Optional import: si Redis no esta disponible, el store sigue en memoria.
        // eslint-disable-next-line node/no-missing-require
        Redis = require('ioredis');
      } catch (err) {
        status.last_error = 'ioredis_not_installed';
        if (!initLogged) {
          logger.warn('[runtimeStore] REDIS_URL configurado pero ioredis no esta instalado; usando memoria.');
          initLogged = true;
        }
        return null;
      }

      const client = new Redis(process.env.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      await client.connect();
      await client.ping();
      redisClient = client;
      status.backend = 'redis';
      status.connected = true;
      status.last_error = null;
      status.last_connected_at = new Date().toISOString();
      return redisClient;
    } catch (err) {
      status.connected = false;
      status.last_error = err?.message || 'redis_connection_error';
      if (!initLogged) {
        logger.warn(
          `[runtimeStore] no se pudo conectar a Redis; fallback a memoria: ${status.last_error}`
        );
        initLogged = true;
      }
      return null;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

async function getValue(key) {
  const namespaced = makeKey(key);
  const client = await getRedisClient();

  if (client) {
    try {
      const value = await client.get(namespaced);
      status.connected = true;
      return value;
    } catch (err) {
      status.connected = false;
      status.last_error = err?.message || 'redis_get_error';
    }
  }

  const entry = memoryGetEntry(namespaced);
  return entry ? entry.value : null;
}

async function setValue(key, value, ttlMs) {
  const namespaced = makeKey(key);
  const client = await getRedisClient();

  if (client) {
    try {
      if (ttlMs) {
        await client.set(namespaced, value, 'EX', ttlMsToSeconds(ttlMs));
      } else {
        await client.set(namespaced, value);
      }
      status.connected = true;
    } catch (err) {
      status.connected = false;
      status.last_error = err?.message || 'redis_set_error';
    }
  }

  memoryStore.set(namespaced, {
    value,
    expires_at: ttlMs ? nowMs() + toPositiveNumber(ttlMs, 0) : null,
  });
  return value;
}

async function deleteValue(key) {
  const namespaced = makeKey(key);
  const client = await getRedisClient();

  if (client) {
    try {
      await client.del(namespaced);
      status.connected = true;
    } catch (err) {
      status.connected = false;
      status.last_error = err?.message || 'redis_delete_error';
    }
  }

  memoryStore.delete(namespaced);
}

async function getJson(key) {
  const value = await getValue(key);
  if (value == null || value === '') return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

async function setJson(key, value, ttlMs) {
  return setValue(key, JSON.stringify(value), ttlMs);
}

function getRuntimeStoreStatus() {
  return {
    backend: status.backend,
    configured: status.configured,
    connected: status.connected,
    last_error: status.last_error,
    last_connected_at: status.last_connected_at,
    memory_entries: memoryStore.size,
  };
}

module.exports = {
  getValue,
  setValue,
  deleteValue,
  getJson,
  setJson,
  getRuntimeStoreStatus,
};
