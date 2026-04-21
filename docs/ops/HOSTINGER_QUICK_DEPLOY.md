# Hostinger Quick Deploy

Guia rapida para repetir deploys del backend en el VPS de Hostinger.

Estado real verificado el 2026-03-23.

No guardar credenciales en este archivo ni en el repo.

## Realidad actual del servidor

- VPS: Hostinger
- Usuario SSH operativo: `ubuntu`
- Proyecto activo: `/home/ubuntu/kaisen`
- Backend productivo: `/home/ubuntu/kaisen/backend`
- Proceso productivo: `pm2` app `kaisen-backend`
- Healthcheck publico actual: `http://127.0.0.1:3000/api/readyz`
- Puerto interno actual de `kaisen-backend`: `3100`
- Router publico actual: `pm2` app `kaisen-public-router`
- Produccion actual: no usa Docker para el backend
- Produccion actual: no usa checkout git en vivo para deploy

## Verificacion inicial

```bash
ssh -i TU_CLAVE ubuntu@TU_HOST
cd /home/ubuntu/kaisen
pwd
pm2 list
curl http://127.0.0.1:3000/api/readyz
```

Si `pm2 list` no muestra `kaisen-backend`, frenar y revisar antes de tocar produccion.

## Flujo recomendado: backend-only por paquete

Usar este camino cuando:

- solo cambias backend
- necesitas aplicar migraciones
- no quieres tocar frontend
- el servidor no esta corriendo por Docker

## 1. Preparar paquete en la maquina local

Armar un `.tgz` con:

- `backend/server`
- `backend/database/migrations_mysql`

Excluir siempre:

- `backend/server/.env`
- `backend/server/node_modules`
- `backend/server/keys`

Ejemplo real:

```bash
tar -czf backend-server-deploy.tgz \
  --exclude=backend/server/node_modules \
  --exclude=backend/server/.env \
  --exclude=backend/server/keys \
  backend/server \
  backend/database/migrations_mysql
```

Subirlo al VPS:

```bash
scp -i TU_CLAVE backend-server-deploy.tgz \
  ubuntu@TU_HOST:/home/ubuntu/backend-server-deploy-YYYYMMDD.tgz
```

## 2. Backup de codigo y base antes de tocar nada

```bash
ssh -i TU_CLAVE ubuntu@TU_HOST
cd /home/ubuntu/kaisen

TS=$(date +%Y%m%d%H%M%S)
mkdir -p /home/ubuntu/backups

sudo chown -R ubuntu:ubuntu /home/ubuntu/kaisen/backend
chmod -R u+w /home/ubuntu/kaisen/backend

cp -a backend "backend-before-$TS"

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

echo "$TS"
```

Notas:

- `--no-tablespaces` evita el error de privilegios `PROCESS` en Hostinger.
- Si el arbol `backend` no deja escribir, corregir ownership antes del deploy con `sudo chown -R ubuntu:ubuntu /home/ubuntu/kaisen/backend`.

## 3. Extraer en temporal y sincronizar

No extraer directo sobre `/home/ubuntu/kaisen`, porque el `.tgz` hecho en Windows puede dejar directorios temporales en solo lectura.

Flujo correcto:

```bash
cd /home/ubuntu/kaisen

TS=$(date +%Y%m%d%H%M%S)
TMP_DIR="/home/ubuntu/deploy-tmp-$TS"
mkdir -p "$TMP_DIR"

tar --no-same-permissions --delay-directory-restore \
  -xzf /home/ubuntu/backend-server-deploy-YYYYMMDD.tgz \
  -C "$TMP_DIR"

rsync -a "$TMP_DIR/backend/server/" "/home/ubuntu/kaisen/backend/server/"
rsync -a "$TMP_DIR/backend/database/migrations_mysql/" "/home/ubuntu/kaisen/backend/database/migrations_mysql/"

chmod -R u+w "$TMP_DIR" || true
rm -rf "$TMP_DIR" || true
```

## 4. Aplicar migraciones

```bash
cd /home/ubuntu/kaisen/backend/server
npm run migrate
```

Esperado:

- migraciones ya aplicadas: `SKIP`
- migraciones nuevas: `APPLY`
- final: `Migraciones MySQL aplicadas.`

## 5. Reiniciar backend

```bash
pm2 restart kaisen-backend
sleep 8
pm2 list
curl http://127.0.0.1:3000/api/readyz
curl http://127.0.0.1:3100/api/readyz
```

Si necesitas logs:

```bash
tail -n 80 /home/ubuntu/.pm2/logs/kaisen-backend-out.log
tail -n 80 /home/ubuntu/.pm2/logs/kaisen-backend-error.log
```

## 6. Rollback rapido

Si el backend nuevo falla:

```bash
cd /home/ubuntu/kaisen

sudo chown -R ubuntu:ubuntu backend
chmod -R u+w backend

mv backend "backend-failed-$(date +%Y%m%d%H%M%S)"
cp -a backend-before-TIMESTAMP backend

pm2 restart kaisen-backend
sleep 8
curl http://127.0.0.1:3000/api/readyz
```

## Lecciones concretas del deploy 2026-03-23

- El Hostinger real no corre el backend por Docker. Corre por `pm2`.
- La ruta real no es `/srv/multicel-marketcel`. Es `/home/ubuntu/kaisen`.
- El usuario correcto para SSH fue `ubuntu`, no `root`.
- El proyecto en Hostinger no se estaba desplegando por `git pull`.
- El arbol `backend` tenia permisos inconsistentes y hubo que normalizar ownership.
- `mysqldump` necesito `--no-tablespaces`.
- El `.tgz` generado en Windows necesito `tar --no-same-permissions --delay-directory-restore`.
- El backend nuevo fallo al principio por una validacion legacy de `LICENSE_KEY` en el arranque.
- Esa validacion se elimino del codigo antes de reintentar el deploy.
- Produccion quedo online con `readyz=200` despues del redeploy corregido.

## Backups reales generados en esta vuelta

- Codigo restaurable previo: `/home/ubuntu/kaisen/backend-before-20260323183827`
- Backup DB usado para esta vuelta: `/home/ubuntu/backups/20260323183827_sistema_gestion.sql.gz`
- Copia del intento fallido por licencia: `/home/ubuntu/kaisen/backend-failed-20260323183037`

## Ejecucion real 2026-03-26

- Paquete subido al VPS: `/home/ubuntu/backend-server-deploy-20260326.tgz`
- Backup de codigo previo: `/home/ubuntu/kaisen/backend-before-20260326145114`
- Backup de base previo: `/home/ubuntu/backups/20260326145114_sistema_gestion.sql.gz`
- Migracion aplicada: `V24__vendor_compensation`
- Reinicio productivo: `pm2 restart kaisen-backend`
- Verificacion final: `readyz=200`
- Log detallado de esta vuelta: `docs/ops/DEPLOY_2026-03-26.md`

## Router publico agregado 2026-03-26

- `kaisen-backend` se movio a puerto interno `3100`
- se agrego `kaisen-public-router` en `:3000`
- ruta publica raiz:
  - `http://IP:3000/api/...` -> Multicel
- ruta publica cliente2:
  - `http://IP:3000/cliente2/api/...` -> Cliente2
- detalle operativo:
  - `docs/ops/HOSTINGER_MULTI_INSTANCE.md`
  - `docs/ops/INSTANCE_CLIENTE2_2026-03-26.md`

## Si cambia package.json

Si el deploy cambia dependencias Node:

```bash
cd /home/ubuntu/kaisen/backend/server
npm install
pm2 restart kaisen-backend
```

Si `package.json` no cambia, no hace falta reinstalar dependencias.
