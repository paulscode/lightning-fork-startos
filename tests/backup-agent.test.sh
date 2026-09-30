#!/bin/sh
# Tests for backup-agent.sh with stub lncli and rclone: the node's folder
# name, the per-node path, the fallback to the flat path on a restore, and
# waiting for the identity. Needs jq, flock, timeout and sha256sum, as the
# agent does. Runs the agent under $AGENT_SH (default sh), so the same file
# checks dash (the Umbrel dashboard image) and busybox ash (the LND image).
# Run busybox in Alpine: a busybox built to prefer its own applets, such as
# Ubuntu's, ignores the stub `sleep` and the watcher tests time out.
#
#   sh tests/backup-agent.test.sh
#   docker run --rm -v "$PWD:/w" -w /w alpine:3.21 sh -c \
#     'apk add -q jq flock && sh tests/backup-agent.test.sh'
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
AGENT="$HERE/../backup-agent.sh"
AGENT_SH=${AGENT_SH:-sh}
PUBKEY=02a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90
# SHA-256 of the pubkey's hex text (Python's hashlib, not the agent's own
# pipeline), written out so the layout cannot drift from Start9's LND package
# without this test noticing.
NODE_ID=c0e6c411a5ab55897827dd614cc7c836f9a4189effa7794d31a707edb1423d5c

FAILED=0
PASSED=0
ok() { PASSED=$((PASSED + 1)); echo "ok - $1"; }
not_ok() { FAILED=$((FAILED + 1)); echo "not ok - $1"; }
check() { if eval "$2"; then ok "$1"; else not_ok "$1"; fi; }

T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
STUBS="$T/bin"
mkdir -p "$STUBS"

# lncli: prints getinfo for $STUB_PUBKEY, or fails while $STUB_LNCLI_DOWN
# exists. Every call's arguments are appended to $STUB_LOG.
cat > "$STUBS/lncli" << 'EOF'
#!/bin/sh
printf 'lncli %s\n' "$*" >> "$STUB_LOG"
[ -e "$STUB_LNCLI_DOWN" ] && { echo '[lncli] rpc error: code = Unknown desc = wallet locked' >&2; exit 1; }
printf '{"identity_pubkey":"%s","alias":"x"}\n' "$STUB_PUBKEY"
EOF

# rclone: <remote>:<path> is $STUB_REMOTES/<remote>/<path>. A missing source
# directory exits 3 and a missing file 4, as rclone does; a remote named in
# $STUB_DOWN fails as unreachable.
cat > "$STUBS/rclone" << 'EOF'
#!/bin/sh
cmd=$1
shift
[ "$cmd" = obscure ] && { echo obscured; exit 0; }
[ "$cmd" = --config ] && { shift; cmd=$1; shift; }
map() {
  case "$1" in
    *:*)
      r=${1%%:*}
      case " ${STUB_DOWN:-} " in *" $r "*) echo "dial tcp: no route to host" >&2; exit 1 ;; esac
      printf '%s/%s/%s' "$STUB_REMOTES" "$r" "${1#*:}"
      ;;
    *) printf '%s' "$1" ;;
  esac
}
src=$(map "$1") || exit 1
dst=$(map "$2") || exit 1
printf 'rclone %s %s %s\n' "$cmd" "$1" "$2" >> "$STUB_LOG"
case "$cmd" in
  copyto | moveto)
    [ -d "$(dirname "$src")" ] || { echo "directory not found" >&2; exit 3; }
    [ -f "$src" ] || { echo "object not found" >&2; exit 4; }
    mkdir -p "$(dirname "$dst")"
    if [ "$cmd" = copyto ]; then cp "$src" "$dst"; else mv "$src" "$dst"; fi
    ;;
  deletefile) rm -f "$src" ;;
esac
EOF
# The watcher polls every ten seconds; the tests have no time for that.
cat > "$STUBS/sleep" << 'EOF'
#!/bin/sh
exec /bin/sleep 0.2
EOF
chmod +x "$STUBS/lncli" "$STUBS/rclone" "$STUBS/sleep"

