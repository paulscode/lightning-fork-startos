import { FileHelper, z } from '@start9labs/start-sdk'
import { BackendId, backendIds, defaultBackend } from '../backends'
import { sdk } from '../sdk'

export const shape = z.object({
  // Which Bitcoin node to run against. `.catch()` so an absent or unreadable
  // store still yields a resolvable backend.
  backend: z
    .enum(backendIds as [BackendId, ...BackendId[]])
    .catch(defaultBackend),
  // Null while Cold Storage Mode is on: the password is off the server and the
  // user supplies it at each start.
  walletPassword: z.string().nullable().catch(null),
  aezeedCipherSeed: z.array(z.string()).nullable().catch(null),
  watchtowerClients: z.array(z.string()).catch([]),
  customExternalHosts: z.array(z.string()).catch([]),
  // The kind of address the watchtower server was given (Tor, a public
  // domain, a public IPv4 address, or the LAN); init/watchHosts.ts keeps
  // watchtower.externalip on the current address of that kind. Null for a
  // tower set up before this was recorded, whose address is then left alone.
  watchtowerAddressKind: z
    .enum(['tor', 'domain', 'ipv4', 'lan'])
    .nullable()
    .catch(null),
})

export const storeJson = FileHelper.json(
  {
    base: sdk.volumes.main,
    subpath: '/store.json',
  },
  shape,
)
