#!/usr/bin/env bash
# roadmap.sh — use the roadmap API instead of editing a markdown file.
#
# The API is the source of truth for the lab's roadmap: this wraps the five
# calls an agent actually makes so nothing has to remember curl flags, field
# names or the optimistic-version dance.
#
#   ./roadmap.sh list [--private]        GET /roadmap
#   ./roadmap.sh get <id> [--private]    GET /roadmap/<id>  (private: notes + refs)
#   ./roadmap.sh add title=... [k=v...]  POST /roadmap          (auth)
#   ./roadmap.sh set <id> k=v...         PATCH /roadmap/<id>    (auth)
#   ./roadmap.sh order <id...>           PUT /roadmap/order     (auth)
#
# Values are `key=value`; a value starting with `@` is read from that file
# (use it for notes=@archivo.md — markdown in argv is miserable), `refs` takes
# a JSON array, `archived` takes true/false.
#
# The token lives in ../.auth-token.local (chmod 600, gitignored). It reaches
# curl through stdin via `--config -`, never in argv: anything on a command line
# is visible to `ps` for every user on the box, and argv ends up in logs, chat
# transcripts and CI output. This file is tracked (it holds no secret) — the
# token file is not, and neither is it ever printed.
#
# ROADMAP_API overrides the origin, e.g. ROADMAP_API=http://127.0.0.1:8787
# for a local `wrangler dev`. JSON is built with python3 (jq is not installed
# on every machine this runs from).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOKEN_FILE="${HERE}/../.auth-token.local"
API="${ROADMAP_API:-https://announcements.univerlab.org}"
TOKEN=""

# Accepted by `set`; POST rejects `archived` server-side, so it is rejected here.
ALLOWED_SET="title state topic essence_hex blocked_reason summary notes refs archived"
ALLOWED_ADD="title state topic essence_hex blocked_reason summary notes refs"

TMP_BODY="$(mktemp)"
trap 'rm -f "${TMP_BODY}"' EXIT

usage() {
  cat >&2 <<'EOF'
usage: roadmap.sh <command> [...]

  list [--private]           list roadmap items (?private=1 adds notes/refs)
  get <id> [--private]       one item + its linked announcements
  add key=value...           create an item (needs title=)
  set <id> key=value...      partial update of an item
  order <id...>              rewrite the order of every active item

keys: title state topic essence_hex blocked_reason summary notes refs archived
  summary  one public line, max 280 chars
  notes    private markdown, max 4000 chars — use notes=@file.md
  refs     private JSON array: [{"kind":"pr","id":"123","label":"optional"}]
  shipped_at is stamped by the server; sending it is a 400

Private fields never reach the public page: they are only readable with
--private (Bearer required) and never appear in the KV mirror or the SSE feed.
EOF
  exit 2
}

read_token() {
  if [ ! -f "${TOKEN_FILE}" ]; then
    echo "roadmap.sh: missing token file: ${TOKEN_FILE}" >&2
    exit 1
  fi
  local perms
  perms="$(stat -c '%a' "${TOKEN_FILE}" 2>/dev/null || stat -f '%Lp' "${TOKEN_FILE}")"
  case "${perms}" in
    600|400) ;;
    *)
      echo "refusing to read ${TOKEN_FILE}: mode ${perms}, want 600" >&2
      echo "  fix with: chmod 600 ${TOKEN_FILE}" >&2
      exit 1 ;;
  esac
  TOKEN="$(head -n 1 "${TOKEN_FILE}")"
}

# req METHOD PATH [--body JSON] [--private] [--auth]
# Prints the response body to stdout and the status to stderr on failure.
# Returns 1 on HTTP >= 400 so the caller can react (see `order`).
req() {
  local method="$1" path="$2"
  shift 2
  local body="" private=0 auth=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --body)
        if [ $# -lt 2 ]; then echo "roadmap.sh: --body needs a value" >&2; exit 2; fi
        body="$2"
        shift 2
        ;;
      --private) private=1; shift ;;
      --auth) auth=1; shift ;;
      *) echo "roadmap.sh: unexpected argument $1" >&2; exit 2 ;;
    esac
  done

  local url="${API}${path}"
  if [ "${private}" = 1 ]; then
    auth=1 # a private read without a valid token is a 401, never a public answer
    case "${url}" in
      *'?'*) url="${url}&private=1" ;;
      *) url="${url}?private=1" ;;
    esac
  fi

  local -a args=(-sS -X "${method}" -H 'Content-Type: application/json' -o "${TMP_BODY}" -w '%{http_code}')
  if [ -n "${body}" ]; then
    args+=(-d "${body}")
  fi

  local status
  if [ "${auth}" = 1 ]; then
    read_token
    status="$(printf 'header = "Authorization: Bearer %s"\n' "${TOKEN}" |
      curl --config - "${args[@]}" "${url}")"
  else
    status="$(curl "${args[@]}" "${url}")"
  fi

  cat "${TMP_BODY}"
  printf '\n'

  if [ "${status}" -ge 400 ] 2>/dev/null; then
    echo "HTTP ${status}" >&2
    return 1
  fi
}

