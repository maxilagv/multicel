Servidor (Node.js + Express)

Resumen tecnico
- Runtime: Node.js + Express
- Seguridad: Helmet (CSP), CORS configurable, HPP, xss-clean, compresion
- Base de datos: MySQL 8 (adapter en `backend/server/db/pg.js`)
- Autenticacion: JWT (access/refresh), revocacion persistida en DB y store distribuido con fallback en memoria, refresh tokens en DB
- Limitacion de tasa: rate-limits globales y por categoria de endpoint (login, OTP, exports, IA, publico)
- Salud operativa: `/api/health`, `/api/readyz`, `/api/livez` con estado de DB, pool y runtime store

Estructura
- index.js: configuracion de app (CSP, CORS, middlewares), carga de rutas bajo `/api`, arranque del servidor.
- routes/: definicion de endpoints (auth, productos, categorias, clientes, etc.).
- controllers/: logica de entrada/salida HTTP; delega a repositorios.
- db/pg.js: pool de conexion y helpers de transacciones.
- db/repositories/: consultas SQL por dominio (usuarios, productos, categorias, clientes, tokens, etc.).
- middlewares/: autenticacion JWT, control de roles, seguridad y rate-limits.
- utils/: helpers varios (mailer para 2FA, si corresponde).

Base de datos
- Esquema base cloud en `backend/database/migrations_mysql/V1__core_cloud.sql`.
- Migraciones ejecutables con `npm run migrate` (directorio por defecto `backend/database/migrations_mysql`).

Autenticacion y autorizacion
- Login: `POST /api/login` valida credenciales y entrega access/refresh tokens.
- Refresh: `POST /api/refresh-token` valida refresh token persistido y entrega nuevo access token.
- Logout: `POST /api/logout` (revoca refresh y marca access token como revocado en DB/runtime store).
- Autorizacion por rol: middleware `requireRole([...])` aplicado en rutas criticas (p. ej. categorias, productos, usuarios).

Endpoints principales (resumen)
- `GET /api/productos` (publico lectura), `POST/PUT/DELETE /api/productos` (admin/gerente).
- `GET /api/categorias` (publico lectura), `POST/PUT/DELETE /api/categorias` (admin/gerente; delete admin).
- `GET /api/clientes` (autenticado), `POST/PUT /api/clientes` (admin/gerente/vendedor).
- `POST /api/login`, `POST /api/refresh-token`, `POST /api/logout`.

Variables de entorno (no incluir valores en el repositorio)
- JWT/seguridad: `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `JWT_ALG`, `JWT_ISSUER`, `JWT_AUDIENCE`.
- CORS/CSP: `CORS_ALLOWED_ORIGINS`, `PUBLIC_ORIGIN`, `TRUST_PROXY`, `FORCE_HTTPS`.
- MySQL: `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`.
- Pool/redis: `DB_POOL_SIZE`, `DB_POOL_MAX_IDLE`, `DB_ACQUIRE_TIMEOUT_MS`, `REDIS_URL`, `REDIS_KEY_PREFIX`.
- SMTP (opcional 2FA): `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME`, `SMTP_FROM_EMAIL`.

Puesta en marcha local
1) Configurar variables MySQL.
2) Aplicar migraciones:
   - `cd backend/server`
   - `npm run migrate`
3) Instalar y ejecutar:
   - `cd backend/server`
   - `npm install`
   - `npm run dev`

Consideraciones
- El servidor asume que el frontend de desarrollo (Vite) hace proxy de `/api` a `127.0.0.1:3000`.
- `.gitignore` excluye `.env` y artefactos de compilacion/coverage.
