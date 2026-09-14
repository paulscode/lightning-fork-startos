import { T } from '@start9labs/start-sdk'
import { BackendId, backends } from './backends'
import { gRPCPort, restPort } from './interfaces'
import { sdk } from './sdk'

export const lndDataDir = '/root/.lnd'
// Where the dashboard subcontainer mounts its own volume.
export const dashboardDataDir = '/data/dashboard'
export const bitcoindMnt = '/mnt/bitcoin'
export const mainVolumeHost = '/media/startos/volumes/main'
export const dashboardVolumeHost = '/media/startos/volumes/dashboard'

// For untrusted text passed as an i18n parameter: the SDK substitutes with
// String.replace, which reads `$&`, `$'` and `` $` `` in the value as patterns.
export const literal = (text: string) => text.replace(/\$/g, '$$$$')
// The watchtower *server* database (client sessions + their state-update
// backups), distinct from the wtclient db under data/graph. Deleted whenever
// the server is disabled — by the action and, as a backstop, by the migration.
export const watchtowerServerDir = `${mainVolumeHost}/data/watchtower`

/**
 * LND's own endpoints for its self-calls. Loopback rather than the bridge: the
 * bridge answers REST with the proxy's device cert, failing the `tls.cert` pin.
 */
export const selfRestUrl = `https://127.0.0.1:${restPort}`
export const selfGrpcHost = `127.0.0.1:${gRPCPort}`

/**
 * Connection settings for lnd.conf for the selected Bitcoin node. Each
 * address is its own `.const()` on a single string, so main re-runs only when
 * an address it uses actually changes (node install/uninstall/port-change),
 * not on a plain node update. The endpoints come from the selected package's
 * own `startos/utils.ts` (see backends.ts); the cookie is read through the
 * read-only mount of that package's volume.
 */
export const getBackendBundle = async (
  effects: T.Effects,
  backend: BackendId,
) => {
  const { endpoints, notifications } = backends[backend]

  const zmqAddr = (internalPort: number) =>
    sdk.host
      .getBridgeAddress(effects, {
        packageId: backend,
        hostId: endpoints.zmqHostId,
        internalPort,
      })
      .const()

  const rpchost = await sdk.host
    .getBridgeAddress(effects, {
      packageId: backend,
      hostId: endpoints.rpcHostId,
      internalPort: endpoints.rpcPort,
      ssl: false,
    })
    .const()

  // A backend that does not serve ZMQ is polled instead (see backends.ts);
  // every key of both modes is written so a switch between backends leaves
  // nothing of the other mode behind in lnd.conf.
  if (notifications === 'rpcpolling') {
    return {
      'bitcoin.node': 'bitcoind' as const,
      'bitcoind.rpchost': rpchost ?? undefined,
      'bitcoind.rpccookie': `${bitcoindMnt}/.cookie`,
      'bitcoind.zmqpubrawblock': undefined,
      'bitcoind.zmqpubrawtx': undefined,
      'bitcoind.rpcpolling': true,
      'bitcoind.blockpollinginterval': '10s',
      'bitcoind.txpollinginterval': '10s',
    }
  }

  const block = await zmqAddr(endpoints.zmqPortBlock)
  const tx = await zmqAddr(endpoints.zmqPortTransaction)

  return {
    'bitcoin.node': 'bitcoind' as const,
    'bitcoind.rpchost': rpchost ?? undefined,
    'bitcoind.rpccookie': `${bitcoindMnt}/.cookie`,
    'bitcoind.zmqpubrawblock': block ? `tcp://${block}` : undefined,
    'bitcoind.zmqpubrawtx': tx ? `tcp://${tx}` : undefined,
    'bitcoind.rpcpolling': undefined,
    'bitcoind.blockpollinginterval': undefined,
    'bitcoind.txpollinginterval': undefined,
  }
}

