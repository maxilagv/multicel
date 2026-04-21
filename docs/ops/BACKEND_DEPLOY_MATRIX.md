# Backend Deploy Matrix

Mapa operativo para no perder tiempo en el proximo deploy del backend.

Estado real verificado el 2026-03-31.

## Entornos productivos activos

### 1. Hostinger multi-instancia

- host: `163.176.174.59`
- acceso operativo: usuario `ubuntu` por SSH con clave
- tecnologia: `pm2`
- deploy real: paquete `.tgz` + `rsync` + `npm run migrate`

Instancias actuales:

- `multicel`
  - carpeta: `/home/ubuntu/kaisen`
  - backend: `/home/ubuntu/kaisen/backend/server`
  - PM2: `kaisen-backend`
  - puerto interno: `3100`
  - base: `sistema_gestion`
- `cliente2`
  - carpeta: `/home/ubuntu/kaisen-cliente2`
  - backend: `/home/ubuntu/kaisen-cliente2/backend/server`
  - PM2: `kaisen-cliente2`
  - puerto interno: `3001`
  - base: `sistema_gestion_cliente2`
- router publico compartido
  - PM2: `kaisen-public-router`
  - puerto publico: `3000`
  - `http://IP:3000/api/...` -> `multicel`
  - `http://IP:3000/cliente2/api/...` -> `cliente2`

### 2. Marketcel VPS

- host: `72.60.14.52`
- acceso operativo: `root` por SSH
- tecnologia: `docker compose`
- proyecto: `/srv/multicel-marketcel`
- frontend/API publica: `nginx` en puerto `80`
- backend interno: servicio `backend`
- deploy real: backup + sync de `backend/server` y `backend/database/migrations_mysql` + rebuild del servicio backend + migraciones + restart

### 3. Vercel `multicel`

- proyecto: `multicel`
- scope: `maximos-projects-c38e84e9`
- root directory: `frontend-react`
- el frontend usa rutas relativas `/api/...`
- la salida al backend depende de la rewrite/proxy de Vercel

Rule valida confirmada el 2026-03-31:

```json
{
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "http://72.60.14.52/api/$1"
    }
  ]
}
```

No usar:

- `http://72.60.14.52:3000/api/$1`
- espacios antes de `http`

## Validacion local antes de tocar produccion

Backend:

```bash
npm.cmd --prefix backend/server test -- --runInBand
```

Si hay cambios en frontend vinculados al backend:

```bash
npm.cmd --prefix frontend-react run build
```

## Paquete backend canonico

El paquete de deploy debe incluir solo:

- `backend/server`
- `backend/database/migrations_mysql`

Excluir siempre:

- `backend/server/node_modules`
- `backend/server/.env`
- `backend/server/keys`

Ejemplo:

```bash
tar -czf backend-server-deploy.tgz \
  --exclude=backend/server/node_modules \
  --exclude=backend/server/.env \
  --exclude=backend/server/keys \
  backend/server \
  backend/database/migrations_mysql
```

## Secuencia correcta por entorno

### Hostinger

1. subir el paquete
2. hacer backup de codigo y base en cada instancia
3. extraer en temporal
4. sincronizar con `rsync`
5. correr `npm run migrate` en cada backend
6. reiniciar `kaisen-backend` y `kaisen-cliente2`
7. validar por router publico y por puertos internos

Checks minimos:

```bash
curl http://127.0.0.1:3100/api/readyz
curl http://127.0.0.1:3001/api/readyz
curl http://127.0.0.1:3000/api/readyz
curl http://127.0.0.1:3000/cliente2/api/readyz
curl -i http://127.0.0.1:3000/api/precios/listas?inactivas=1
curl -i http://127.0.0.1:3000/cliente2/api/precios/listas?inactivas=1
```

Interpretacion:

- `200` en `readyz`: proceso online
- `401` en endpoint autenticado: codigo nuevo expuesto correctamente
- `404` en endpoint autenticado: falta deploy de codigo

### Marketcel Docker

1. entrar a `/srv/multicel-marketcel`
2. backup de codigo y dump de base
3. sincronizar `backend/server` y `backend/database/migrations_mysql`
4. rebuild del servicio backend
5. correr migraciones con un contenedor efimero
6. reiniciar backend
7. validar por `127.0.0.1` y por `72.60.14.52`

Checks minimos:

```bash
curl http://127.0.0.1/api/readyz
curl -i http://127.0.0.1/api/precios/listas?inactivas=1
curl -i http://72.60.14.52/api/precios/listas?inactivas=1
curl -i http://72.60.14.52/api/precios/recargos-pago
```

Interpretacion:

- `200` en `readyz`: nginx y backend vivos
- `401` en endpoints autenticados: codigo nuevo activo
- `404` en endpoints nuevos: backend viejo

### Vercel

1. verificar que `/api` siga apuntando al origin correcto
2. si el backend real es `72.60.14.52`, la rewrite debe ir a `http://72.60.14.52/api/$1`
3. redeployar el proyecto despues de tocar rules o `vercel.json`
4. validar:

```bash
curl -i https://multicel.vercel.app/api/setup/status
curl -i https://multicel.vercel.app/api/precios/listas?inactivas=1
```

Interpretacion:

- `200` o `401`: Vercel esta llegando al backend
- `502`: la rewrite apunta a un origin/puerto que Vercel no puede alcanzar
- `404` HTML o `index.html`: la request esta cayendo en la SPA en vez del backend

## Fallas tipicas y causa real

- `404` en `/api/precios/listas` con `readyz=200`
  - backend vivo, pero codigo viejo
- `502 Bad Gateway` desde `multicel.vercel.app`
  - rewrite mala en Vercel
  - caso real: usar `:3000` rompio porque ese puerto no esta expuesto al exterior
- HTML devuelto en `/api/...`
  - la request cayo en el frontend de Vercel y no en el proxy al backend

## Documentos relacionados

- `docs/ops/HOSTINGER_QUICK_DEPLOY.md`
- `docs/ops/HOSTINGER_MULTI_INSTANCE.md`
- `docs/ops/RUNBOOK.md`
- `docs/ops/VERCEL_DNS_API_BASE.md`
- `docs/ops/DEPLOY_2026-03-31.md`
