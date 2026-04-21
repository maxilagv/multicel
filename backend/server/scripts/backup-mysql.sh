#!/usr/bin/env bash
set -euo pipefail

required_vars=(
  MYSQL_HOST
  MYSQL_PORT
  MYSQL_USER
  MYSQL_PASSWORD
  MYSQL_DATABASE
  BACKUP_BUCKET_URI
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required env var: ${var_name}" >&2
    exit 1
  fi
done

backup_prefix="${BACKUP_PREFIX:-mysql}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
filename="${timestamp}_${MYSQL_DATABASE}.sql.gz"
tmp_dir="$(mktemp -d)"
backup_file="${tmp_dir}/${filename}"
checksum_file="${backup_file}.sha256"

trap 'rm -rf "${tmp_dir}"' EXIT

mysqldump \
  --host="${MYSQL_HOST}" \
  --port="${MYSQL_PORT}" \
  --user="${MYSQL_USER}" \
  --password="${MYSQL_PASSWORD}" \
  --single-transaction \
  --quick \
  --set-gtid-purged=OFF \
  --routines \
  --triggers \
  --events \
  "${MYSQL_DATABASE}" | gzip -9 > "${backup_file}"

sha256sum "${backup_file}" > "${checksum_file}"

remote_base="${BACKUP_BUCKET_URI%/}/${backup_prefix}"
aws s3 cp "${backup_file}" "${remote_base}/${filename}"
aws s3 cp "${checksum_file}" "${remote_base}/${filename}.sha256"

echo "Backup uploaded to ${remote_base}/${filename}"
