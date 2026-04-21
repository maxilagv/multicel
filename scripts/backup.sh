#!/usr/bin/env bash
# =============================================================
#   KAISEN ERP — Backup de base de datos
#   Uso: ./backup.sh
#        ./backup.sh --quiet   (sin output, ideal para cron)
# =============================================================
set -euo pipefail

QUIET=false
for arg in "$@"; do
  [[ "$arg" == "--quiet" ]] && QUIET=true
done

log() { [[ "$QUIET" == false ]] && echo -e "$*" || true; }

[[ -f ".env" ]] || { echo "❌ .env no encontrado"; exit 1; }
# shellcheck disable=SC1091
source .env

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/kaisen_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

log "🗄️  Iniciando backup..."
docker compose -f docker-compose.prod.yml exec -T db \
  mysqldump \
  --single-transaction \
  --quick \
  --triggers \
  --routines \
  -uroot \
  -p"${MYSQL_ROOT_PASSWORD}" \
  "${MYSQL_DATABASE:-kaisen_prod}" \
  | gzip -9 > "$BACKUP_FILE"

SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
log "✅ Backup guardado: $BACKUP_FILE ($SIZE)"

# Mantener solo los últimos 30 backups
TOTAL=$(ls -1 "${BACKUP_DIR}"/*.sql.gz 2>/dev/null | wc -l)
if [[ $TOTAL -gt 30 ]]; then
  ls -t "${BACKUP_DIR}"/*.sql.gz | tail -n +31 | xargs rm -f
  log "🗂️  Backups antiguos eliminados (mantiene últimos 30)"
fi

[[ "$QUIET" == false ]] && {
  echo ""
  echo "📋 Backups disponibles:"
  ls -lh "${BACKUP_DIR}"/*.sql.gz 2>/dev/null | awk '{print "  " $5 "\t" $9}'
  echo ""
}
