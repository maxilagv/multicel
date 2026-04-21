#!/usr/bin/env bash
# =============================================================
#   KAISEN ERP — Script de actualización
#   Uso: ./update.sh
#        ./update.sh --skip-backup   (omitir backup previo)
# =============================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "${GREEN}✅ $*${RESET}"; }
warn() { echo -e "${YELLOW}⚠️  $*${RESET}"; }
err()  { echo -e "${RED}❌ $*${RESET}"; exit 1; }
info() { echo -e "${CYAN}   $*${RESET}"; }

SKIP_BACKUP=false
for arg in "$@"; do
  [[ "$arg" == "--skip-backup" ]] && SKIP_BACKUP=true
done

# Verificar que existe .env
[[ -f ".env" ]] || err "No se encontró .env — ¿ya se instaló el sistema con install.sh?"

echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════════════╗"
echo "║          KAISEN ERP — ACTUALIZACIÓN          ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${RESET}"

NEW_VERSION=$(git describe --tags --always 2>/dev/null || git rev-parse --short HEAD 2>/dev/null || echo "desconocida")
info "Versión nueva: $NEW_VERSION"
echo ""

# ── Backup previo ─────────────────────────────────────────────
if [[ "$SKIP_BACKUP" == false ]]; then
  info "Haciendo backup de la base de datos antes de actualizar..."
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -f "${SCRIPT_DIR}/backup.sh" ]]; then
    bash "${SCRIPT_DIR}/backup.sh" --quiet || warn "Backup falló, continuando de todos modos..."
  else
    warn "No se encontró backup.sh — se saltea el backup previo"
  fi
  ok "Backup realizado"
  echo ""
fi

# ── Bajar código nuevo (si es git) ───────────────────────────
if git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
  info "Descargando cambios..."
  git pull --ff-only || warn "No se pudo hacer git pull — continuando con código actual"
  echo ""
fi

# ── Rebuild imágenes ──────────────────────────────────────────
info "Reconstruyendo imágenes Docker..."
docker compose -f docker-compose.prod.yml build --no-cache backend frontend
ok "Imágenes construidas"
echo ""

# ── Aplicar migraciones (antes de reiniciar) ─────────────────
info "Aplicando migraciones de base de datos..."
docker compose -f docker-compose.prod.yml run --rm backend node scripts/migrate.js
ok "Migraciones aplicadas"
echo ""

# ── Reiniciar servicios ───────────────────────────────────────
info "Reiniciando backend..."
docker compose -f docker-compose.prod.yml up -d --no-deps backend
info "Esperando que el backend esté listo..."
TRIES=0
until curl -sf "http://localhost:3000/api/readyz" > /dev/null 2>&1; do
  TRIES=$((TRIES + 1))
  if [[ $TRIES -ge 20 ]]; then
    err "El backend no levantó correctamente. Revisá los logs:
docker compose -f docker-compose.prod.yml logs --tail=50 backend"
  fi
  sleep 3
done
ok "Backend listo"

info "Reiniciando frontend..."
docker compose -f docker-compose.prod.yml up -d --no-deps frontend nginx
ok "Frontend listo"
echo ""

echo -e "${BOLD}${GREEN}✅ Actualización completada a versión: ${NEW_VERSION}${RESET}"
echo ""
echo -e "  📋 Ver logs: ${CYAN}docker compose -f docker-compose.prod.yml logs -f${RESET}"
echo ""
