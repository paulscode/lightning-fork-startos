# Lightning Fork for StartOS: lnd and lncli built from a pinned commit of
# github.com/paulscode/lightning-fork, plus the tools the package's own scripts
# need. Built from source rather than pulled, so the image records exactly
# which commit it runs and no published image has to exist first. The
# builder runs on the build machine's own platform and cross-compiles for
# the target, so the aarch64 image takes minutes rather than the hours an
# emulated Go build takes.
FROM --platform=$BUILDPLATFORM golang:1.27.3-alpine AS builder

ARG LIGHTNING_FORK_REPO=https://github.com/paulscode/lightning-fork
ARG LIGHTNING_FORK_REF=7c8f252b13d37f4160cce1c5916477b3edca5565
ARG TARGETOS
ARG TARGETARCH

# The module path is upstream's (github.com/lightningnetwork/lnd); go.mod
# replaces btcd with github.com/paulscode/btcd-blake2b at a tagged release.
# Go installs a cross-compiled binary under a per-platform directory, so it
# is moved to where the final stage looks.
RUN apk add --no-cache --update alpine-sdk git make gcc \
&&  git clone "$LIGHTNING_FORK_REPO" /go/src/github.com/lightningnetwork/lnd \
&&  cd /go/src/github.com/lightningnetwork/lnd \
&&  git checkout "$LIGHTNING_FORK_REF" \
&&  git rev-parse HEAD > /lightning-fork-commit \
&&  go list -m -f '{{.Replace.Path}} {{.Replace.Version}}' github.com/btcsuite/btcd > /btcd-blake2b-version \
&&  GOOS=$TARGETOS GOARCH=$TARGETARCH make release-install \
&&  if [ -d "/go/bin/${TARGETOS}_${TARGETARCH}" ]; then \
        mv "/go/bin/${TARGETOS}_${TARGETARCH}"/* /go/bin/; \
    fi \
&&  mkdir cmd/lfdbver \
&&  printf 'package main\n\nimport (\n\t"fmt"\n\n\t"github.com/lightningnetwork/lnd/channeldb"\n)\n\nfunc main() { v := channeldb.OpenableDBVersions(); s := fmt.Sprint(v[0]); for _, x := range v[1:] { s += fmt.Sprintf(", %%d", x) }; fmt.Println(s) }\n' > cmd/lfdbver/main.go \
&&  go run ./cmd/lfdbver > /fork-channeldb-version \
&&  rm -r cmd/lfdbver

# lndinit converts a bolt database to SQLite (sqliteBackend.ts) and
# initializes wallets. Stock lndinit refuses a channel database at any
# version but the latest stock lnd knows, and Lightning Fork's carries
# migrations of its own past that, so the conversion never ran. It is built
# here from its source at a pinned commit (the v0.1.38-beta tag, for lnd
# v0.21.4) with one change, patches/lndinit-fork-channeldb-version.patch:
# the check accepts every version the fork opens as it is, which depends on
# the features a node has run with: the list channeldb.OpenableDBVersions()
# returns, read from the fork's own channeldb above. Nothing else differs;
# the buckets are copied as they are. Its own dependencies are left as
# upstream pins them.
FROM --platform=$BUILDPLATFORM golang:1.27.3-alpine AS lndinit-builder

ARG LNDINIT_REPO=https://github.com/lightninglabs/lndinit
ARG LNDINIT_REF=301808c5f6b058b0ba0f77b595dc9578a26ef9c2
ARG TARGETOS
ARG TARGETARCH

COPY patches/lndinit-fork-channeldb-version.patch /tmp/
COPY --from=builder /fork-channeldb-version /tmp/

RUN apk add --no-cache --update git make \
&&  git clone "$LNDINIT_REPO" /go/src/github.com/lightninglabs/lndinit \
&&  cd /go/src/github.com/lightninglabs/lndinit \
&&  git checkout "$LNDINIT_REF" \
&&  git apply /tmp/lndinit-fork-channeldb-version.patch \
&&  v=$(cat /tmp/fork-channeldb-version) \
&&  { echo "$v" | grep -Eq '^[0-9]+(, [0-9]+)*$' || { echo "bad channeldb versions: '$v'" >&2; exit 1; }; } \
&&  sed -i "s/FORK_CHANNELDB_VERSIONS/$v/g" cmd_migrate_db.go \
&&  grep -q "^	case $v:\$" cmd_migrate_db.go \
&&  GOOS=$TARGETOS GOARCH=$TARGETARCH make release-install \
&&  if [ -d "/go/bin/${TARGETOS}_${TARGETARCH}" ]; then \
        mv "/go/bin/${TARGETOS}_${TARGETARCH}"/* /go/bin/; \
    fi

FROM alpine:3.21

# The base image's CA store is only as current as its last release.
RUN apk add --no-cache --upgrade ca-certificates ca-certificates-bundle

# curl calls the REST API for wallet setup and migration polling; sqlite
# scrubs the migrated database; openssh-client and sshpass import remote
# wallets; rclone copies channel.backup to configured providers; flock
# serializes copies. bash, jq, ca-certificates, gnupg and wget match
# upstream's image. coreutils replaces BusyBox's timeout, which the health
# checks run lncli under: BusyBox's forks a watchdog and execs the command in
# its place, so the watchdog outlives it, is handed to the subcontainer's
# init, which never reaps, and stays a zombie, three a minute for as long as
# the service runs. GNU timeout waits for its own child.
RUN apk add --no-cache bash jq ca-certificates gnupg wget \
        curl sqlite openssh-client sshpass rclone flock coreutils

COPY --from=builder /go/bin/lnd /go/bin/lncli /bin/
COPY --from=builder /lightning-fork-commit /etc/lightning-fork-commit
COPY --from=builder /btcd-blake2b-version /etc/btcd-blake2b-version

# lndinit drives wallet initialization and the bolt -> SQLite migration; see
# the lndinit-builder stage.
COPY --from=lndinit-builder /go/bin/lndinit /bin/lndinit

# Continuous off-box copy of channel.backup (see startos/main.ts).
COPY backup-agent.sh /usr/local/bin/backup-agent.sh

RUN sha256sum /bin/lnd /bin/lncli > /shasums.txt && cat /shasums.txt

VOLUME /root/.lnd
EXPOSE 9735 10009
ENTRYPOINT ["lnd"]