# A fresh node directory with channel.backup, Nextcloud and Dropbox enabled.
setup() {
  rm -rf "$T/lnd" "$T/remotes" "$T/log" "$T/lncli-down" /tmp/lnd-channel-backup
  mkdir -p "$T/lnd/data/chain/bitcoin/mainnet" "$T/remotes"
  printf 'scb-current' > "$T/lnd/data/chain/bitcoin/mainnet/channel.backup"
  cat > "$T/lnd/channel-backup.json" << 'EOF'
{
  "gdrive": null,
  "dropbox": {"enabled": true, "clientId": "id", "clientSecret": "s", "token": "{\"refresh_token\":\"r\"}", "path": "lnd-channel-backups"},
  "nextcloud": {"enabled": true, "url": "https://cloud.example/remote.php/dav/files/u/", "user": "u", "pass": "p", "insecureTls": false, "path": "backups/lf"},
  "sftp": null
}
EOF
  : > "$T/log"
}

agent() {
  env PATH="$STUBS:$PATH" LND_DIR="$T/lnd" STUB_LOG="$T/log" STUB_REMOTES="$T/remotes" \
    STUB_PUBKEY="${STUB_PUBKEY:-$PUBKEY}" STUB_LNCLI_DOWN="$T/lncli-down" STUB_DOWN="${STUB_DOWN:-}" \
    "$@"
}
run_agent() { agent $AGENT_SH "$AGENT" "$@" > "$T/out" 2> "$T/err"; }

echo "# agent under: $AGENT_SH"

# ---- the folder name, and where a copy goes
setup
run_agent --once
rc=$?
check "--once exits 0 with the identity known" '[ $rc -eq 0 ]'
check "the copy lands in <folder>/<sha256(pubkey)>/channel.backup" \
  '[ "$(cat "$T/remotes/dropbox/lnd-channel-backups/$NODE_ID/channel.backup" 2>/dev/null)" = scb-current ] &&
   [ "$(cat "$T/remotes/nextcloud/backups/lf/$NODE_ID/channel.backup" 2>/dev/null)" = scb-current ]'
check "nothing is written to the flat path any more" \
  '[ ! -e "$T/remotes/dropbox/lnd-channel-backups/channel.backup" ]'
check "lncli is asked on StartOS's default rpcserver, with no lnddir" \
  'grep -qx "lncli --rpcserver=127.0.0.1:10009 getinfo" "$T/log"'

# ---- the lncli location is configurable
setup
LNCLI_LNDDIR=/data/.lnd LNCLI_RPCSERVER=10.21.21.9:10009 run_agent --once
check "LNCLI_LNDDIR and LNCLI_RPCSERVER reach lncli" \
  'grep -qx "lncli --lnddir=/data/.lnd --rpcserver=10.21.21.9:10009 getinfo" "$T/log"'

# ---- NODE_PUBKEY: no lncli at all (the Umbrel dashboard)
setup
touch "$T/lncli-down"
NODE_PUBKEY=$PUBKEY run_agent --once
rc=$?
check "NODE_PUBKEY names the folder without calling lncli" \
  '[ $rc -eq 0 ] && ! grep -q "^lncli" "$T/log" && [ -f "$T/remotes/nextcloud/backups/lf/$NODE_ID/channel.backup" ]'
setup
NODE_PUBKEY=$(printf '%s' "$PUBKEY" | tr a-f A-F) run_agent --once
rc=$?
check "a malformed NODE_PUBKEY is not an identity (exit 7)" '[ $rc -eq 7 ] && [ -z "$(ls "$T/remotes")" ]'

# ---- no identity yet: exit 7, nothing written
setup
touch "$T/lncli-down"
run_agent --once
rc=$?
check "--once exits 7 while LND has not reported its identity" '[ $rc -eq 7 ] && [ -z "$(ls "$T/remotes")" ]'
check "and says why" 'grep -q "identity" "$T/err"'
run_agent --pull
rc=$?
check "--pull exits 7 while LND has not reported its identity" '[ $rc -eq 7 ]'
state_failure() { jq -r '[.failures[]? | select(.target == "agent") | .detail] | join(";")' "$T/lnd/.channel-backup-state.json" 2>/dev/null; }
check "within the grace period nothing is recorded as a failure" '! state_failure | grep -q identity'
setup
touch "$T/lncli-down"
IDENTITY_GRACE_SECS=0 run_agent --once
rc=$?
check "past the grace period the missing identity is recorded as a failure" \
  '[ $rc -eq 7 ] && state_failure | grep -q "has not reported the node'"'"'s identity"'
