import { sdk } from './sdk'
import { watchtowerHostId, watchtowerInterfaceId } from './interfaces'

// The kinds of address the watchtower server can be given. What is stored is
// the kind the user chose; the address itself is re-derived from the host
// whenever it changes (init/watchHosts.ts), so a new onion, domain or IP does
// not leave other nodes holding a stale URI.
export const watchtowerAddressKinds = ['tor', 'domain', 'ipv4', 'lan'] as const
export type WatchtowerAddressKind = (typeof watchtowerAddressKinds)[number]
export type WatchtowerAddresses = Record<WatchtowerAddressKind, string[]>

// The watchtower interface's addresses, by kind: its Tor onion, a public
// domain, a public IPv4 address, and the LAN addresses (private IPv4 and
// mDNS) that only nodes on the same network can reach.
export function watchtowerAddresses(
  host: any,
): WatchtowerAddresses | undefined {
  const iface =
    host &&
    Object.values(host.bindings as Record<string, any>)
      .flatMap((b: any) => Object.values(b.interfaces))
      .find((i: any) => i.id === watchtowerInterfaceId)
  if (!iface) return undefined
  const info = (iface as any).addressInfo
  return {
    tor: info
      .filter({
        predicate: ({ metadata }: any) =>
          metadata.kind === 'plugin' && metadata.packageId === 'tor',
      })
      .format(),
    domain: info.public
      .filter({
        predicate: ({ metadata }: any) => metadata.kind === 'public-domain',
      })
      .format(),
    ipv4: info.public
      .filter({ predicate: ({ metadata }: any) => metadata.kind === 'ipv4' })
      .format(),
    lan: info.nonLocal
      .filter({ visibility: 'private', kind: ['ipv4', 'mdns'] })
      .format(),
  }
}

// The kind an address belongs to, or null if the host no longer offers it.
export function kindOf(
  addrs: WatchtowerAddresses,
  address: string,
): WatchtowerAddressKind | null {
  for (const kind of watchtowerAddressKinds)
    if (addrs[kind].includes(address)) return kind
  if (address.endsWith('.onion') || /\.onion:\d+$/.test(address)) return 'tor'
  return null
}

export const getWatchtowerAddresses = (effects: any) =>
  sdk.host.getOwn(effects, watchtowerHostId, watchtowerAddresses)
