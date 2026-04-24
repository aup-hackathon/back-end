#!/bin/sh
set -eu

ollama pull "${OLLAMA_LLM_MODEL:-mistral:7b-instruct}"
ollama pull "${OLLAMA_EMBED_MODEL:-nomic-embed-text}"

echo "Ollama models ready"
