#!/usr/bin/env bash
# serve.sh - eidolon on the ports SSOT. cd app (cwd-dependent serveStatic).
cd /home/toxic/pens/ergasterion/eidolon
set -a
source /home/toxic/estate/config/ports.env
set +a
export PORT="${EIDOLON_PORT:-25244}"
exec /home/toxic/.bun/bin/bunx tsx server/server.ts
