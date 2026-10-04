import { T } from '@start9labs/start-sdk'
import {
  rpcHostId as btcRpcHostId,
  rpcPort as btcRpcPort,
} from 'bitcoin-core-startos/startos/utils'
import { BackendId, Sha256BackendId, sha256BackendIds } from './backends'
import { sdk } from './sdk'
import { lndDataDir } from './utils'
import { sha256GrpcPort, sha256P2pPort, sha256RestPort } from './sha256Ports'
import { stat } from 'fs/promises'

/**
 * The SHA256 Lightning node Lightning Fork runs for the bridge
 * (bridgerpc.sha256.supervised): a stock upstream lnd, from the official
 * image, in a daemon of this package.
 *
 * The split of work, which these constants are the contract for:
 *
 * - This package runs the process, and only once Lightning Fork has written
 *   the wallet password file. lnd refuses to start without it, so a node that
 *   never bridges never runs it; with it and --wallet-unlock-allow-create it
 *   waits for its wallet to be created.
 * - Lightning Fork creates that wallet from a seed derived from its own (one
 *   phrase is enough), keeps the password, bakes the narrow macaroon the
 *   bridge uses, and refuses the node if it is not the one it created.
 *
 * The paths are where Lightning Fork looks by default
 * (lnrpc/bridgerpc/config_active.go). Both live in the main volume; a StartOS
 * backup carries this node's channel backup and leaves out its wallet, which
 * Lightning Fork recreates from the derived seed (backups.ts).
 */

/** The stock node's lnd directory. */
export const sha256NodeDir = `${lndDataDir}/sha256-node`
export const sha256NodeDirHost = '/media/startos/volumes/main/sha256-node'

/** The wallet password Lightning Fork writes, beside the bridge's journal. */
export const sha256PasswordFile = `${lndDataDir}/data/chain/bitcoin/mainnet/bridge/sha256/wallet.password`

/** The console's narrow macaroon, baked by Lightning Fork beside the password. */
export const sha256SecretsDir = `${lndDataDir}/data/chain/bitcoin/mainnet/bridge/sha256`
export const sha256OperatorMacaroon = `${sha256SecretsDir}/operator.macaroon`

/** Its admin macaroon, for the operator's own tools, never the bridge's. */
export const sha256AdminMacaroon = `${sha256NodeDir}/data/chain/bitcoin/mainnet/admin.macaroon`
export const sha256AdminMacaroonHost = `${sha256NodeDirHost}/data/chain/bitcoin/mainnet/admin.macaroon`
export const sha256TlsCertHost = `${sha256NodeDirHost}/tls.cert`

// Its ports: sha256Ports.ts says why they live there.
export { sha256P2pPort, sha256GrpcPort, sha256RestPort }

/** Where the SHA256 Bitcoin node's volume is mounted, for its RPC cookie. */
export const sha256BitcoindMnt = '/mnt/sha256-bitcoin'

/**
 * The packages that can be the node on the SHA256 chain the bridge's node
 * reads: Bitcoin Knots (SHA256) Companion, or the official package when it is
 * Bitcoin Core or a Knots build for that chain (nodeChain.ts tells which).
 */
export { sha256BackendIds } from './backends'
export type { Sha256BackendId } from './backends'

export const sha256Backends: Record<
  Sha256BackendId,
  { title: string; versionRange: string; healthChecks: string[] }
> = {
  'knots-prerdts': {
    title: 'Bitcoin Knots (SHA256) Companion',
    // Any version: an unflavored range never matches its #knotsprerdts
    // versions except through the package's own satisfies list. It follows
    // the SHA256 chain whatever its version, and the bridge checks that.
    versionRange: '*',
    healthChecks: ['bitcoind', 'sync-progress'],
  },
  bitcoind: {
    // As Select Node names it; the form says which chain the installed one
    // is on.
    title: 'Bitcoin Knots',
    // Any version: a range cannot name a flavor, and the chain the node
    // follows is what matters, which lnd itself finds out.
    versionRange: '*',
    healthChecks: ['bitcoind', 'sync-progress'],
  },
}

/**
 * The SHA256 Bitcoin nodes the bridge's node can use: never the package
 * Lightning Fork itself reads, which is on the BLAKE2b chain.
 */
export function sha256BackendChoices(lfBackend: BackendId): Sha256BackendId[] {
  return sha256BackendIds.filter((id) => id !== lfBackend)
}

/**
 * Whether Lightning Fork has created the SHA256 node's wallet. From then on
 * the node runs whether or not the bridge is on, and whichever LND the bridge
 * pays through: it may hold channels, and a node that is not watching its
 * channels can be cheated out of them. Only a node that never had a wallet
 * stays stopped.
 */
export async function sha256WalletExists(): Promise<boolean> {
  return stat(`${sha256NodeDirHost}/data/chain/bitcoin/mainnet/wallet.db`).then(
    () => true,
    () => false,
  )
}

