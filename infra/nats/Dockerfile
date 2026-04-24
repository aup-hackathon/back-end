FROM natsio/nats-box:latest AS tools

FROM nats:2.10-alpine
COPY --from=tools /usr/local/bin/nats /usr/local/bin/nats
