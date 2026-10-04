import { T } from '@start9labs/start-sdk'
import { i18n } from './i18n'
import { lndconnectRestId } from './interfaces'
import { sdk } from './sdk'
import { lndDataDir, mainMounts, mainVolumeHost, selfGrpcHost } from './utils'

// The SHA256 node's certificate and macaroon, from its lndconnect URI. In the
// main volume, so StartOS backups carry them, and kept when the bridge is
// turned off so that turning it back on needs no new URI.
export const bridgeDir = 'data/bridge'
export const bridgeCertFile = 'sha256-tls.cert'
export const bridgeMacaroonFile = 'sha256-admin.macaroon'
export const bridgeDirHost = `${mainVolumeHost}/${bridgeDir}`
export const bridgeDirLnd = `${lndDataDir}/${bridgeDir}`

// lncli prints a failed call as "[lncli] rpc error: code = … desc = …"; the
// sentence after `desc =` is the part written for the operator.
export function lncliError(res: {
  exitSignal?: string | null
  stdout: string | Buffer
  stderr: string | Buffer
}): string {
  if (res.exitSignal) return i18n('LND did not answer in time.')
  const text = String(res.stderr).trim() || String(res.stdout).trim()
  const desc = text.match(/desc = ([\s\S]*)$/)
  return (desc ? desc[1] : text.replace(/^\[lncli\]\s*/, '')).trim()
}

// Runs each lncli command in one temporary LND container and returns their
// output, or throws the first error as lncli wrote it. `args` that name no
// --rpcserver go to this node.
export async function lncli(
  effects: T.Effects,
  name: string,
  ...commands: string[][]
): Promise<string[]> {
  return sdk.SubContainer.withTemp(
    effects,
    { imageId: 'lnd' },
    mainMounts,
    name,
    async (subc) => {
      const out: string[] = []
      for (const args of commands) {
        const res = await subc.exec(
          args.some((a) => a.startsWith('--rpcserver='))
            ? ['lncli', ...args]
            : ['lncli', `--rpcserver=${selfGrpcHost}`, ...args],
          {},
          60_000,
        )
        if (res.exitCode !== 0) throw new Error(lncliError(res))
        out.push(String(res.stdout))
      }
      return out
    },
  )
}

/**
 * Payments through the bridge that are not finished: in flight, or stopped
 * for the operator. Null when the bridge cannot be asked (LND down or the
 * bridge off), which is no reason to refuse anything.
 *
 * While any exists the bridge must not be turned off or moved to another
 * SHA256 node: its journal finishes each payment through the node it started
 * on, and only while it runs. Cut off after paying the SHA256 invoice and
 * before claiming the payer's HTLC, a payment costs the operator what the
 * bridge already paid.
 */
export async function bridgeUnfinished(
  effects: T.Effects,
): Promise<number | null> {
  try {
    const [out] = await lncli(effects, 'bridge-unfinished', [
      'bridge',
      'status',
    ])
    const s = JSON.parse(out)
    if (!s.enabled) return null
    return Number(s.swaps_in_flight ?? 0) + (s.needs_operator ?? []).length
  } catch {
    return null
  }
}

// The onion addresses of the REST LND Connect interface, as the
// https://host:port a participant's node calls. Onions only: Tor
// authenticates them, while any other address would also need the SHA-256
// of the certificate StartOS's proxy presents there, which this package
// cannot read and which changes when that certificate is renewed. The
// addresses StartOS terminates TLS on come first; lnd's own port also serves
// TLS, so both work.
export function bridgeRestUrls(host: any): string[] {
  const iface =
    host &&
    Object.values(host.bindings as Record<string, any>)
      .flatMap((b: any) => Object.values(b.interfaces))
      .find((i: any) => i.id === lndconnectRestId)
  if (!iface) return []
  const onions = (
    (iface as any).addressInfo
      .filter({
        predicate: ({ metadata }: any) =>
          metadata.kind === 'plugin' && metadata.packageId === 'tor',
      })
      .format('hostname-info') as T.HostnameInfo[]
  )
    .filter((h) => h.hostname.endsWith('.onion'))
    .sort((a, b) => Number(b.ssl) - Number(a.ssl))
  return [
    ...new Set(
      onions.map((h) =>
        h.port ? `https://${h.hostname}:${h.port}` : `https://${h.hostname}`,
      ),
    ),
  ]
}
