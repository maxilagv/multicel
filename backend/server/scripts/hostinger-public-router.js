#!/usr/bin/env node
const http = require('http');
const https = require('https');

function parseTarget(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  const url = new URL(value);
  const port =
    url.port || (url.protocol === 'https:' ? '443' : '80');
  return {
    protocol: url.protocol,
    hostname: url.hostname,
    port,
    basePath: url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, ''),
  };
}

function parsePrefixTargets(raw) {
  return String(raw || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex === -1) {
        throw new Error(`ROUTER_PREFIX_TARGETS invalido: ${entry}`);
      }
      const prefix = entry.slice(0, separatorIndex).trim().replace(/\/+$/, '');
      const target = parseTarget(entry.slice(separatorIndex + 1).trim());
      if (!prefix || prefix[0] !== '/') {
        throw new Error(`Prefix invalido en ROUTER_PREFIX_TARGETS: ${entry}`);
      }
      if (!target) {
        throw new Error(`Target invalido en ROUTER_PREFIX_TARGETS: ${entry}`);
      }
      return { prefix, target };
    })
    .sort((a, b) => b.prefix.length - a.prefix.length);
}

function matchPrefix(pathname, prefixRoutes) {
  for (const route of prefixRoutes) {
    if (pathname === route.prefix || pathname.startsWith(`${route.prefix}/`)) {
      return route;
    }
  }
  return null;
}

function buildForwardPath(reqUrl, matchedPrefix, target) {
  const current = new URL(reqUrl, 'http://router.local');
  let pathname = current.pathname;
  if (matchedPrefix) {
    pathname = pathname.slice(matchedPrefix.length) || '/';
  }
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const basePath = target.basePath || '';
  return `${basePath}${normalized}${current.search || ''}`;
}

function createProxyServer() {
  const listenPort = Number(process.env.ROUTER_PORT || 3000);
  const defaultTarget = parseTarget(process.env.ROUTER_DEFAULT_TARGET);
  if (!defaultTarget) {
    throw new Error('ROUTER_DEFAULT_TARGET es obligatorio');
  }
  const prefixRoutes = parsePrefixTargets(process.env.ROUTER_PREFIX_TARGETS);

  const server = http.createServer((req, res) => {
    if (req.url === '/__router/readyz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          port: listenPort,
          defaultTarget: `${defaultTarget.protocol}//${defaultTarget.hostname}:${defaultTarget.port}${defaultTarget.basePath}`,
          routes: prefixRoutes.map((route) => ({
            prefix: route.prefix,
            target: `${route.target.protocol}//${route.target.hostname}:${route.target.port}${route.target.basePath}`,
          })),
        })
      );
      return;
    }

    const current = new URL(req.url, 'http://router.local');
    const matched = matchPrefix(current.pathname, prefixRoutes);
    const target = matched ? matched.target : defaultTarget;
    const forwardPath = buildForwardPath(req.url, matched?.prefix || '', target);
    const transport = target.protocol === 'https:' ? https : http;

    const headers = {
      ...req.headers,
      host: req.headers.host || `${target.hostname}:${target.port}`,
      'x-forwarded-host': req.headers.host || '',
      'x-forwarded-proto': req.socket.encrypted ? 'https' : 'http',
      'x-forwarded-prefix': matched?.prefix || '',
    };

    const proxyReq = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        method: req.method,
        path: forwardPath,
        headers,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (error) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'application/json' });
      }
      res.end(
        JSON.stringify({
          error: 'Proxy upstream error',
          detail: error.message,
          path: current.pathname,
        })
      );
    });

    req.pipe(proxyReq);
  });

  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  server.listen(listenPort, '0.0.0.0', () => {
    console.log(
      JSON.stringify({
        status: 'listening',
        port: listenPort,
        defaultTarget: `${defaultTarget.protocol}//${defaultTarget.hostname}:${defaultTarget.port}${defaultTarget.basePath}`,
        routes: prefixRoutes,
      })
    );
  });
}

createProxyServer();
