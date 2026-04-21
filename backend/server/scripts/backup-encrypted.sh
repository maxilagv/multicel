#!/usr/bin/env bash
set -euo pipefail

required_vars=(
  MYSQL_HOST
  MYSQL_PORT
  MYSQL_USER
  MYSQL_PASSWORD
  MYSQL_DATABASE
  BACKUP_BUCKET_URI
  BACKUP_ENCRYPTION_KEY
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required env var: ${var_name}" >&2
    exit 1
  fi
done

backup_prefix="${BACKUP_PREFIX:-mysql}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
base_filename="${timestamp}_${MYSQL_DATABASE}.sql.gz"
encrypted_filename="${base_filename}.enc"
tmp_dir="$(mktemp -d)"
raw_backup="${tmp_dir}/${base_filename}"
encrypted_backup="${tmp_dir}/${encrypted_filename}"
checksum_file="${encrypted_backup}.sha256"

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
  "${MYSQL_DATABASE}" | gzip -9 > "${raw_backup}"

openssl enc -aes-256-cbc -pbkdf2 \
  -pass "pass:${BACKUP_ENCRYPTION_KEY}" \
  -in "${raw_backup}" \
  -out "${encrypted_backup}"

sha256sum "${encrypted_backup}" > "${checksum_file}"

remote_base="${BACKUP_BUCKET_URI%/}/${backup_prefix}"
aws s3 cp "${encrypted_backup}" "${remote_base}/${encrypted_filename}"
aws s3 cp "${checksum_file}" "${remote_base}/${encrypted_filename}.sha256"

echo "Encrypted backup uploaded to ${remote_base}/${encrypted_filename}"
