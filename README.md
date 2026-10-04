# lightning-fork-startos

[Lightning Fork](https://github.com/paulscode/lightning-fork), an LND fork that
follows the Bitcoin BLAKE2b chain, packaged for StartOS 0.4.0.x. Derived from
[Start9's LND package](https://github.com/Start9Labs/lnd-startos) at SDK 2.0.9;
wallet setup, channel backups, cold storage mode, Tor and the watchtower are
that package's code, unchanged. What differs is below.

Maintained by Paul Lamb (<https://github.com/paulscode>). Not affiliated with
Start9 or Lightning Labs.

## What it wraps

The image is built from source by `Dockerfile`: `github.com/paulscode/lightning-fork`
at the commit pinned in `LIGHTNING_FORK_REF`, whose `go.mod` pins
`github.com/paulscode/btcd-blake2b` for the 164-byte header and BLAKE2b block
id. `/etc/lightning-fork-commit` and `/etc/btcd-blake2b-version` inside the
image say exactly what it runs:

```
start-cli package attach lightning-fork -n lnd-sub -- cat /etc/lightning-fork-commit
```

`lndinit` is the stock `lightninglabs/lndinit` build; it speaks the same RPC and
reads the same database layout.

A second image, `dashboard`, is pulled by tag from
`paulscode/umbrel-lightning-fork` (a universal pack needs the image for both
architectures, and Docker cannot hold one digest reference for two platforms;
the index digest the tag resolved to at release time is recorded beside it in
the manifest): the Umbrel Lightning app's web UI, forked
for this chain (`github.com/paulscode/umbrel-lightning-fork`) and run with
`DASHBOARD_PLATFORM=startos`, which drops wallet setup, LND configuration,
Umbrel's backup server, widgets and connection strings, and puts a sign-in
screen in front of the API: one password, a session cookie with a CSRF token,
and a global lockout that backs off from the third wrong attempt. The password
lives in `dashboard.json` on the `dashboard` volume, read on every attempt, so
**Set Dashboard Password** changes it without a restart and `main` never
watches that file; **Dashboard Password** shows it masked with a copy button. The dashboard
reaches LND over the loopback the subcontainers share, and reads the selected
node's RPC cookie through the same read-only dependency mount LND uses. It
mounts nothing of LND's own volume: the SDK ignores `readonly` on a package's
own volumes, so a `dashboard-credentials` oneshot copies `tls.cert` and
`admin.macaroon` into the `dashboard` volume at each start instead (after
`unlock-wallet` in a lifecycle that rotates the macaroon root key), and the
dashboard's health check reads `/ping`, which reports whether a password is set.

## Node selection

Two Bitcoin nodes are declared as optional dependencies and exactly one is
returned as required from `startos/dependencies.ts`, chosen by the **Select
Node** action and recorded in `store.json`:

| Choice | Package id | Endpoints imported from |
| --- | --- | --- |
| Bitcoin Knots | `bitcoind` (the official package; only its Knots flavor at 29.4.1 or later follows the BLAKE2b chain) | `bitcoin-core-startos/startos/utils` |
| Bitcoin Knots (BLAKE2b) Companion | `knots-blake2b` | `knots-blake2b-startos/startos/utils` |

`startos/backends.ts` holds each node's RPC/ZMQ host ids and ports, the
health checks it must pass (`bitcoind`+`sync-progress` for the official
package, `node`+`chain` for the companion, whose `chain` check already fails
below the activation height), and how the daemon is told about new blocks:
ZMQ for both, driven on with a critical task through each package's
`autoconfig` action (the companion from 1.0.0:34, the first whose bitcoind is
built with libzmq; earlier ones never listened on the ZMQ ports they
exported, so this package polled them over RPC). The official package's
version range is `*`: a range cannot name a flavor, and the Knots build most
BLAKE2b users run ships an empty `satisfies` list, so any narrower range
shows an unmet dependency against the very node this package is for; the
chain check at start is what enforces "Knots 29.4.1 or later". `startos/utils.ts` resolves the selected
node's bridge addresses into `lnd.conf` at start, writing every key of both
modes so a switch leaves nothing of the other behind; the RPC cookie is read
through a read-only mount of the selected package's volume.

Neither dependency constrains the *chain* the node is on. That is the
daemon's job:

## Chain identity

Lightning Fork will not use a node on the SHA256d chain. Before its chain
backend is used, and every five minutes after, it reads the block header at
the BLAKE2b activation height (961640) and requires a 164-byte header-v2
whose id it can reproduce and, on mainnet, the pinned hash
`0000000000000050c1e5f69672f459293be14f46e5a494e7a8c8541396f18eeb`. Any
doubt is a refusal: the daemon exits, and StartOS restarts it into the same
check. The outcome is written to
`data/chain/bitcoin/mainnet/chain-identity.json` in the main volume, and the
**Chain Identity** health check shows it:

| State | Health check |
| --- | --- |
| `waiting` | loading: the node has not reached block 961640 yet (shows its header count) |
| `confirmed` | success, with the activation block hash |
| `refused` | failure, with the daemon's reason and a pointer to Select Node |
| `skipped` | success; only an integration build writes it |
| anything else | failure naming the state |
| file absent | starting: the check runs after wallet unlock |

Once confirmed, the file also carries `reduced_data`, the state of the
chain's temporary block-size reduction as the node reports it; the package
does not act on it yet.

The check reads the host path only: it does not require the lnd daemon to
be healthy (a refused daemon exits and is restarted, so it never is) and
has no grace period, so the refusal is visible as soon as it is written.
`main` deletes the file when the service starts, so a verdict always belongs
to this run and the node selected now, and backups exclude it. The daemon
also accepts `--bitcoin.chain-identity-file` to write the verdict elsewhere;
this package keeps the default location because it reads the volume from the
host side.

The daemon also sets `option_blake2b` (feature bit 512, even) in `init`, in
its invoices and in its offers, which a node on the SHA256 chain must refuse, and
refuses invoices and offers that do not set it; the chain hash and the `lnbc`
prefix are unchanged, the same as on the SHA256 chain. See
[docs/blake2b.md](https://github.com/paulscode/lightning-fork/blob/blake2b/docs/blake2b.md)
in the daemon's repository for the whole design.

## Ports

Internal ports are lnd's defaults (9735 peer, 10009 gRPC, 8080 REST, 9911
watchtower) so `lnd.conf` stays stock; the dashboard listens on 3006, exported
as the `dashboard` UI interface behind StartOS's own TLS. Preferred external ports are 9737,
10010, 8180 and 9913 so this package and the official LND can be installed on
one server; on StartOS a colliding preferred port silently lands on a random
one, so read the interface addresses rather than assuming these.

## What was removed from the LND package

- The neutrino backend and `fee.url`: neutrino would have to validate BLAKE2b
  proof of work itself against a network with no filter servers.
- Wallet migration from Umbrel, myNode or another StartOS server: those hold
  channels on the SHA256d chain with peers on the SHA256d chain, and nothing
  here could close them. Initialize Wallet offers Start Fresh only.
- The version graph below `current`: every earlier revision upgrades
  through `current`'s own migration, which is idempotent (it completes a
  saved Nextcloud address, and leaves a complete one alone).

## Channel backups

`backup-agent.sh` is the LND package's agent, shared with the Umbrel build
of the dashboard (which pins it by commit and SHA-256). It copies to
`<folder>/<sha256 of the identity pubkey's hex>/channel.backup` on each
target, the layout Start9's LND package uses, and exits 7 until the node's
identity is known. `--pull` falls back to the flat `<folder>/channel.backup`
of earlier releases when the per-node file is absent. The identity comes from
`NODE_PUBKEY` when set (the Umbrel dashboard has no lncli), otherwise from
`lncli getinfo` on `LNCLI_RPCSERVER` (default `127.0.0.1:10009`) with
`LNCLI_LNDDIR` when set. The bridge's SHA256 node, when there is one, gets a
second instance (`sha256-channel-backup-agent`, health check **Bridge Node
Channel Backup**) with that node's `CHANNEL_BACKUP_FILE` and lncli, and its
own `BACKUP_STATE_FILE`, `BACKUP_LOCK_FILE`, `BACKUP_WORK_DIR` and
`BACKUP_RESTORE_DIR`; the targets are the same, and its identity names its own
folder. That node is recreated from the same seed after a restore or on a new
server, so it writes to the old node's folder: with `BACKUP_KEEP_FIRST=1` the
agent first keeps any copy already there as `channel.backup.before-<time>`
(and replaces nothing it could not keep), once per target, as recorded in a
`.kept` file that backups leave out. Restoring from such a copy is by hand:
put it at `sha256-node/data/chain/bitcoin/mainnet/channel.backup` before the
bridge recreates the node. `sh tests/backup-agent.test.sh` exercises it with
stub `lncli` and `rclone`. `current`'s migration completes a saved Nextcloud
address to the `/remote.php/dav/files/USER/` form rclone requires.

## Bridge

The daemon's `bridgerpc` sub-server (off unless `bridgerpc.enabled`) pays
invoices on the SHA256 chain through a stock LND there; see `docs/bridge.md`
and `docs/bridge-sha256-node.md` in the daemon's repository. The **Bridge**
action chooses how that LND is provided:

- **Lightning Fork runs one** (`bridgerpc.sha256.supervised`, the default):
  daemon `sha256-lnd` runs the stock `lightninglabs/lnd` image (`sha256-lnd`)
  from `sha256Node.ts`, with its lnd directory at `sha256-node/` in the main
  volume. Its shell waits for Lightning Fork to write the wallet password
  (`data/chain/bitcoin/mainnet/bridge/sha256/wallet.password`); Lightning
  Fork creates its wallet from a derived seed, bakes the bridge's macaroon
  and checks its identity and chain. It reads the chosen node on the SHA256
  chain (`knots-prerdts` or `bitcoind`, store `bridgeSha256Backend`) by RPC
  polling with that package's cookie, and listens on 127.0.0.1 for gRPC
  (10019, Lightning Fork's default address) and REST (8089), and on 9739 for
  peers: the **SHA256 Lightning Peer** interface (once a node has existed),
  whose onion, when the operator adds one, is the only address it advertises;
  it uses Tor as Lightning Fork does (`tor.active`, its skip-clearnet choice
  and `tor.dns`), and not at all when Lightning Fork does not. It
  mounts only `sha256-node/` and the bridge's `bridge/sha256/` from the main
  volume. A copier in the same shell, stopped with lnd, keeps its `tls.cert`
  and the console's narrow `operator.macaroon` (baked by Lightning Fork; never
  the admin one) in the dashboard volume's `sha256/`. The daemon and the
  dependency on its chain node exist while the bridge is on in this mode and
  after, while the node has a wallet (`sha256WalletExists`); its health check
  is `lncli state`: catching up is starting, and not answering for five
  minutes once it has its password is a failure. `nodeChain.ts` tells each installed node
  package's chain from its version for the forms, which label, suggest and
  refuse accordingly. Backups keep its `channel.backup` and leave out its
  wallet, macaroons and channel database (`backups.ts`); after a restore with
  the bridge off a health check says to turn it on.
- **An LND I already run:** takes that node's gRPC lndconnect URI, writes its
  certificate (PEM) and macaroon to `data/bridge/` in the main volume, checks
  them with `lncli getinfo` before saving, and sets `bridgerpc.sha256.*`.

Turning the bridge off removes `bridgerpc.enabled`, the directions and the
rate keys, and keeps `bridgerpc.sha256.*`: a bridge off with a payment
unfinished drains it through that node (Lightning Fork quotes nothing and
stops once it is done). The Bridge health check and Bridge Status stay while
those keys are there, to show it. What counts as unfinished is Lightning
Fork's own `unfinished` count, which leaves out lost payments (final). The files, the journal and a supervised node stay. Turning it off, or moving it to another
node, is refused while `lncli bridge status` shows swaps in flight or needing
the operator. The bridge dials without Tor. A bridge that cannot reach its
node stays down and tries again while LND runs as usual; Bridge Status says
why. **Bridge Status**, **Set Bridge Rate** and **Add Bridge Participant** run
`lncli bridge status|info|setrate|code` and are hidden while the bridge is
off; **Fund the SHA256 Node**, **Open SHA256 Channel** and **SHA256 Node
Recovery Phrase** (`lncli bridge sha256seed`) are shown once a supervised node
has existed. Codes are offered for the REST interface's onion addresses only:
any other address needs the SHA-256 of the certificate StartOS presents
there. Each code's root key id and label are kept in `store.json`
(`bridgeParticipants`), and **Remove Bridge Participant** runs
`lncli deletemacaroonid` on it.

## Building

```
npm install
npm run check
make x86            # or make, for both architectures
```

`make install` side-loads onto the host in `.startos/config.yaml`. The
workspace's `release.sh` stages universal builds for the registry.

## Diagnosing

- `chain-identity.json` (above) is the first thing to read when the service
  will not start.
- `start-cli package attach lightning-fork -n lnd-sub -- lncli getinfo`
  reports `version` ending in `-blake2b.<n>`, and `chains: [{chain: bitcoin,
  network: mainnet}]`; the chain distinction is `option_blake2b` in the
  handshake, invoices and offers, not in those strings.
- **Network and Graph Sync Progress** also checks that the Bitcoin node
  serves blocks, not just headers: once LND has been behind the chain for
  five minutes, and every five minutes after, it has LND fetch the tip block
  (`lncli chain getblock`). A failure reads *Bitcoin is not serving blocks to
  LND* with the error, and two in a row send one error notification. The
  result stays `loading`, which dependents gate on. Upstream also sets
  `routing.assumechanvalid` on a pruned node; this package does not (see
  `AGENTS.md`).
- Paying an invoice from a node on the SHA256 chain, or from a Lightning Fork node
  older than 0.21.3-beta-blake2b.12, fails with a message saying the invoice
  does not set `option_blake2b`; that is the intended behaviour.
