# Hostinger Multi-Instance

Guia operativa para correr varias instancias aisladas del sistema en el mismo VPS.

Estado real actualizado el 2026-03-31.

## Objetivo

Permitir varios clientes en un solo VPS sin mezclar:

- base de datos
- proceso backend
- variables de entorno
- sesiones de WhatsApp
- prefijos de runtime store

## Aislamiento minimo por cliente

Cada cliente debe tener:

- carpeta propia en el VPS
- `.env` propio
- base MySQL propia
- usuario MySQL propio
- proceso PM2 propio
- puerto backend propio
- `JWT_SECRET` propio
- `REFRESH_TOKEN_SECRET` propio
- `REDIS_KEY_PREFIX` propio
- `WHATSAPP_WEB_SESSION_NAME` propio

## Layout recomendado

Ejemplo real luego del alta de `cliente2`:

- `multicel`
  - carpeta: `/home/ubuntu/kaisen`
  - backend: `/home/ubuntu/kaisen/backend/server`
  - PM2: `kaisen-backend`
  - puerto interno backend: `3100`
  - ruta publica: `http://163.176.174.59:3000/api/...`
  - base: `sistema_gestion`
- `cliente2`
  - carpeta: `/home/ubuntu/kaisen-cliente2`
  - backend: `/home/ubuntu/kaisen-cliente2/backend/server`
  - PM2: `kaisen-cliente2`
  - puerto interno backend: `3001`
  - ruta publica: `http://163.176.174.59:3000/cliente2/api/...`
  - base: `sistema_gestion_cliente2`

Ademas existe un router publico compartido:

- proceso PM2: `kaisen-public-router`
- puerto publico: `3000`
- target por defecto: `http://127.0.0.1:3100`
- target adicional: `/cliente2` -> `http://127.0.0.1:3001`

## Flujo de alta de una nueva instancia

1. Copiar el backend ya validado desde la instancia base.
2. Crear base de datos nueva y usuario MySQL nuevo.
3. Generar `.env` nuevo con secretos nuevos y puerto nuevo.
4. Ejecutar migraciones sobre la base nueva.
5. Arrancar un proceso PM2 nuevo.
6. Verificar `readyz`.
7. Verificar `setup/status` para confirmar que la instancia esta vacia y lista para onboarding.
8. Crear el admin inicial.

## Alta de admin inicial

Para una instancia recien creada, usar preferentemente el flujo de setup:

```bash
curl -X POST http://127.0.0.1:3001/api/setup/admin \
  -H 'Content-Type: application/json' \
  -d '{"nombre":"Administrador","email":"admin@cliente.com","password":"TuClaveSegura"}'
```

Luego verificar:

```bash
curl http://127.0.0.1:3001/api/setup/status
```

Esperado:

- `{"requiresSetup":false}`

Nota:

- el 2026-03-26 se encontro y corrigio un problema en `backend/server/scripts/bootstrap-admin.js`
- para instancias nuevas, el flujo `/api/setup/admin` sigue siendo el camino mas claro

## Verificaciones utiles

```bash
pm2 list
ss -ltnp | grep -E ':3000|:3001|:3100|:3306'
curl http://127.0.0.1:3100/api/readyz
curl http://127.0.0.1:3001/api/readyz
curl http://127.0.0.1:3000/api/readyz
curl http://127.0.0.1:3000/cliente2/api/readyz
curl http://127.0.0.1:3001/api/setup/status
```

Esperado para una instancia nueva:

- `readyz.status=ok`
- `db.status=connected`
- `setup.requiresSetup=true`

## Nota critica de red

En este VPS hay dos capas de acceso:

- firewall del sistema operativo
- regla/red externa del proveedor

El 2026-03-26 se confirmo:

- la instancia `cliente2` escucha en `0.0.0.0:3001`
- el firewall local ya tiene regla `iptables` para `3001`
- desde afuera del VPS, `163.176.174.59:3001` sigue sin responder

Inferencia operativa:

- el bloqueo restante no esta en la app ni en `iptables`
- el bloqueo restante esta en la capa de red externa del proveedor o en una regla superior del host

## Que falta para exponer nuevos clientes

Opcion A:

- abrir el puerto nuevo en la red del proveedor para cada nueva instancia

Opcion B, recomendada:

- poner un reverse proxy estable delante de todas las instancias
- exponer solo el puerto publico que ya existe
- rutear por path o por dominio a backends internos

Ejemplo recomendado:

- `api.multicel.tudominio.com` -> `127.0.0.1:3000`
- `api.cliente2.tudominio.com` -> `127.0.0.1:3001`

Ejemplo operativo sin abrir puertos nuevos:

- `http://IP_PUBLICA:3000/api/...` -> Multicel
- `http://IP_PUBLICA:3000/cliente2/api/...` -> Cliente2

## Router publico actual

Desde el 2026-03-26 el VPS quedo con un router liviano en Node:

- proceso PM2: `kaisen-public-router`
- puerto publico: `3000`
- script: `backend/server/scripts/hostinger-public-router.js`
- target por defecto: `http://127.0.0.1:3100`
- route adicional: `/cliente2` -> `http://127.0.0.1:3001`

Checks:

```bash
curl http://127.0.0.1:3000/__router/readyz
curl http://127.0.0.1:3000/api/readyz
curl http://127.0.0.1:3000/cliente2/api/readyz
```

## Deploy del backend a todas las instancias ya existentes

Cuando hay cambios backend compartidos, el camino rapido y reproducible es:

1. armar un solo paquete local con:
   - `backend/server`
   - `backend/database/migrations_mysql`
2. subir ese paquete al VPS
3. desplegarlo sobre:
   - `/home/ubuntu/kaisen`
   - `/home/ubuntu/kaisen-cliente2`
4. correr migraciones dentro de cada backend
5. reiniciar:
   - `pm2 restart kaisen-backend`
   - `pm2 restart kaisen-cliente2`
6. validar por router publico y por puertos internos

Checklist minima:

```bash
curl http://127.0.0.1:3100/api/readyz
curl http://127.0.0.1:3001/api/readyz
curl http://127.0.0.1:3000/api/readyz
curl http://127.0.0.1:3000/cliente2/api/readyz
curl -i http://127.0.0.1:3000/api/precios/listas?inactivas=1
curl -i http://127.0.0.1:3000/cliente2/api/precios/listas?inactivas=1
```

Esperado:

- `readyz` devuelve `200`
- endpoints autenticados nuevos devuelven `401`
- si devuelven `404`, el codigo backend no quedo actualizado

Documentos a usar antes del proximo deploy:

- `docs/ops/HOSTINGER_QUICK_DEPLOY.md`
- `docs/ops/BACKEND_DEPLOY_MATRIX.md`
- `docs/ops/DEPLOY_2026-03-31.md`

## Frontend por cliente

Para cada cliente conviene un proyecto Vercel separado usando el mismo codigo frontend, con:

- dominio propio
- variables propias
- backend propio

No conviene depender de un unico `vercel.json` hardcodeado para todos los clientes.

Para `multicel.vercel.app`, el 2026-03-31 se confirmo:

- backend real actual: `http://72.60.14.52/api`
- rewrite correcta en Vercel:
  - `Pattern`: `/api/(.*)`
  - `Rewrite to`: `http://72.60.14.52/api/$1`
- no usar `:3000`
- no dejar espacios antes de `http`

## Seguridad

- no guardar secretos ni passwords en el repo
- dejar credenciales solo en `.env` del VPS
- rotar secretos JWT por instancia si se rehace el alta
- no reutilizar la misma base entre clientes