/**
 * Where the daemon records the outcome of its chain-identity check, next to
 * channel.backup: waiting (the node has not reached the BLAKE2b activation
 * height), confirmed, or refused with the reason. Read from the host path so
 * the health check works whether or not the subcontainer is up.
 */
/**
 * The Mempool apps the dashboard may take fee rates and transaction links
 * from, when installed: for each, the bridge address of the app's web UI
 * (its nginx serves the fee endpoint the app's own page reads, so the
 * dashboard shows the numbers that page shows) for the dashboard's own
 * requests, and the UI's LAN and onion addresses for the links a browser
 * follows. An app that is not installed resolves to nothing and is not
 * offered. Read once at start: an app installed later is picked up by a
 * restart of this service, which the dashboard's Mempool page says.
 */
export const mempoolApps = [
  { id: 'mempool', prefix: 'MEMPOOL_GUIDE' },
  { id: 'mempool-pruned', prefix: 'MEMPOOL_PRUNED' },
] as const
export const mempoolUiHostId = 'main'
export const mempoolUiPort = 8080

export const mempoolAppsEnv = async (
  effects: T.Effects,
): Promise<Record<string, string>> => {
  const env: Record<string, string> = {}
  for (const { id, prefix } of mempoolApps) {
    let api: string | null = null
    try {
      api = await sdk.host
        .getBridgeAddress(effects, {
          packageId: id,
          hostId: mempoolUiHostId,
          internalPort: mempoolUiPort,
          ssl: false,
        })
        .once()
    } catch (_e) {
      api = null
    }
    if (!api) continue
    env[`${prefix}_API`] = `http://${api}`
    try {
      // The app's web UI binding, with every address the host enabled for
      // it as a URL: the LAN name for a browser on the LAN, the onion
      // address for a page opened over Tor.
      const addresses = await sdk.host
        .get(
          effects,
          { hostId: mempoolUiHostId, packageId: id },
          (host) => {
            const info =
              host?.bindings?.[mempoolUiPort]?.interfaces?.webui?.addressInfo
            const urls = (info?.format() ?? []) as string[]
            return {
              lan: urls.filter((u) => /\.local(:\d+)?\/?$/.test(u)),
              onion: urls.filter((u) => /\.onion(:\d+)?\/?$/.test(u)),
            }
          },
        )
        .once()
      if (addresses?.lan[0]) env[`${prefix}_UI_URL`] = addresses.lan[0]
      if (addresses?.onion[0]) {
        env[`${prefix}_HIDDEN_SERVICE`] = addresses.onion[0].replace(
          /^https?:\/\//,
          '',
        )
      }
    } catch (_e) {
      // The addresses are a convenience for links; the rates still work.
    }
  }
  return env
}

export const chainIdentityHostPath = `${mainVolumeHost}/data/chain/bitcoin/mainnet/chain-identity.json`

export type ChainIdentityStatus = {
  state: 'waiting' | 'confirmed' | 'refused' | 'skipped'
  reason?: string
  network: string
  chain_hash: string
  activation_height: number
  activation_hash?: string
  node_headers?: number
  updated_at: string
}

export const mainMounts = sdk.Mounts.of().mountVolume({
  volumeId: 'main',
  subpath: null,
  mountpoint: lndDataDir,
  readonly: false,
})

export type GetInfo = {
  identity_pubkey: string
  alias: string
  uris: string[]
  num_peers: number
  synced_to_chain: boolean
  synced_to_graph: boolean
}

export function sleep(ms: number, abort?: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    abort?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

export const channelBackupPath = `${lndDataDir}/data/chain/bitcoin/mainnet/channel.backup`
export const localRestoreBackupPath = `${lndDataDir}/channel.backup.startos-restore`
export const localRestoreBackupTempPath = `${localRestoreBackupPath}.tmp`
export const remoteRestoreDir = `${lndDataDir}/.channel-backup-restore`
export const backupAgentScript = '/usr/local/bin/backup-agent.sh'
export const backupFolderDefault = 'lnd-channel-backups'
