#!/bin/sh
set -eu

docker compose up -d ollama
docker compose up --abort-on-container-exit --exit-code-from ollama-init ollama-init

echo "Ollama model volume is ready"