rm -f "$T/lncli-down"
run_agent --once
rc=$?
check "and a copy made once it is known clears it" '[ $rc -eq 0 ] && ! state_failure | grep -q identity'
setup
STUB_PUBKEY=not-a-key run_agent --once
rc=$?
check "a getinfo without a valid pubkey is not an identity (exit 7)" '[ $rc -eq 7 ]'
setup
rm -f "$T/lnd/data/chain/bitcoin/mainnet/channel.backup"
touch "$T/lncli-down"
run_agent --once
rc=$?
check "with no channel.backup yet, exit 3 comes before the identity" '[ $rc -eq 3 ]'

# ---- restore: the node's folder first, the flat path as a fallback
put() { mkdir -p "$(dirname "$T/remotes/$1")" && printf '%s' "$2" > "$T/remotes/$1"; }
retrieved() { jq -r '.retrieved | join(",")' "$T/out" 2>/dev/null; }

setup
put "dropbox/lnd-channel-backups/$NODE_ID/channel.backup" per-node
put "dropbox/lnd-channel-backups/channel.backup" flat
put "nextcloud/backups/lf/channel.backup" flat-only
run_agent --pull
rc=$?
check "--pull exits 0 when every target answered" '[ $rc -eq 0 ]'
check "both targets are reported retrieved" '[ "$(retrieved)" = dropbox,nextcloud ]'
check "the per-node copy wins over the flat one" '[ "$(cat "$T/lnd/.channel-backup-restore/dropbox")" = per-node ]'
check "a target with only the flat copy (an older release's) still gives it" \
  '[ "$(cat "$T/lnd/.channel-backup-restore/nextcloud")" = flat-only ]'
check "and the log names which path it came from" 'grep -q "nextcloud\] channel.backup retrieved from backups/lf/channel.backup" "$T/err"'

setup
put "dropbox/lnd-channel-backups/$NODE_ID/channel.backup" per-node
run_agent --pull
rc=$?
check "a target that holds nothing is not an error" \
  '[ $rc -eq 0 ] && [ "$(retrieved)" = dropbox ] && grep -q "nextcloud\] holds no channel.backup" "$T/err"'

setup
put "nextcloud/backups/lf/channel.backup" flat
STUB_DOWN=nextcloud run_agent --pull
rc=$?
check "an unreachable target is exit 6 and listed, and its flat copy is not tried" \
  '[ $rc -eq 6 ] && [ "$(jq -r ".unreachable[0].target" "$T/out")" = nextcloud ] &&
   [ ! -e "$T/lnd/.channel-backup-restore/nextcloud" ]'

setup
put "dropbox/lnd-channel-backups/$NODE_ID/channel.backup" ''
put "dropbox/lnd-channel-backups/channel.backup" flat
run_agent --pull
check "an empty per-node copy is skipped, not replaced by the flat one" \
  '[ "$(retrieved)" = "" ] && [ ! -e "$T/lnd/.channel-backup-restore/dropbox" ]'

# ---- the watcher waits for the identity, then copies
setup
touch "$T/lncli-down"
agent $AGENT_SH "$AGENT" > "$T/out" 2> "$T/err" &
watcher=$!
/bin/sleep 1.5
check "the watcher copies nothing while there is no identity" '[ -z "$(ls "$T/remotes")" ]'
calls=$(grep -c '^lncli' "$T/log")
check "and keeps asking (retries, not a 5-minute backoff)" '[ "$calls" -ge 3 ]'
rm -f "$T/lncli-down"
i=0
while [ $i -lt 30 ] && [ ! -f "$T/remotes/dropbox/lnd-channel-backups/$NODE_ID/channel.backup" ]; do
  /bin/sleep 0.2
  i=$((i + 1))
done
check "the watcher copies once LND reports the identity" \
  '[ -f "$T/remotes/dropbox/lnd-channel-backups/$NODE_ID/channel.backup" ]'
before=$(grep -c '^lncli' "$T/log")
/bin/sleep 1
after=$(grep -c '^lncli' "$T/log")
check "and does not ask LND again once it knows" '[ "$before" = "$after" ]'
kill "$watcher" 2> /dev/null
wait "$watcher" 2> /dev/null
check "the watcher never warns about an out-of-range number" '! grep -q "out of range\|bad number\|Illegal number" "$T/err"'

echo "# $PASSED passed, $FAILED failed"
[ "$FAILED" -eq 0 ]
