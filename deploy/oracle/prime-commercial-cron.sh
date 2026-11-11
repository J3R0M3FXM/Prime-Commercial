#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ENV_FILE=/etc/prime-commercial/prime-commercial.env
[[ -r "$ENV_FILE" ]] || { echo "Prime Commercial cron: env file unreadable" >&2; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"
: "${APP_ORIGIN:?APP_ORIGIN must be set to the HTTPS origin}"
: "${CRON_SECRET:?CRON_SECRET must be set}"

run_job() {
  local path="$1" code
  code="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
    --connect-timeout 5 --max-time 60 \
    --header "Authorization: Bearer ${CRON_SECRET}" \
    --header 'Cache-Control: no-store' \
    "${APP_ORIGIN%/}${path}")" || {
      echo "Prime Commercial cron: request failed for ${path}" >&2
      return 1
    }
  if [[ "$code" != "200" ]]; then
    echo "Prime Commercial cron: ${path} returned HTTP ${code}" >&2
    return 1
  fi
}

run_job /api/cron/orders
run_job /api/cron/loyalty
