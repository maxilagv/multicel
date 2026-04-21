#!/usr/bin/env bash
# =============================================================
#   KAISEN ERP — Instalador guiado
#   Uso: chmod +x install.sh && ./install.sh
# =============================================================
set -euo pipefail

# ── Colores ──────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "${GREEN}✅ $*${RESET}"; }
warn() { echo -e "${YELLOW}⚠️  $*${RESET}"; }
err()  { echo -e "${RED}❌ $*${RESET}"; exit 1; }
info() { echo -e "${CYAN}   $*${RESET}"; }

# ── Banner ───────────────────────────────────────────────────
clear
echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════════════╗"
echo "║          KAISEN ERP — INSTALACIÓN            ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${RESET}"
echo ""

# ── Verificar dependencias ───────────────────────────────────
info "Verificando dependencias..."

if ! command -v docker &>/dev/null; then
  err "Docker no está instalado. Instalalo desde https://docs.docker.com/get-docker/"
fi

if ! docker compose version &>/dev/null 2>&1; then
  err "Docker Compose v2 no disponible. Actualizá Docker a una versión reciente."
fi

if ! command -v openssl &>/dev/null; then
  err "openssl no está instalado. Instalalo con: apt install openssl"
fi

ok "Dependencias verificadas"
echo ""

# ── Verificar que no existe .env ya ──────────────────────────
if [ -f ".env" ]; then
  warn ".env ya existe. ¿Sobreescribir la instalación existente? (s/N)"
  read -r CONFIRM
  [[ "$CONFIRM" =~ ^[sS]$ ]] || { info "Instalación cancelada."; exit 0; }
fi

# ── Datos del cliente ─────────────────────────────────────────
echo -e "${BOLD}📋 Configuración del negocio${RESET}"
echo ""

read -rp "  Nombre de la empresa: " COMPANY_NAME
while [[ -z "$COMPANY_NAME" ]]; do
  read -rp "  Nombre de la empresa (requerido): " COMPANY_NAME
done

read -rp "  Email del administrador: " ADMIN_EMAIL
while [[ ! "$ADMIN_EMAIL" =~ ^[^@]+@[^@]+\.[^@]+$ ]]; do
  read -rp "  Email inválido, ingresá de nuevo: " ADMIN_EMAIL
done

