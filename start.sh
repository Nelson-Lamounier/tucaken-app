#!/bin/sh
set -e
if [ -n "$OTEL_EXPORTER_OTLP_ENDPOINT" ]; then
  exec node --import ./telemetry.js server.js
else
  exec node server.js
fi