# Validates key=value pairs against a whitelist before spending a round trip.
# check_keys "key1 key2 ..." args...
check_keys() {
  local allowed="$1"
  shift
  local pair key
  for pair in "$@"; do
    case "${pair}" in
      ?*=*) key="${pair%%=*}" ;;
      *)
        echo "roadmap.sh: expected key=value, got ${pair}" >&2
        exit 2
        ;;
    esac
    case " ${allowed} " in
      *" ${key} "*) ;;
      *)
        echo "roadmap.sh: cannot set '${key}'" >&2
        echo "  allowed: ${allowed}" >&2
        echo "  shipped_at/id/pos are managed by the server" >&2
        exit 2
        ;;
    esac
  done
}

# build_json key=value... → JSON object on stdout (exits 2 on a bad pair).
build_json() {
  python3 - "$@" <<'PY'
import json
import sys

out = {}
for pair in sys.argv[1:]:
    if "=" not in pair:
        sys.stderr.write("roadmap.sh: expected key=value, got %r\n" % pair)
        sys.exit(2)
    key, value = pair.split("=", 1)
    if value.startswith("@"):
        with open(value[1:], encoding="utf-8") as handle:
            value = handle.read()
    if key in ("archived", "archive"):
        if value not in ("true", "false"):
            sys.stderr.write("roadmap.sh: %s= must be true or false\n" % key)
            sys.exit(2)
        out[key] = value == "true"
    elif key == "refs":
        try:
            parsed = json.loads(value)
        except ValueError as exc:
            sys.stderr.write("roadmap.sh: refs must be JSON (%s)\n" % exc)
            sys.exit(2)
        if not isinstance(parsed, list):
            sys.stderr.write("roadmap.sh: refs must be a JSON array\n")
            sys.exit(2)
        out[key] = parsed
    else:
        out[key] = value

print(json.dumps(out))
PY
}

# Picks --private out of the remaining args; anything else is a usage error.
# Sets REPLY to the flag or to the empty string.
parse_private() {
  REPLY=""
  local arg
  for arg in "$@"; do
    case "${arg}" in
      --private) REPLY="--private" ;;
      *)
        echo "roadmap.sh: unexpected argument ${arg}" >&2
        usage
        ;;
    esac
  done
}

cmd="${1:-}"
case "${cmd}" in
  list)
    shift
    parse_private "$@"
    req GET /roadmap ${REPLY:+"${REPLY}"}
    ;;

  get)
    shift
    if [ $# -lt 1 ]; then usage; fi
    id="$1"
    shift
    parse_private "$@"
    req GET "/roadmap/${id}" ${REPLY:+"${REPLY}"}
    ;;

  add)
    shift
    if [ $# -lt 1 ]; then usage; fi
    check_keys "${ALLOWED_ADD}" "$@"
    title=""
    for pair in "$@"; do
      case "${pair}" in
        title=*) title="${pair#title=}" ;;
      esac
    done
    if [ -z "${title}" ]; then
      echo "roadmap.sh: add needs title=" >&2
      exit 2
    fi
    # Built first, not inline as an argument: a failing command substitution
    # inside an argument does not fail the command, so `set -e` would not see it.
    body="$(build_json "$@")"
    req POST /roadmap --auth --body "${body}"
    ;;

  set)
    shift
    if [ $# -lt 2 ]; then usage; fi
    id="$1"
    shift
    check_keys "${ALLOWED_SET}" "$@"
    body="$(build_json "$@")"
    req PATCH "/roadmap/${id}" --auth --body "${body}"
    ;;

  order)
    shift
    if [ $# -lt 1 ]; then usage; fi
    # The write is guarded by the version the client last saw: read it fresh,
    # then PUT. The private (authenticated) read bypasses the public cache,
    # which can lag one write behind and turn every reorder right after an
    # add into a 409. On 409 the body (current state) is already printed above.
    version="$(req GET /roadmap --private | python3 -c 'import json, sys; print(json.load(sys.stdin).get("version", 0))')"
    body="$(python3 - "${version}" "$@" <<'PY'
import json
import sys

print(json.dumps({"version": int(sys.argv[1]), "items": sys.argv[2:]}))
PY
)"
    if ! req PUT /roadmap/order --auth --body "${body}"; then
      echo "roadmap.sh: order failed — the version moved; re-run with the ids above" >&2
      exit 1
    fi
    ;;

  *)
    usage
    ;;
esac
