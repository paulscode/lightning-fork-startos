# Lightning Fork for StartOS: lnd and lncli built from a pinned commit of
# github.com/paulscode/lightning-fork, plus the tools the package's own scripts
# need. Built from source rather than pulled, so the image records exactly
# which commit it runs and no published image has to exist first.
FROM golang:1.26.6-alpine AS builder

# Force Go to use the cgo based DNS resolver, as upstream's image does.
ENV GODEBUG=netdns=cgo

ARG LIGHTNING_FORK_REPO=https://github.com/paulscode/lightning-fork
ARG LIGHTNING_FORK_REF=e36be2b5fff0acbdd2df68513fa78a03b1d79071

# The module path is upstream's (github.com/lightningnetwork/lnd); go.mod
# replaces btcd with github.com/paulscode/btcd-blake2b at a tagged release.
RUN apk add --no-cache --update alpine-sdk git make gcc \
&&  git clone "$LIGHTNING_FORK_REPO" /go/src/github.com/lightningnetwork/lnd \
&&  cd /go/src/github.com/lightningnetwork/lnd \
&&  git checkout "$LIGHTNING_FORK_REF" \
&&  git rev-parse HEAD > /lightning-fork-commit \
&&  go list -m -f '{{.Replace.Path}} {{.Replace.Version}}' github.com/btcsuite/btcd > /btcd-blake2b-version \
&&  make release-install

FROM alpine:3.21

# curl calls the REST API for wallet setup and migration polling; sqlite
# scrubs the migrated database; openssh-client and sshpass import remote
# wallets; rclone copies channel.backup to configured providers; flock
# serializes copies. bash, jq, ca-certificates, gnupg and wget match
# upstream's image.
RUN apk add --no-cache bash jq ca-certificates gnupg wget \
        curl sqlite openssh-client sshpass rclone flock

COPY --from=builder /go/bin/lnd /go/bin/lncli /bin/
COPY --from=builder /lightning-fork-commit /etc/lightning-fork-commit
COPY --from=builder /btcd-blake2b-version /etc/btcd-blake2b-version

# lndinit drives wallet initialization and the bolt -> SQLite migration. The
# stock build works against Lightning Fork: it speaks the same RPC and reads
# the same database layout.
COPY --from=lightninglabs/lndinit:v0.1.37-beta-lnd-v0.21.3-beta /bin/lndinit /bin/lndinit

# Continuous off-box copy of channel.backup (see startos/main.ts).
COPY backup-agent.sh /usr/local/bin/backup-agent.sh

RUN sha256sum /bin/lnd /bin/lncli > /shasums.txt && cat /shasums.txt

VOLUME /root/.lnd
EXPOSE 9735 10009
ENTRYPOINT ["lnd"]
