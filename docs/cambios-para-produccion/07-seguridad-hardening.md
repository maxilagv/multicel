# Seguridad Enterprise — Hardening Completo del Sistema

**Estado actual:** El sistema tiene una base de seguridad sólida (Helmet, CORS, rate limiting, MFA, JWT blacklist, audit log, bcrypt, Zod validation). Sin embargo, la URL del login admin es predecible (`/login`), faltan algunas defensas OWASP y la superficie de ataque del catálogo público no está completamente aislada.  
**Objetivo:** Llevar el sistema al nivel de seguridad enterprise, sin ninguna vulnerabilidad conocida de OWASP Top 10, MITRE CWE, o vectores de explotación comunes. El login admin debe ser prácticamente imposible de encontrar.

---

## ÍNDICE

1. [Auditoría de Seguridad Actual](#1-auditoría-de-seguridad-actual)
2. [URL Oculta para el Login Admin](#2-url-oculta-para-el-login-admin)
3. [Protección contra OWASP Top 10](#3-protección-contra-owasp-top-10)
4. [Hardening de JWT y Sesiones](#4-hardening-de-jwt-y-sesiones)
5. [Protección de la Infraestructura](#5-protección-de-la-infraestructura)
6. [Separación de Superficies Admin/Catálogo](#6-separación-de-superficies-admin-catálogo)
7. [Monitoreo y Respuesta a Incidentes](#7-monitoreo-y-respuesta-a-incidentes)
8. [Headers de Seguridad Completos](#8-headers-de-seguridad-completos)
9. [Dependencias y Supply Chain](#9-dependencias-y-supply-chain)
10. [Checklist de Compliance](#10-checklist-de-compliance)
11. [Plan de Implementación](#11-plan-de-implementación)

---

## 1. Auditoría de Seguridad Actual

### 1.1 Lo que está bien implementado

| Control | Estado | Ubicación |
|---|---|---|
| bcrypt para contraseñas | ✓ Implementado | `authcontroller.js` |
| JWT con rotación de refresh tokens | ✓ Implementado | `authmiddleware.js` |
| JWT blacklist (en memoria + DB) | ✓ Implementado | `tokenRevocationStore`, `jwtBlacklistRepository` |
| MFA TOTP (Google Authenticator) | ✓ Implementado | `mfaService.js` |
| Rate limiting en login | ✓ 5 intentos / 15 min | `security.js` — `loginLimiter` |
| Rate limiting global | ✓ Implementado | `apiGlobalLimiter` |
| CORS configurado | ✓ Via `CORS_ALLOWED_ORIGINS` | `index.js` |
| Helmet (headers básicos) | ✓ Implementado | `index.js` |
| XSS protection (`xss-clean`) | ✓ Implementado | `index.js` |
| HPP protection | ✓ Implementado | `index.js` |
| Zod validation en endpoints críticos | ✓ Implementado | Varios controllers |
| Audit log | ✓ Implementado | `auditMiddleware.js` |
| TOTP backup codes | ✓ Implementado | `mfaService.js` |
| Alertas de login fallido por WhatsApp | ✓ Implementado | `security.js` |
| Path traversal protection | ✓ Implementado | `security.js` |
| Sentry error tracking | ✓ Implementado | `index.js` |

### 1.2 Brechas identificadas

| Brecha | Severidad | CWE | OWASP |
|---|---|---|---|
| URL del login admin es `/login` — predecible | Alta | CWE-287 | A07: Auth Failures |
| Sin protección contra enumeración de usuarios | Media | CWE-204 | A07: Auth Failures |
| Sin cabecera `Permissions-Policy` | Media | — | A05: Misconfiguration |
| CSP no cubre todos los recursos del catálogo | Media | CWE-79 | A03: Injection |
| Sin límite de tamaño de request body | Media | CWE-400 | A05: Misconfiguration |
| Swagger expuesto en `/api/docs` en producción | Alta | CWE-200 | A01: Access Control |
| Sin protección CSRF en endpoints mutantes del catálogo | Media | CWE-352 | A01: Access Control |
| Contraseñas de clientes del catálogo sin política de complejidad | Media | CWE-521 | A07: Auth Failures |
| Sin rotación automática de JWT en inactividad | Baja | CWE-613 | A07: Auth Failures |
| Sin fingerprinting de dispositivo para sesiones | Baja | CWE-287 | A07: Auth Failures |
| Sin protección contra ataques de timing en comparación de secrets | Media | CWE-208 | A02: Crypto Failures |

---

## 2. URL Oculta para el Login Admin

### 2.1 Estrategia

El panel admin actualmente está en `/app/...` con login en `/login`. Cualquier atacante que sepa que existe un ERP puede probar `/login`, `/admin`, `/admin/login`, `/app/login`, etc.

**Solución:** Mover el login del admin a una URL basada en un token secreto de 32 bytes aleatorio, que se configura en las variables de entorno y **nunca se expone en el código fuente público**.

```
URL real del login admin: https://tudominio.com/secure-[HASH_32_BYTES]/access
```

**Ejemplo de URL generada:**
```
https://erp.miempresa.com/secure-a8f3c2d91b4e57f06a2c3d8e9b1f4a7c/access
```

Esta URL:
- No aparece en ningún link público.
- No aparece en el sitemap.
- No tiene ningún patrón predecible.
- Si alguien llega a `/login`, `/admin`, `/app` recibe `404 Not Found` (no un redirect).

### 2.2 Implementación en el backend

```js
// backend/server/middlewares/adminUrlGuard.js

const ADMIN_PATH_TOKEN = process.env.ADMIN_PATH_TOKEN;
// Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

function adminUrlGuard(req, res, next) {
  // Rutas que SIEMPRE son públicas:
  const PUBLIC_PREFIXES = ['/api/portal', '/api/health', '/catalogo'];
  if (PUBLIC_PREFIXES.some(p => req.path.startsWith(p))) {
    return next();
  }

  // Rutas de la API que requieren auth JWT (ya protegidas por authmiddleware):
  if (req.path.startsWith('/api/')) {
    return next();
  }

  // Rutas del panel admin — verificar token en URL:
  if (req.path.startsWith('/app') || req.path.startsWith('/login')) {
    if (!ADMIN_PATH_TOKEN) {
      return next(); // En desarrollo sin token, permitir
    }
    const expectedPrefix = `/secure-${ADMIN_PATH_TOKEN}`;
    if (!req.originalUrl.startsWith(expectedPrefix)) {
      return res.status(404).send('Not Found'); // No revelar que hay algo ahí
    }
    // Reescribir la URL para que el frontend la procese normalmente
    req.url = req.originalUrl.replace(expectedPrefix, '');
    return next();
  }

  next();
}

module.exports = { adminUrlGuard };
```

**En `index.js`, agregar ANTES de servir el frontend:**
```js
const { adminUrlGuard } = require('./middlewares/adminUrlGuard');
app.use(adminUrlGuard);
```

### 2.3 Implementación en el frontend

El frontend React necesita saber cuál es el prefijo de URL para construir links internos correctamente. Sin embargo, **el token no debe estar en el bundle de JavaScript**.

**Estrategia:** El token se inyecta como una meta tag en el HTML inicial, servido desde el backend:

```js
// En el servidor, al servir index.html para el panel admin:
app.get(`/secure-${ADMIN_PATH_TOKEN}/*`, (req, res) => {
  const html = buildAdminHtml({ adminPrefix: `/secure-${ADMIN_PATH_TOKEN}` });
  res.send(html);
});
```

Alternativamente, la URL oculta sirve simplemente como "llave de entrada" y una vez dentro, el frontend usa el hash fragment (`#`) para navegar, que no aparece en logs del servidor.

### 2.4 Variables de entorno

```env
# Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ADMIN_PATH_TOKEN=a8f3c2d91b4e57f06a2c3d8e9b1f4a7c2e5d9f3b6a8c1e4f7d0b3a6c9f2e5d8b1

# Si se rota el token, el anterior debe dejar de funcionar inmediatamente
```

### 2.5 Honeypot para detectar atacantes

```js
// Agregar rutas trampa que alertan al admin cuando alguien las visita:
app.use(['/admin', '/login', '/wp-admin', '/wp-login.php', '/.env', '/config'], (req, res) => {
  sendSMSNotification(
    `Intento de acceso sospechoso: ${req.originalUrl} desde IP ${req.ip}`
  ).catch(() => {});
  res.status(404).send('Not Found');
});
```

---

## 3. Protección contra OWASP Top 10

### 3.1 A01 — Broken Access Control

**Fixes adicionales:**

```js
// backend/server/middlewares/accessControl.js

// Verificar que usuario nunca acceda a recursos de otro usuario:
function ownResourceGuard(resourceField) {
  return async (req, res, next) => {
    const id = Number(req.params.id);
    if (!id) return next();

    // El middleware de auth ya puso req.user.sub
    const resource = await db.query(`SELECT ${resourceField} FROM ... WHERE id = ?`, [id]);
    if (!resource || resource[resourceField] !== req.user.sub) {
      return res.status(403).json({ error: 'Acceso denegado', code: 'FORBIDDEN' });
    }
    next();
  };
}
```

**Swagger deshabilitado en producción:**
```js
// En index.js:
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
} else {
  app.get('/api/docs', (req, res) => res.status(404).send('Not Found'));
}
```

**Enumeración de IDs:** Usar UUIDs o hashids en lugar de IDs secuenciales para recursos del catálogo:
```js
// Para pedidos del catálogo, el número es: 'PED-' + hashids.encode(id)
// Nunca exponer el ID numérico de la DB en URLs públicas
```

### 3.2 A02 — Cryptographic Failures

**bcrypt cost factor:** Aumentar a 12 (actualmente puede ser menor):
```js
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');
const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
```

**Comparación de tokens con timing-safe equals:**
```js
// En lugar de: token === storedToken
// Usar:
const crypto = require('crypto');
function safeTokenCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) {
    // Aun así hacer la comparación para evitar timing de longitud
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
```

**TLS:** Verificar que `HTTPS` esté forzado en producción (Render lo hace automáticamente, pero documentarlo).

### 3.3 A03 — Injection

**SQL Injection:** El sistema usa queries parametrizadas. Verificar que NO haya ninguna interpolación de string en queries:

```js
// ✗ INSEGURO (nunca hacer esto):
db.query(`SELECT * FROM productos WHERE nombre = '${req.query.nombre}'`);

// ✓ SEGURO:
db.query('SELECT * FROM productos WHERE nombre = ?', [req.query.nombre]);
```

**Búsqueda global:** El endpoint de búsqueda de productos usa `LIKE`:
```js
// ✓ Ya parametrizado, pero agregar sanitización de wildcards:
const q = String(req.query.q || '').replace(/[%_\\]/g, '\\$&');
db.query('SELECT * FROM productos WHERE nombre LIKE ?', [`%${q}%`]);
```

**NoSQL Injection:** No aplica — el sistema usa MySQL, no MongoDB.

**XSS — CSP completo:**
```js
// En helmet:
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'nonce-{NONCE}'"],  // usar nonces para scripts inline
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://images.unsplash.com"],
    connectSrc: ["'self'", process.env.VITE_API_BASE_URL],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
    objectSrc: ["'none'"],
    mediaSrc: ["'none'"],
    frameSrc: ["'none'"],
    upgradeInsecureRequests: [],
  },
}));
```

### 3.4 A04 — Insecure Design

**Límite de tamaño de body:**
```js
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));
```

**Para uploads de archivos (comprobantes):**
```js
const multer = require('multer');
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB máximo
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de archivo no permitido'), false);
  },
});
```

**Verificación de tipo de archivo por magic bytes (no solo mimetype):**
```js
const { fileTypeFromBuffer } = require('file-type');

async function verifyFileType(buffer) {
  const type = await fileTypeFromBuffer(buffer);
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!type || !allowed.includes(type.mime)) {
    throw new Error('Tipo de archivo inválido');
  }
  return type;
}
```

### 3.5 A05 — Security Misconfiguration

**`Permissions-Policy` header:**
```js
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()');
  next();
});
```

**Deshabilitar la header `X-Powered-By`:**
```js
app.disable('x-powered-by'); // Helmet ya lo hace, pero es explícito
```

**Variables de entorno — validación al arranque:**
```js
// backend/server/lib/validateEnv.js
const REQUIRED_ENV = [
  'JWT_SECRET', 'REFRESH_TOKEN_SECRET', 'DB_HOST', 'DB_NAME',
  'ADMIN_PATH_TOKEN', 'CLIENT_JWT_SECRET'
];

function validateEnv() {
  const missing = REQUIRED_ENV.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Variables de entorno requeridas no configuradas: ${missing.join(', ')}`);
  }
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
  }
}

module.exports = { validateEnv };
```

### 3.6 A07 — Identification and Authentication Failures

**Enumeración de usuarios — protección:**
```js
// En authcontroller.js — login():
// Actualmente si el email no existe, devuelve 404 (revela si el email existe)
// Cambiar para siempre devolver el mismo mensaje:

async function login(req, res) {
  // ...
  const user = await users.findByEmail(email);

  // Siempre hacer el bcrypt compare, aunque el usuario no exista
  // para evitar timing attacks que revelen si el email está registrado
  const fakeHash = '$2b$12$invalidhashforcomparisonpurposesonly12345678901234567890';
  const hashToCompare = user ? user.password_hash : fakeHash;
  const valid = await bcrypt.compare(password, hashToCompare);

  if (!user || !valid) {
    // Mismo mensaje siempre — nunca "usuario no encontrado" o "contraseña incorrecta"
    return res.status(401).json({ error: 'Credenciales inválidas', code: 'AUTH_INVALID' });
  }
  // ...
}
```

**MFA obligatorio para admin:**
```js
// En authcontroller.js — si el usuario es admin y no tiene MFA activo:
if (user.rol === 'admin' && !user.totp_enabled) {
  // Emitir un token temporal (15 min) que SOLO permite configurar MFA
  const tempToken = jwt.sign(
    { sub: user.id, scope: 'mfa_setup_required' },
    SECRET, { expiresIn: '15m' }
  );
  return res.status(200).json({
    mfa_required: true,
    mfa_setup_required: true,
    temp_token: tempToken,
    message: 'Debe configurar MFA antes de acceder al sistema'
  });
}
```

**Bloqueo de cuenta después de intentos fallidos (ya existe parcialmente):**
```js
// Agregar bloqueo temporal en DB (no solo en memoria):
ALTER TABLE usuarios ADD COLUMN login_intentos_fallidos INT NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN login_bloqueado_hasta DATETIME NULL;

// En login():
if (user.login_bloqueado_hasta && new Date(user.login_bloqueado_hasta) > new Date()) {
  return res.status(429).json({
    error: 'Cuenta temporalmente bloqueada',
    bloqueada_hasta: user.login_bloqueado_hasta
  });
}
```

### 3.7 A08 — Software and Data Integrity Failures

**Verificar integridad de comprobantes (hash SHA-256):**
```js
// En cuentaEmpresaService.js:
const crypto = require('crypto');
const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

// Verificar que no se cargue el mismo comprobante dos veces:
const existing = await db.query(
  'SELECT id FROM cuenta_empresa_transacciones WHERE comprobante_hash = ?',
  [fileHash]
);
if (existing.length > 0) {
  return res.status(409).json({ error: 'Este comprobante ya fue cargado' });
}
```

### 3.8 A09 — Security Logging and Monitoring Failures

**Aumentar el audit log para cubrir más eventos:**
```js
// Eventos a registrar que aún faltan:
// - Cambios de tipo de cambio (dólar colchón)
// - Intentos de acceso a URL del panel admin sin el token correcto
// - Descarga de reportes (con qué filtros)
// - Cambios de configuración del sistema
// - Creación/eliminación de usuarios
// - Modificación de precios de productos

// En auditMiddleware.js, agregar para métodos PUT/PATCH/DELETE:
const SENSITIVE_ENTITIES = ['productos', 'usuarios', 'clientes', 'ventas',
                             'tipos_cambio_config', 'parametros_sistema'];
```

### 3.9 A10 — Server-Side Request Forgery (SSRF)

**Proteger el servicio de actualización de tipos de cambio:**
```js
// En tipoCambioService.js — verificar que la URL de la API es una URL externa válida:
function validateApiUrl(url) {
  try {
    const parsed = new URL(url);
    // Solo HTTPS externo
    if (parsed.protocol !== 'https:') throw new Error('Solo HTTPS');
    // No permitir IPs privadas
    const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.', '10.', '192.168.', '172.'];
    if (BLOCKED_HOSTS.some(h => parsed.hostname.startsWith(h))) {
      throw new Error('URL no permitida');
    }
    return parsed.toString();
  } catch {
    throw new Error('URL de API externa inválida');
  }
}
```

---

## 4. Hardening de JWT y Sesiones

### 4.1 Rotación automática de refresh tokens

Actualmente el refresh token se rota con cada renovación. Agregar también rotación en inactividad:

```js
// Si el refresh token no se usa en 30 días, invalidarlo:
// En tokenRepository.js, al crear un refresh token:
const REFRESH_TOKEN_MAX_IDLE_DAYS = 30;
const expires_at = new Date(Date.now() + REFRESH_TOKEN_MAX_IDLE_DAYS * 86400000);
```

### 4.2 Device fingerprinting básico

```js
// Al emitir tokens, registrar User-Agent + IP (ya se hace en auth_refresh_tokens)
// Al usar el refresh token, verificar que el UA no cambió drásticamente:
async function validateRefreshTokenFingerprint(token, req) {
  const stored = await db.query(
    'SELECT user_agent, ip FROM auth_refresh_tokens WHERE jti = ?', [token.jti]
  );
  if (!stored) return false;

  // Alertar (no bloquear) si el IP cambió radicalmente
  if (stored.ip && req.ip && stored.ip !== req.ip) {
    await sendSMSNotification(
      `Posible robo de sesión: refresh token usado desde IP diferente. Original: ${stored.ip}, Nuevo: ${req.ip}`
    );
  }

  return true;
}
```

### 4.3 Cookie httpOnly para panel admin

En lugar de localStorage para el access token del admin (actual), usar cookies httpOnly:

```js
// Al hacer login exitoso, además del JSON response, setear cookie:
res.cookie('admin_at', accessToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 15 * 60 * 1000, // 15 minutos
  path: '/',
});
```

**Nota:** Esto requiere cambios en el frontend para leer de cookie en lugar de localStorage. Implica también agregar protección CSRF.

### 4.4 Protección CSRF para el panel admin

```js
const { doubleCsrf } = require('csrf-csrf');

const { doubleCsrfProtection, generateToken } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET,
  cookieName: '__Host-kaisenrp.csrf',
  cookieOptions: {
    sameSite: 'strict',
    secure: true,
    httpOnly: true,
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
});

// Aplicar solo a endpoints mutantes del panel admin:
app.use('/api/', doubleCsrfProtection);
```

---

## 5. Protección de la Infraestructura

### 5.1 Variables de entorno — gestión segura

```env
# .env.example (commitear)
JWT_SECRET=
REFRESH_TOKEN_SECRET=
ADMIN_PATH_TOKEN=
CLIENT_JWT_SECRET=
CLIENT_REFRESH_SECRET=
CSRF_SECRET=
BCRYPT_ROUNDS=12
DB_SSL=true

# .env (NUNCA commitear — está en .gitignore)
```

**Validación al arranque (ver §3.5) — lista completa:**
```
JWT_SECRET, REFRESH_TOKEN_SECRET, CLIENT_JWT_SECRET, CLIENT_REFRESH_SECRET,
ADMIN_PATH_TOKEN, CSRF_SECRET, DB_HOST, DB_NAME, DB_USER, DB_PASSWORD,
CORS_ALLOWED_ORIGINS
```

### 5.2 Protección de la DB en producción

```sql
-- El usuario de la DB en producción debe ser de solo lectura para las tablas de solo lectura:
-- Usuario de la aplicación: solo INSERT/UPDATE/SELECT en tablas de negocio
-- No debe poder hacer DROP TABLE, CREATE TABLE, etc.
-- Las migraciones se ejecutan con un usuario admin separado

GRANT SELECT, INSERT, UPDATE, DELETE ON kaisenrp.* TO 'app_user'@'%';
REVOKE DROP, CREATE, ALTER ON kaisenrp.* FROM 'app_user'@'%';
```

### 5.3 SSL/TLS en la conexión a la DB

```js
// En la configuración de mysql2:
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
  connectionLimit: 10,
  // Sin idle restart (evitar el reinicio tosqueante del server):
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});
```

### 5.4 Nginx como reverse proxy (ya existe en `/nginx/`)

Agregar headers de seguridad a nivel Nginx:

```nginx
# /nginx/nginx.conf
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

# Rate limiting a nivel Nginx (antes de llegar a Node):
limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

location /api/auth/login {
  limit_req zone=login burst=5 nodelay;
  proxy_pass http://backend;
}

location /api/ {
  limit_req zone=api burst=30 nodelay;
  proxy_pass http://backend;
}
```

---

## 6. Separación de Superficies Admin/Catálogo

### 6.1 CORS diferenciado

```js
// En index.js:
const adminCors = cors({
  origin: (origin, callback) => {
    const allowed = (process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(o => o.trim());
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS: origen no permitido'));
    }
  },
  credentials: true,
});

const portalCors = cors({
  origin: process.env.CATALOG_DOMAIN || process.env.CORS_ALLOWED_ORIGINS,
  credentials: true,
});

// Aplicar CORS diferenciado:
app.use('/api/portal', portalCors);  // catálogo usa su propio CORS
app.use('/api/', adminCors);          // panel admin tiene CORS más restrictivo
```

### 6.2 Subdomain separation (opcional, para máximo aislamiento)

Si en el futuro se quiere máximo aislamiento, mover la API del portal a un subdominio separado:
```
api.tienda.com     → Solo endpoints del catálogo (portal)
api.erp.com        → Solo endpoints del panel admin
```

Esto permite políticas de firewall y WAF completamente separadas.

---

## 7. Monitoreo y Respuesta a Incidentes

### 7.1 Alertas críticas vía WhatsApp (ya existe `alertService`)

Eventos que deben disparar alerta inmediata:
```js
const SECURITY_EVENTS = {
  LOGIN_ADMIN_HONEYPOT:   'Intento de acceso a URL trampa del admin',
  LOGIN_BRUTE_FORCE:      'Más de 5 intentos fallidos de login',
  UNUSUAL_BULK_DOWNLOAD:  'Descarga masiva de datos (>1000 registros)',
  ADMIN_FROM_NEW_COUNTRY: 'Login admin desde país no habitual',
  MFA_BYPASS_ATTEMPT:     'Intento de bypassear MFA',
  DB_ERROR_RATE_HIGH:     'Tasa de errores de DB elevada',
  JWT_SECRET_ROTATION:    'Los JWT secrets fueron rotados',
};
```

### 7.2 Dashboard de seguridad para el admin

En `ConfiguracionAdmin.tsx`, nueva sección "Seguridad":
- Últimos 10 intentos de login fallidos (con IP y timestamp).
- Sesiones activas (access tokens no expirados).
- Eventos del audit log filtrados por tipo de acción crítica.
- Botón "Revocar todas las sesiones" (logout global).

### 7.3 Logout global de emergencia

Endpoint que revoca TODOS los refresh tokens activos:

```
POST /api/admin/security/logout-global
Acceso: solo admin
Body: { motivo: String, confirmar: true }
```

Esto invalida todas las sesiones activas de todos los usuarios. Útil en caso de breach.

---

## 8. Headers de Seguridad Completos

### 8.1 Configuración completa de Helmet

```js
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'none'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false, // Puede romper iframes de PDFs
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
}));

// Headers adicionales no cubiertos por Helmet:
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  next();
});
```

---

## 9. Dependencias y Supply Chain

### 9.1 Auditoría de dependencias

```bash
# Ejecutar regularmente:
npm audit --audit-level=high

# Para el backend:
cd backend/server && npm audit

# Para el frontend:
cd frontend-react && npm audit
```

### 9.2 Dependencias críticas a revisar

| Paquete | Versión mínima recomendada | Por qué |
|---|---|---|
| `jsonwebtoken` | `^9.0.0` | CVEs en versiones anteriores |
| `bcryptjs` | Última | Sin CVEs conocidos, mantener actualizado |
| `express` | `^4.19.0` | Path traversal fix |
| `multer` | `^1.4.5-lts.1` | ReDoS fix |
| `helmet` | `^7.0.0` | CSP improvements |
| `@whiskeysockets/baileys` | Última | WhatsApp API, frecuentes updates |

### 9.3 CI/CD — Security checks automáticos

Agregar al pipeline de CI:
```yaml
# .github/workflows/security.yml
- name: Audit backend
  run: cd backend/server && npm audit --audit-level=high

- name: Audit frontend  
  run: cd frontend-react && npm audit --audit-level=high

- name: Check for secrets in code
  uses: trufflesecurity/trufflehog@main
  with:
    path: ./
    base: main
    head: HEAD
```

---

## 10. Checklist de Compliance

### OWASP Top 10 — Estado post-implementación

| # | Vulnerabilidad | Estado |
|---|---|---|
| A01 | Broken Access Control | ✓ Roles, ownResourceGuard, admin URL oculta |
| A02 | Cryptographic Failures | ✓ bcrypt 12 rounds, timing-safe compare, TLS |
| A03 | Injection | ✓ Parámetros SQL, Zod validation, XSS-clean |
| A04 | Insecure Design | ✓ Límites de body/upload, verificación por magic bytes |
| A05 | Security Misconfiguration | ✓ Helmet completo, Swagger off en prod, env validation |
| A06 | Vulnerable Components | ✓ CI/CD audit automático |
| A07 | Auth Failures | ✓ Brute force block, MFA obligatorio admin, no enum usuarios |
| A08 | Data Integrity Failures | ✓ Hash SHA-256 de comprobantes |
| A09 | Logging Failures | ✓ Audit log ampliado, Sentry, alertas WhatsApp |
| A10 | SSRF | ✓ URL validation para APIs externas |

---

## 11. Plan de Implementación

### Etapa 1 — URL oculta del admin (1 día) — CRÍTICO
- [ ] Generar `ADMIN_PATH_TOKEN` con crypto
- [ ] Implementar `adminUrlGuard.js`
- [ ] Configurar honeypot routes
- [ ] Actualizar `index.js` para servir el admin solo desde la URL oculta
- [ ] Actualizar la documentación interna con la nueva URL
- [ ] Comunicar la nueva URL a todos los usuarios admin actuales

### Etapa 2 — Hardening de autenticación (1 día)
- [ ] Anti-enumeración de usuarios en login
- [ ] MFA obligatorio para admin
- [ ] Bloqueo de cuenta en DB (columnas `login_intentos_fallidos`, `login_bloqueado_hasta`)
- [ ] Validación de contraseña del cliente del portal

### Etapa 3 — Headers y configuración (0.5 días)
- [ ] Helmet completo con CSP detallado
- [ ] `Permissions-Policy` header
- [ ] `validateEnv()` al arranque del servidor
- [ ] Swagger deshabilitado en producción
- [ ] Body size limits

### Etapa 4 — Logging y monitoreo (0.5 días)
- [ ] Ampliar `auditMiddleware.js` con más eventos
- [ ] Dashboard de seguridad en `ConfiguracionAdmin.tsx`
- [ ] Endpoint `POST /api/admin/security/logout-global`
- [ ] Honeypot alert via `alertService`

### Etapa 5 — Supply chain y CI/CD (1 día)
- [ ] `npm audit` en CI
- [ ] TruffleHog para secrets en commits
- [ ] Documentar política de actualización de deps

### Testing crítico de seguridad
- Probar `/login` → debe dar 404.
- Probar `/admin` → debe dar 404.
- Probar `/wp-admin` → debe dar 404 Y enviar alerta WhatsApp.
- Login con email incorrecto: mismo tiempo de respuesta que con email correcto (anti-timing).
- Login 6 veces con credenciales incorrectas → cuenta bloqueada.
- Login admin sin MFA → debe solicitar configuración de MFA.
- JWT de cliente en `/api/ventas` → 403.
- Subir un archivo `.php` disfrazado de imagen → rechazado por magic bytes.
- GET `/api/docs` en producción → 404.
