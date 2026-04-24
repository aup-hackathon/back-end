#!/bin/sh
set -eu

mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc mb --ignore-existing local/documents
mc mb --ignore-existing local/exports
mc anonymous set none local/documents
mc anonymous set none local/exports

echo "MinIO buckets ready"