while true; do
  read -rsp "  Contraseña del administrador (mín. 8 caracteres): " ADMIN_PASSWORD
  echo ""
  [[ ${#ADMIN_PASSWORD} -ge 8 ]] && break
  warn "La contraseña debe tener al menos 8 caracteres"
done

read -rp "  Puerto del sistema (default: 80): " APP_PORT
APP_PORT="${APP_PORT:-80}"

read -rp "  Clave de licencia (dejá vacío para saltear): " LICENSE_KEY

echo ""

# ── Generar secrets ───────────────────────────────────────────
info "Generando claves de seguridad..."
JWT_SECRET=$(openssl rand -hex 32)
REFRESH_SECRET=$(openssl rand -hex 32)
MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)
MYSQL_APP_PASSWORD=$(openssl rand -hex 16)
ok "Claves generadas"
echo ""

# ── Escribir .env ─────────────────────────────────────────────
info "Creando archivo de configuración..."
cat > .env << EOF
# ================================================================
#   KAISEN ERP — Configuración generada por el instalador
#   $(date)
# ================================================================

# === Servidor ===
NODE_ENV=production
PORT=3000
APP_PORT=${APP_PORT}
APP_VERSION=$(git describe --tags --always 2>/dev/null || echo "1.0.0")
LOG_LEVEL=info

# === Base de datos ===
MYSQL_HOST=db
MYSQL_PORT=3306
MYSQL_DATABASE=kaisen_prod
MYSQL_USER=kaisen_app
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
MYSQL_PASSWORD=${MYSQL_APP_PASSWORD}
DB_POOL_SIZE=20
DB_POOL_MAX_IDLE=10
DB_POOL_IDLE_TIMEOUT_MS=60000
DB_CONNECT_TIMEOUT_MS=10000
DB_ACQUIRE_TIMEOUT_MS=30000
DB_MIGRATIONS_DIR=../database/migrations_mysql

# === Seguridad / JWT ===
JWT_SECRET=${JWT_SECRET}
REFRESH_TOKEN_SECRET=${REFRESH_SECRET}
JWT_ALG=HS256
BCRYPT_ROUNDS=12
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# === CORS ===
PUBLIC_ORIGIN=http://localhost:${APP_PORT}
CORS_ALLOWED_ORIGINS=http://localhost:${APP_PORT}

# === Redis ===
REDIS_URL=redis://redis:6379
REDIS_KEY_PREFIX=kaisen

# === Licencia ===
LICENSE_KEY=${LICENSE_KEY}

# === WhatsApp (completar si se habilita) ===
WHATSAPP_ENABLED=false
WHATSAPP_PROVIDER=web

# === Email (completar si se habilita) ===
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=

# === IA / Pronósticos (completar si se habilita) ===
AI_LLM_ENABLED=false
LOCAL_AI_URL=

# === Alertas del dueño ===
OWNER_PHONE_E164=
ALERT_STOCK_CHECK_INTERVAL_M=60
EOF

ok ".env creado"
echo ""

# ── Construir imágenes ────────────────────────────────────────
info "Construyendo imágenes Docker (esto puede tardar 2-5 minutos)..."
docker compose -f docker-compose.prod.yml build --no-cache
ok "Imágenes construidas"
echo ""

# ── Levantar base de datos primero ───────────────────────────
info "Levantando base de datos..."
docker compose -f docker-compose.prod.yml up -d db redis
info "Esperando que la base de datos esté lista..."
TRIES=0
until docker compose -f docker-compose.prod.yml exec -T db \
  mysqladmin ping -h 127.0.0.1 -uroot -p"${MYSQL_ROOT_PASSWORD}" --silent &>/dev/null; do
  TRIES=$((TRIES + 1))
  [[ $TRIES -ge 30 ]] && err "Base de datos no respondió después de 30 intentos"
  sleep 3
done
ok "Base de datos lista"
echo ""

# ── Migraciones ───────────────────────────────────────────────
info "Ejecutando migraciones de base de datos..."
docker compose -f docker-compose.prod.yml run --rm backend node scripts/migrate.js
ok "Migraciones aplicadas"
echo ""

# ── Crear administrador ───────────────────────────────────────
info "Creando usuario administrador..."
docker compose -f docker-compose.prod.yml run --rm backend \
  node scripts/bootstrap-admin.js "$ADMIN_EMAIL" "$ADMIN_PASSWORD" "Administrador"
ok "Usuario administrador creado"
echo ""

# ── Levantar todos los servicios ──────────────────────────────
info "Levantando todos los servicios..."
docker compose -f docker-compose.prod.yml up -d
info "Esperando que el backend esté listo..."
TRIES=0
until curl -sf "http://localhost:3000/api/readyz" > /dev/null 2>&1; do
  TRIES=$((TRIES + 1))
  [[ $TRIES -ge 30 ]] && err "El servidor no respondió. Revisá los logs: docker compose -f docker-compose.prod.yml logs backend"
  sleep 3
done
ok "Sistema listo"
echo ""

# ── Resumen ───────────────────────────────────────────────────
echo -e "${BOLD}${GREEN}"
echo "╔══════════════════════════════════════════════╗"
echo "║        ✅ INSTALACIÓN COMPLETADA             ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${RESET}"
echo ""
echo -e "  🌐 Sistema:     ${CYAN}http://localhost:${APP_PORT}${RESET}"
echo -e "  👤 Email:       ${CYAN}${ADMIN_EMAIL}${RESET}"
echo -e "  🗄️  Base datos:  ${CYAN}kaisen_prod${RESET}"
echo ""
echo -e "  ${YELLOW}⚠️  Guardá estas credenciales en un lugar seguro:${RESET}"
echo -e "     MySQL root:  ${MYSQL_ROOT_PASSWORD}"
echo -e "     MySQL app:   ${MYSQL_APP_PASSWORD}"
echo ""
echo -e "  📋 Comandos útiles:"
echo -e "     Ver logs:    ${CYAN}docker compose -f docker-compose.prod.yml logs -f backend${RESET}"
echo -e "     Apagar:      ${CYAN}docker compose -f docker-compose.prod.yml down${RESET}"
echo -e "     Backup:      ${CYAN}./scripts/backup.sh${RESET}"
echo -e "     Actualizar:  ${CYAN}./scripts/update.sh${RESET}"
echo ""
