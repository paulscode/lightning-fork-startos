import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:4',
  releaseNotes: {
    en_US: `BOLT 12 offers, native to the node. Mint an offer with lncli offer create and hand the lno1... string to a pool that pays to offers, the way OCEAN does; the node answers the pool's invoice requests over onion messages and is paid to an ordinary invoice with blinded paths. The same offer comes back after a restore from seed, and a request for an offer the node lost is still served. The node can also fetch and pay other nodes' offers (lncli offer fetchinvoice, lncli offer pay), including through a peer it is the introduction node of. Offers, requests and invoices decode as valid in an unmodified Core Lightning.

Lightning Fork 0.21.3-beta-blake2b.6. The dashboard is unchanged.`,
  },
  migrations: {
    up: async () => {},
  },
})
