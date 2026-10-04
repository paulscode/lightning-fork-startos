import { T } from '@start9labs/start-sdk'
import {
  rpcHostId as btcRpcHostId,
  rpcPort as btcRpcPort,
} from 'bitcoin-core-startos/startos/utils'
import { BackendId, Sha256BackendId, sha256BackendIds } from './backends'
import { sdk } from './sdk'
import { lndDataDir } from './utils'

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
 * (lnrpc/bridgerpc/config_active.go). Both live in the main volume, so a
 * StartOS backup carries this node with the other.
 */

/** The stock node's lnd directory. */
export const sha256NodeDir = `${lndDataDir}/sha256-node`
export const sha256NodeDirHost = '/media/startos/volumes/main/sha256-node'

/** The wallet password Lightning Fork writes, beside the bridge's journal. */
export const sha256PasswordFile = `${lndDataDir}/data/chain/bitcoin/mainnet/bridge/sha256/wallet.password`

/** Its admin macaroon, for the operator's own tools, never the bridge's. */
export const sha256AdminMacaroon = `${sha256NodeDir}/data/chain/bitcoin/mainnet/admin.macaroon`
export const sha256AdminMacaroonHost = `${sha256NodeDirHost}/data/chain/bitcoin/mainnet/admin.macaroon`
export const sha256TlsCertHost = `${sha256NodeDirHost}/tls.cert`

/**
 * Its ports, clear of Lightning Fork's own (9735, 10009, 8080) in the network
 * namespace the two daemons share. gRPC is where Lightning Fork's bridge
 * dials it, at the default bridgerpc.sha256.rpchost.
 */
export const sha256P2pPort = 9739
export const sha256GrpcPort = 10019
export const sha256RestPort = 8089

/** Where the SHA256 Bitcoin node's volume is mounted, for its RPC cookie. */
export const sha256BitcoindMnt = '/mnt/sha256-bitcoin'

/**
 * The Bitcoin Knots packages that can follow the SHA256 chain. The official
 * one does in its pre-RDTS flavor (installed as `bitcoind`); the SHA256
 * Companion always does. Both are forks of the official package and share its
 * endpoints, volume layout and health checks.
 */
export { sha256BackendIds } from './backends'
export type { Sha256BackendId } from './backends'

export const sha256Backends: Record<
  Sha256BackendId,
  { title: string; versionRange: string; healthChecks: string[] }
> = {
  'knots-prerdts': {
    title: 'Bitcoin Knots (SHA256) Companion',
    versionRange: '>=29.3:25',
    healthChecks: ['bitcoind', 'sync-progress'],
  },
  bitcoind: {
    title: 'Bitcoin Knots (pre-RDTS flavor)',
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
 * The stock lnd's command line. Polling rather than ZMQ, so nothing has to be
 * switched on in the SHA256 Bitcoin node for this, and a block is noticed
 * within ten seconds, which a bridge node can live with.
 *
 * The shell waits for the password file: lnd exits without it, and a
 * restarting daemon would read as broken while the bridge is simply off.
 */
export function sha256NodeCommand(rpchost: string): string[] {
  const args = [
    `--lnddir=${sha256NodeDir}`,
    '--bitcoin.mainnet',
    '--bitcoin.node=bitcoind',
    `--bitcoind.rpchost=${rpchost}`,
    `--bitcoind.rpccookie=${sha256BitcoindMnt}/.cookie`,
    '--bitcoind.rpcpolling',
    '--bitcoind.blockpollinginterval=10s',
    '--bitcoind.txpollinginterval=10s',
    `--rpclisten=0.0.0.0:${sha256GrpcPort}`,
    `--restlisten=0.0.0.0:${sha256RestPort}`,
    `--listen=0.0.0.0:${sha256P2pPort}`,
    '--alias=Lightning Fork bridge (SHA256)',
    `--wallet-unlock-password-file=${sha256PasswordFile}`,
    '--wallet-unlock-allow-create',
  ]
  const quoted = args.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' ')

  return [
    'sh',
    '-c',
    `until [ -s '${sha256PasswordFile}' ]; do sleep 2; done; exec lnd ${quoted}`,
  ]
}
