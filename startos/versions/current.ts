import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:7',
  releaseNotes: {
    en_US: `Onion messages from any peer. A pool's invoice requests for your offers, and the replies to your own requests, come from nodes that have no channel with you; the node now takes them (lnd dropped them by default), with rate limits still in place, and answers a request it sent directly with a reply path that starts at itself. Found while testing against the Core Lightning port of this chain: as released, that port keeps Bitcoin's chain identity, so the two refuse each other; a patch series giving it this chain's identity, with which the two peer, open channels, pay each other's invoices and offers and close, is proposed to its maintainer.

Lightning Fork 0.21.3-beta-blake2b.9, dashboard 1.3.2-blake2b.11.`,
  },
  migrations: {
    up: async () => {},
  },
})
