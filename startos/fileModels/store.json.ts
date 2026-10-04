import { FileHelper, z } from '@start9labs/start-sdk'
import {
  BackendId,
  backendIds,
  defaultBackend,
  sha256BackendIds,
} from '../backends'
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
  // Whether the package has asked once for an onion on the Dashboard
  // (init/taskDashboardOnion.ts), so a dismissed request is not raised again.
  dashboardOnionAsked: z.boolean().catch(false),
  // The SHA256 node the bridge dials, kept while the bridge is off so that
  // turning it back on needs no new connection string (the certificate and
  // macaroon stay in data/bridge).
  bridgeSha256RpcHost: z.string().nullable().catch(null),
  // Whose LND the bridge pays through on the SHA256 chain: one Lightning
  // Fork runs for it (supervised, the default), or one the operator already
  // ran (external, through bridgeSha256RpcHost). Null until the bridge is
  // first configured.
  bridgeMode: z.enum(['supervised', 'external']).nullable().catch(null),
  // For a supervised node, the SHA256 Bitcoin node it reads.
  bridgeSha256Backend: z
    .enum(sha256BackendIds as unknown as [string, ...string[]])
    .nullable()
    .catch(null),
  // The bridge codes issued, so that one can be revoked by its label. The
  // root key id is a uint64, kept as a string to keep every digit.
  bridgeParticipants: z
    .array(
      z.object({
        rootKeyId: z.string(),
        label: z.string(),
        createdAt: z.string(),
      }),
    )
    .catch([]),
})

export const storeJson = FileHelper.json(
  {
    base: sdk.volumes.main,
    subpath: '/store.json',
  },
  shape,
)
