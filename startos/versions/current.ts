import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:0',
  releaseNotes: {
    en_US: `First release of Lightning Fork, an LND fork that follows the Bitcoin BLAKE2b chain (Bitcoin Knots 29.4.1, activated at block 961640 on 2026-08-30).

It runs against Bitcoin Knots (29.4.1 or later) or the Bitcoin Knots (BLAKE2b) Companion, chosen under Select Node, and refuses to start against a node on the SHA256d chain: the Chain Identity health check says which chain the node is on and why it was refused. It advertises the BLAKE2b chain in every handshake, drops peers that do not, and uses the lnblake invoice prefix, so nothing here can connect to, pay, or be paid from the Bitcoin Lightning network by accident.

Based on LND 0.21.3-beta and the Start9 LND package. Wallet setup, channel backups, cold storage mode, Tor and the watchtower work as in that package. Migrating a wallet from another node is not offered: channels of a node on the SHA256d chain cannot be moved to this one.`,
  },
  migrations: {
    up: async () => {},
  },
})
