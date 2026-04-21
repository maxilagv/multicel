#!/usr/bin/env bash
set -euo pipefail

required_vars=(
  BACKUP_BUCKET_URI
  VERIFY_MYSQL_HOST
  VERIFY_MYSQL_PORT
  VERIFY_MYSQL_USER
  VERIFY_MYSQL_PASSWORD
  VERIFY_MYSQL_DATABASE
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required env var: ${var_name}" >&2
    exit 1
  fi
done

backup_prefix="${BACKUP_PREFIX:-mysql}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

remote_base="${BACKUP_BUCKET_URI%/}/${backup_prefix}"
latest_object="$(
  aws s3 ls "${remote_base}/" \
    | awk '{print $4}' \
    | grep -E '\.sql\.gz(\.enc)?$' \
    | tail -n 1
)"

if [[ -z "${latest_object}" ]]; then
  echo "No backup objects found in ${remote_base}" >&2
  exit 1
fi

local_backup="${tmp_dir}/latest.sql.gz"
aws s3 cp "${remote_base}/${latest_object}" "${local_backup}"

if [[ "${latest_object}" == *.enc ]]; then
  if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
    echo "Missing required env var: BACKUP_ENCRYPTION_KEY" >&2
    exit 1
  fi
  decrypted_backup="${tmp_dir}/latest.dec.sql.gz"
  openssl enc -d -aes-256-cbc -pbkdf2 \
    -pass "pass:${BACKUP_ENCRYPTION_KEY}" \
    -in "${local_backup}" \
    -out "${decrypted_backup}"
  local_backup="${decrypted_backup}"
fi

mysql \
  --host="${VERIFY_MYSQL_HOST}" \
  --port="${VERIFY_MYSQL_PORT}" \
  --user="${VERIFY_MYSQL_USER}" \
  --password="${VERIFY_MYSQL_PASSWORD}" \
  -e "DROP DATABASE IF EXISTS \`${VERIFY_MYSQL_DATABASE}\`; CREATE DATABASE \`${VERIFY_MYSQL_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

gunzip -c "${local_backup}" | mysql \
  --host="${VERIFY_MYSQL_HOST}" \
  --port="${VERIFY_MYSQL_PORT}" \
  --user="${VERIFY_MYSQL_USER}" \
  --password="${VERIFY_MYSQL_PASSWORD}" \
  "${VERIFY_MYSQL_DATABASE}"

mysql \
  --host="${VERIFY_MYSQL_HOST}" \
  --port="${VERIFY_MYSQL_PORT}" \
  --user="${VERIFY_MYSQL_USER}" \
  --password="${VERIFY_MYSQL_PASSWORD}" \
  --batch --skip-column-names \
  "${VERIFY_MYSQL_DATABASE}" <<'SQL'
SELECT 'usuarios', COUNT(*) FROM usuarios;
SELECT 'clientes', COUNT(*) FROM clientes;
SELECT 'productos', COUNT(*) FROM productos;
SELECT 'ventas', COUNT(*) FROM ventas;
SQL

echo "Restore verification completed for ${latest_object}"
