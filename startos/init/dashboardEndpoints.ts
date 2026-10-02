import { writeFile, rename } from 'fs/promises'
import { dashboardHostId, dashboardInterfaceId } from '../interfaces'
import { sdk } from '../sdk'
import { dashboardVolumeHost } from '../utils'

// Where the companion app can reach the dashboard's mobile API: its onion
// (when Tor serves one) and its LAN addresses over HTTPS, signed by the
// server's root CA that the app pins. Written to the dashboard's volume and
// read when a phone is paired, so a new address reaches the next pairing
// (and paired phones, which ask for it) without restarting the daemons.
export const dashboardEndpointsFile = `${dashboardVolumeHost}/endpoints.json`

export type DashboardEndpoints = {
  onion: string[]
  lan: string[]
  ip: string[]
}

export function dashboardEndpoints(host: any): DashboardEndpoints {
  const iface =
    host &&
    Object.values(host.bindings as Record<string, any>)
      .flatMap((b: any) => Object.values(b.interfaces))
      .find((i: any) => i.id === dashboardInterfaceId)
  if (!iface) return { onion: [], lan: [], ip: [] }
  const info = (iface as any).addressInfo
  const https = (urls: string[]) => urls.filter((u) => u.startsWith('https://'))
  return {
    onion: info
      .filter({
        predicate: ({ metadata }: any) =>
          metadata.kind === 'plugin' && metadata.packageId === 'tor',
      })
      .format(),
    lan: https(
      info.nonLocal.filter({ visibility: 'private', kind: ['mdns'] }).format(),
    ),
    ip: https(
      info.nonLocal.filter({ visibility: 'private', kind: ['ipv4'] }).format(),
    ),
  }
}

export const writeDashboardEndpoints = sdk.setupOnInit(async (effects) => {
  const endpoints = await sdk.host
    .getOwn(effects, dashboardHostId, dashboardEndpoints)
    .const()
  const tmp = `${dashboardEndpointsFile}.tmp`
  await writeFile(tmp, JSON.stringify(endpoints, null, 2))
  await rename(tmp, dashboardEndpointsFile)
})
