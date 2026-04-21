'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

const DEFAULT_TIMEOUT_MS = Number(process.env.GEMINI_HTTP_TIMEOUT_MS || 15000);
const DEFAULT_CACHE_TTL_MS = Number(process.env.GEMINI_MODEL_CACHE_MS || 10 * 60 * 1000);

function normalizeGeminiModelName(model) {
  return String(model || '').trim().replace(/^models\//i, '');
}

function extractGeminiErrorMessage(text, status) {
  let message = `Gemini HTTP ${status}`;

  try {
    const parsed = JSON.parse(text || '{}');
    if (parsed && parsed.error && parsed.error.message) {
      return `Gemini: ${parsed.error.message}`;
    }
  } catch {}

  if (text) {
    message = `${message} ${text}`.trim();
  }

  return message;
}

function isGeminiModelNotFoundError(message) {
  return /not found|not supported for generatecontent|unsupported model/i.test(String(message || ''));
}

function modelScore(modelName) {
  const name = normalizeGeminiModelName(modelName).toLowerCase();
  let score = 0;

  if (name.includes('flash')) score += 60;
  if (name.includes('pro')) score += 40;

  if (name.includes('2.5')) score += 35;
  else if (name.includes('2.0')) score += 30;
  else if (name.includes('1.5')) score += 20;
  else if (name.includes('1.0')) score += 10;

  if (name.includes('latest')) score += 5;
  if (/\-\d{3}$/.test(name)) score += 2;

  if (name.includes('lite')) score -= 3;

  if (
    name.includes('preview') ||
    name.includes('experimental') ||
    name.includes('-exp') ||
    name.includes('thinking')
  ) {
    score -= 25;
  }

  if (
    name.includes('embedding') ||
    name.includes('vision') ||
    name.includes('image') ||
    name.includes('aqa')
  ) {
    score -= 100;
  }

  return score;
}

function compareModels(a, b) {
  return modelScore(b) - modelScore(a) || a.localeCompare(b);
}

function httpRequest(rawUrl, { method = 'GET', headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error('Gemini HTTP timeout'));
    }, timeoutMs);

    try {
      const url = new URL(rawUrl);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const options = {
        method,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers,
      };

      const req = lib.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);

          resolve({
            status: res.statusCode || 0,
            ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
            text: data,
          });
        });
      });

      req.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });

      if (body) {
        req.write(body);
      }

      req.end();
    } catch (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    }
  });
}

class GeminiModelResolver {
  constructor({ apiKey, logger, timeoutMs = DEFAULT_TIMEOUT_MS, cacheTtlMs = DEFAULT_CACHE_TTL_MS, fallbackModel = 'gemini-1.5-flash' } = {}) {
    this.apiKey = apiKey;
    this.logger = logger;
    this.timeoutMs = timeoutMs;
    this.cacheTtlMs = cacheTtlMs;
    this.fallbackModel = normalizeGeminiModelName(fallbackModel) || 'gemini-1.5-flash';
    this.cache = null;
  }

  async listModels({ forceRefresh = false } = {}) {
    if (!this.apiKey) return [];

    if (
      !forceRefresh &&
      this.cache &&
      Array.isArray(this.cache.models) &&
      Date.now() - this.cache.fetchedAt < this.cacheTtlMs
    ) {
      return this.cache.models;
    }

    const res = await httpRequest(
      `https://generativelanguage.googleapis.com/v1/models?key=${this.apiKey}&pageSize=100`,
      { timeoutMs: this.timeoutMs }
    );

    if (!res.ok) {
      throw new Error(extractGeminiErrorMessage(res.text, res.status));
    }

    const data = JSON.parse(res.text || '{}');
    const models = [...new Set(
      (data.models || [])
        .filter((model) => Array.isArray(model.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent'))
        .map((model) => normalizeGeminiModelName(model.name))
        .filter(Boolean)
    )];

    this.cache = {
      models,
      fetchedAt: Date.now(),
    };

    if (this.logger && typeof this.logger.info === 'function') {
      this.logger.info({ availableModels: models }, 'geminiModelResolver: modelos disponibles');
    }

    return models;
  }

  pickModel(models, preferredModel = '') {
    const normalizedPreferred = normalizeGeminiModelName(preferredModel);

    if (normalizedPreferred && models.includes(normalizedPreferred)) {
      return normalizedPreferred;
    }

    if (!models.length) {
      return normalizedPreferred || this.fallbackModel;
    }

    return [...models].sort(compareModels)[0] || normalizedPreferred || this.fallbackModel;
  }

  async resolveModel({ preferredModel = '', forceRefresh = false } = {}) {
    const models = await this.listModels({ forceRefresh });
    return this.pickModel(models, preferredModel);
  }

  invalidate(model) {
    const normalizedModel = normalizeGeminiModelName(model);
    if (!normalizedModel || !this.cache || !Array.isArray(this.cache.models)) return;

    this.cache.models = this.cache.models.filter((cachedModel) => cachedModel !== normalizedModel);
    this.cache.fetchedAt = 0;
  }
}

module.exports = {
  GeminiModelResolver,
  extractGeminiErrorMessage,
  isGeminiModelNotFoundError,
  normalizeGeminiModelName,
};
