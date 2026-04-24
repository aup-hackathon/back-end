#!/bin/sh
set -eu

SERVER="${NATS_URL:-nats://nats:4222}"
STREAM="${NATS_STREAM_NAME:-FLOWFORGE}"

SUBJECTS="ai.tasks.>,workflow.events.*,session.events.*,system.health.*,ai.context.*,dead.flowforge.>"

apply_config() {
  ACTION="$1"
  shift

  nats --server="$SERVER" stream "$ACTION" "$STREAM" \
    --subjects "$SUBJECTS" \
    --storage file \
    --retention limits \
    --max-msgs 100000 \
    --max-age 24h \
    --max-msg-size 4MB \
    --discard old \
    --replicas 1 \
    --defaults \
    "$@"
}

update_config() {
  nats --server="$SERVER" stream edit "$STREAM" \
    --subjects "$SUBJECTS" \
    --retention limits \
    --max-msgs 100000 \
    --max-age 24h \
    --max-msg-size 4MB \
    --discard old \
    --replicas 1 \
    --force
}

# ai.tasks.> intentionally covers ai.tasks.*; NATS rejects overlapping
# subjects inside one stream.
if nats --server="$SERVER" stream info "$STREAM" >/dev/null 2>&1; then
  update_config
else
  apply_config add
fi

echo "$STREAM stream ready"
