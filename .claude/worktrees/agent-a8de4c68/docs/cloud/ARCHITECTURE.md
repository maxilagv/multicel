# Cloud architecture (cloud-only)

## Objetivo
Arquitectura 100% cloud-native para operar desde web:
- Backend API centralizado en Hostinger.
- Frontend web desplegado en Vercel.
- Base de datos MySQL como unica fuente de verdad.

No existe:
- conexion por IP/LAN al backend,
- licencia por instalacion,
- sincronizacion local->cloud por cola puente,
- backup/restore de archivos `.sqlite`.

## Componentes
1. Frontend web (Vercel)
- Consume API HTTPS del backend.
- Maneja sesion por JWT (`accessToken` + `refreshToken`).

2. Backend API (Hostinger)
- Expone endpoints REST de negocio.
- Ejecuta autenticacion, autorizacion por rol y auditoria.
- Expone catalogo publico por `slug`.

3. MySQL (Hostinger)
- Contiene datos operativos (usuarios, catalogo, ventas, pagos, etc.).
- Tabla `_migrations` controla versionado de esquema.

## Flujo principal
1. Setup inicial: `POST /api/setup/admin` (una sola vez).
2. Login: `POST /api/login`.
3. Gestion de usuarios/vendedores desde API central.
4. Configuracion de catalogo con `slug`.
5. Catalogo publico por URL cloud: `/api/catalogo/public/:slug`.

## Seguridad
- CORS estricto por origen permitido.
- `X-Request-Id` y logs estructurados por request.
- Rate limiting global + rate limiting de login.
- JWT para autenticacion y middleware RBAC para permisos por rol.

## Estado de migracion
Backend cloud-only operativo. Los modulos legacy de licencia/red local/sync/backup local fueron eliminados del runtime.