/**
 * Whether the node has a channel backup and no wallet: what a backup restore
 * leaves (backups.ts). Its wallet is created again, with that backup, only by
 * Lightning Fork, so only while the bridge is on in that mode.
 */
export async function sha256ChannelsToRestore(): Promise<boolean> {
  if (await sha256WalletExists()) return false
  return stat(
    `${sha256NodeDirHost}/data/chain/bitcoin/mainnet/channel.backup`,
  ).then(
    (s) => s.size > 0,
    () => false,
  )
}

/** The SHA256 Bitcoin node's RPC bridge address, or null if absent. */
export async function sha256RpcHost(
  effects: T.Effects,
  backend: Sha256BackendId,
): Promise<string | null> {
  return sdk.host
    .getBridgeAddress(effects, {
      packageId: backend,
      hostId: btcRpcHostId,
      internalPort: btcRpcPort,
      ssl: false,
    })
    .const()
}

/**
 * Where the stock node's daemon puts copies of its certificate and admin
 * macaroon for the dashboard (the dashboard volume's sha256/), so the
 * dashboard, which mounts nothing of this package's main volume, can fund the
 * node and open its channels. Mounted at sha256DashboardMnt in the node's
 * subcontainer and read at sha256DashboardDir by the dashboard.
 */
export const sha256DashboardSubpath = 'sha256'
export const sha256DashboardMnt = '/mnt/dashboard-sha256'

/**
 * The stock lnd's command line. Polling rather than ZMQ, so nothing has to be
 * switched on in the SHA256 Bitcoin node for this, and a block is noticed
 * within ten seconds, which a bridge node can live with.
 *
 * The shell waits for the password file: lnd exits without it, and a
 * restarting daemon would read as broken while the bridge is simply off. It
 * leaves at once when stopped while it waits, rather than at the kill.
 *
 * gRPC and REST listen on the loopback the package's subcontainers share:
 * Lightning Fork, the dashboard and the actions are all there. Only the peer
 * port is for other nodes.
 *
 * Beside lnd runs a copier that keeps the dashboard's copies of its
 * certificate and admin macaroon current, checking every thirty seconds; the
 * macaroon appears only once Lightning Fork has created the wallet. It stops
 * with lnd.
 */
export function sha256NodeCommand(
  rpchost: string,
  extra: string[] = [],
): string[] {
  const args = [
    `--lnddir=${sha256NodeDir}`,
    '--bitcoin.mainnet',
    '--bitcoin.node=bitcoind',
    `--bitcoind.rpchost=${rpchost}`,
    `--bitcoind.rpccookie=${sha256BitcoindMnt}/.cookie`,
    '--bitcoind.rpcpolling',
    '--bitcoind.blockpollinginterval=10s',
    '--bitcoind.txpollinginterval=10s',
    `--rpclisten=127.0.0.1:${sha256GrpcPort}`,
    `--restlisten=127.0.0.1:${sha256RestPort}`,
    `--listen=0.0.0.0:${sha256P2pPort}`,
    '--alias=Lightning Fork bridge (SHA256)',
    `--wallet-unlock-password-file=${sha256PasswordFile}`,
    '--wallet-unlock-allow-create',
    ...extra,
  ]
  const q = (a: string) => `'${a.replace(/'/g, `'\\''`)}'`
  const copies: Array<[string, string]> = [
    [`${sha256NodeDir}/tls.cert`, `${sha256DashboardMnt}/tls.cert`],
    // The console's own narrow macaroon, which Lightning Fork bakes once
    // the wallet exists; never the admin one.
    [sha256OperatorMacaroon, `${sha256DashboardMnt}/operator.macaroon`],
  ]
  const copy = copies
    .map(
      ([from, to]) =>
        `if [ -s ${q(from)} ] && ! cmp -s ${q(from)} ${q(to)}; then ` +
        `cp ${q(from)} ${q(to + '.tmp')} && chmod 600 ${q(to + '.tmp')} && ` +
        `mv -f ${q(to + '.tmp')} ${q(to)}; fi`,
    )
    .join('; ')

  // lnd is not exec'd: the shell stays to stop the copier with it. Left
  // running behind an exec'd lnd, each restart of the daemon in the same
  // subcontainer would add another.
  return [
    'sh',
    '-c',
    [
      `trap 'exit 0' TERM INT`,
      `until [ -s ${q(sha256PasswordFile)} ]; do sleep 2 & wait $!; done`,
      // The admin macaroon an earlier build copied there; the dashboard
      // gets only the operator one now.
      `rm -f ${q(`${sha256DashboardMnt}/admin.macaroon`)}`,
      `(while :; do ${copy}; sleep 30; done) &`,
      `copier=$!`,
      `lnd ${args.map(q).join(' ')} &`,
      `lnd=$!`,
      `trap 'kill -TERM $lnd 2>/dev/null; wait $lnd; kill $copier 2>/dev/null; exit 0' TERM INT`,
      `wait $lnd`,
      `rc=$?`,
      `kill $copier 2>/dev/null`,
      `exit $rc`,
    ].join('\n'),
  ]
}
