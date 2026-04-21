# Kaisen ERP - Runbook de Operaciones

Guia tecnica para instalacion, mantenimiento y resolucion de problemas en produccion.

---

## 1. Instalacion Nueva

### Requisitos del servidor

- Ubuntu 22.04 / Debian 12
- RAM: minimo 2 GB, recomendado 4 GB
- Disco: minimo 20 GB SSD
- Git
- Node.js 20 si el backend se ejecuta con PM2
- Docker + Docker Compose v2 solo si el entorno realmente usa Docker

### Proceso general de instalacion

```bash
# 1. Clonar el repositorio
git clone <url-del-repo> kaisen && cd kaisen

# 2. Dar permisos de ejecucion
chmod +x install.sh update.sh backup.sh

# 3. Ejecutar el instalador interactivo
./install.sh
# -> Pregunta: nombre de empresa, email admin, contrasena y puerto

# 4. Verificar
curl http://localhost/api/readyz

# 5. Acceder
# http://IP_DEL_SERVIDOR o https://tu-dominio.com
```

### Nota importante

No asumir que todos los entornos productivos usan el mismo metodo de despliegue.

- Algunos entornos usan Docker.
- El Hostinger actual verificado el 2026-03-23 usa PM2 y deploy por paquete.
- Si se alojan varios clientes en el mismo VPS, revisar `docs/ops/HOSTINGER_MULTI_INSTANCE.md`.

---

## 2. Actualizacion de Version

### Camino Docker

Usar este camino solo si el servidor realmente corre por Docker y tiene el repo productivo conectado al codigo fuente.

```bash
./update.sh
./update.sh --skip-backup
```

Ese script:

- hace backup
- intenta `git pull`
- reconstruye imagenes
- aplica migraciones
- reinicia servicios

### Camino Hostinger actual

Para el VPS de Hostinger actualmente activo, revisar:

- `docs/ops/HOSTINGER_QUICK_DEPLOY.md`
- `docs/ops/HOSTINGER_MULTI_INSTANCE.md`

Ese documento refleja el estado real del servidor:

- acceso por `ubuntu`
- dos instancias activas:
  - `/home/ubuntu/kaisen`
  - `/home/ubuntu/kaisen-cliente2`
- backend por `pm2` con nombres:
  - `kaisen-backend`
  - `kaisen-cliente2`
- router publico compartido:
  - `kaisen-public-router` en `:3000`
- deploy por paquete + `rsync` + `npm run migrate`

No usar el flujo Docker en Hostinger sin verificar primero.

### Camino Docker legado de `marketcel`

Para el VPS `72.60.14.52`, revisar:

- `docs/ops/BACKEND_DEPLOY_MATRIX.md`
- `docs/ops/DEPLOY_2026-03-31.md`

Ese servidor real hoy usa:

- acceso operativo por `root`
- proyecto en `/srv/multicel-marketcel`
- `docker compose -f docker-compose.prod.yml`
- `nginx` publico en puerto `80`
- rebuild del servicio `backend` despues de sincronizar codigo y migraciones

---

## 3. Backups

### Backup manual del proyecto Docker

```bash
./backup.sh
```

### Backup MySQL manual en Hostinger/PM2

```bash
cd /home/ubuntu/kaisen

TS=$(date +%Y%m%d%H%M%S)
mkdir -p /home/ubuntu/backups

set -a
. backend/server/.env
set +a

export MYSQL_PWD="$MYSQL_PASSWORD"
mysqldump \
  --no-tablespaces \
  --host="${MYSQL_HOST:-127.0.0.1}" \
  --port="${MYSQL_PORT:-3306}" \
  --user="${MYSQL_USER}" \
  --single-transaction \
  --quick \
  --set-gtid-purged=OFF \
  --routines \
  --triggers \
  --events \
  "$MYSQL_DATABASE" | gzip -9 > "/home/ubuntu/backups/${TS}_${MYSQL_DATABASE}.sql.gz"
```

### Restaurar codigo por rollback rapido

```bash
cd /home/ubuntu/kaisen
mv backend "backend-failed-$(date +%Y%m%d%H%M%S)"
cp -a backend-before-TIMESTAMP backend
pm2 restart kaisen-backend
```

---

## 4. Comandos de Diagnostico

### Hostinger / PM2

```bash
pm2 list
pm2 show kaisen-backend
curl http://127.0.0.1:3000/api/readyz
tail -n 80 /home/ubuntu/.pm2/logs/kaisen-backend-out.log
tail -n 80 /home/ubuntu/.pm2/logs/kaisen-backend-error.log
```

### Docker

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml stats
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f db
```

### Health check manual

```bash
curl http://localhost:3000/api/readyz | jq .
```

### Migraciones manuales

#### Hostinger / PM2

```bash
cd /home/ubuntu/kaisen/backend/server
npm run migrate
```

#### Docker

```bash
docker compose -f docker-compose.prod.yml exec backend node scripts/migrate.js
```

Nota:

- en `marketcel`, para correr migraciones sin colgar el stdin de un script remoto, se uso:
  - `docker compose -f docker-compose.prod.yml run --rm backend node scripts/migrate.js < /dev/null`

---

## 5. Gestion de Usuarios

### Crear administrador

```bash
node backend/server/scripts/bootstrap-admin.js admin@empresa.com NuevaPass123 "Nombre Admin"
```

### Cambiar contrasena de admin

```bash
node backend/server/scripts/set-admin-password.js admin@empresa.com NuevaPass456
```

En Docker, ejecutar esos comandos dentro del contenedor `backend`.

---

## 6. Licencias Legacy

El sistema actual ya no debe requerir `LICENSE_KEY` para arrancar en produccion.

Notas operativas:

- si reaparece un error de licencia al iniciar, tratarlo como codigo legacy reintroducido por error
- `backend/server/services/licenseService.js` y `backend/server/scripts/generate-license.js` pueden seguir existiendo hasta su limpieza final
- `readyz` no debe depender de licencia

---

## 7. Variables de Entorno Criticas

| Variable | Obligatoria | Descripcion |
|---|---|---|
| `JWT_SECRET` | Si | Secreto para firmar tokens JWT |
| `REFRESH_TOKEN_SECRET` | Si | Secreto para refresh tokens |
| `MYSQL_PASSWORD` | Si | Contrasena de la base de datos |
| `MYSQL_ROOT_PASSWORD` | Segun entorno | Contrasena root de MySQL |
| `REDIS_URL` | Recomendada | URL de Redis |
| `SENTRY_DSN` | Recomendada | DSN de Sentry |
| `WHATSAPP_ENABLED` | Opcional | Habilitar WhatsApp |
| `OWNER_PHONE_E164` | Opcional | Telefono del dueno para alertas |
| `OPS_SECRET` | Recomendada | Protege `/api/ops/status` |

### Rotar secrets JWT

```bash
# 1. Agregar nuevo secret
# 2. Reiniciar backend
# 3. Los usuarios deben volver a iniciar sesion
```

---

## 8. Problemas Frecuentes

### "La base de datos no responde"

#### Hostinger / PM2

```bash
cd /home/ubuntu/kaisen
set -a
. backend/server/.env
set +a

mysql -h "${MYSQL_HOST:-127.0.0.1}" -P "${MYSQL_PORT:-3306}" -u "${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}"
df -h
```

#### Docker

```bash
docker compose -f docker-compose.prod.yml ps db
docker compose -f docker-compose.prod.yml start db
docker compose -f docker-compose.prod.yml logs --tail=50 db
df -h
```

### "El backend no levanta despues del deploy"

#### Hostinger / PM2

```bash
pm2 list
tail -n 80 /home/ubuntu/.pm2/logs/kaisen-backend-error.log
curl http://127.0.0.1:3000/api/readyz
```

Si el error menciona `LICENSE_KEY` o licencia:

1. asumir codigo legacy reintroducido
2. restaurar backup de codigo
3. corregir el backend antes de redeployar

### "Vercel devuelve 502 en /api"

Verificar primero la rewrite del proyecto Vercel.

Causa real vista el 2026-03-31:

- la rewrite apuntaba a `http://72.60.14.52:3000/api/$1`
- ese puerto no estaba expuesto al exterior
- Vercel respondia `ROUTER_EXTERNAL_TARGET_CONNECTION_ERROR`

Para `multicel`, la rewrite correcta fue:

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

Si `/api/...` devuelve HTML o `index.html`, la request esta cayendo en la SPA y no en el backend.

### "No llegan alertas por WhatsApp"

1. Verificar `WHATSAPP_ENABLED=true` en `.env`
2. Verificar que `OWNER_PHONE_E164` tiene formato correcto
3. Verificar estado de WhatsApp y logs
4. Revisar rate limit

### "El deploy no deja sobrescribir archivos"

En Hostinger, antes de sincronizar:

```bash
sudo chown -R ubuntu:ubuntu /home/ubuntu/kaisen/backend
chmod -R u+w /home/ubuntu/kaisen/backend
```

### "mysqldump falla por privilegios"

Usar:

```bash
mysqldump --no-tablespaces ...
```

### "tar falla con un paquete creado en Windows"

Extraer en temporal con:

```bash
tar --no-same-permissions --delay-directory-restore -xzf paquete.tgz -C /tmp/dir
```

---

## 9. Monitoreo de Produccion

### UptimeRobot

1. Crear cuenta
2. Agregar monitor HTTP(S)
3. URL: `https://tu-dominio.com/api/readyz`
4. Intervalo: 5 minutos

### Sentry

1. Crear proyecto
2. Obtener DSN
3. Agregar `SENTRY_DSN=<dsn>` al `.env`
4. Reiniciar backend

---

## 10. Checklist de Produccion

Verificar antes de entregar o tocar produccion:

- [ ] `NODE_ENV=production` en `.env`
- [ ] `JWT_SECRET` y `REFRESH_TOKEN_SECRET` tienen longitud suficiente
- [ ] Backup reciente verificado
- [ ] UptimeRobot configurado
- [ ] HTTPS habilitado si hay dominio
- [ ] `SENTRY_DSN` configurado si aplica
- [ ] `OWNER_PHONE_E164` configurado si se usan alertas
- [ ] Primer login con contrasena nueva
- [ ] Wizard de onboarding completado
- [ ] Test de backup ejecutado
- [ ] Metodo de despliegue real del servidor confirmado antes de actualizar
- [ ] Verificacion publica de `/api/setup/status` y al menos un endpoint nuevo despues del deploy
