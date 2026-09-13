import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:2',
  releaseNotes: {
    en_US: `A dashboard. The Umbrel Lightning app's web UI, forked for this chain (github.com/paulscode/umbrel-lightning-fork), now ships with the package as the Dashboard interface: on-chain and Lightning wallets with send and receive, channels with open and close, transaction history, node status and sync. The browser asks for the password from the new Dashboard Password action (any username); the password is generated at install and can be changed there without a restart.

The dashboard runs in a StartOS mode that leaves to StartOS what StartOS does: wallet setup, LND configuration, channel backups and connection strings are not in it. Fiat amounts are priced for this chain, from BTCB2's own market at neoxa.exchange with other currencies converted through Coingecko's rate table, as Sparrow BLAKE2b does it; while a feed is unreachable the dashboard shows sats or BTC instead.

The node itself is unchanged from 0.21.3-beta:1 (Lightning Fork 0.21.3-beta-blake2b.5). A second volume, dashboard, holds the dashboard's settings and password; it is included in StartOS backups.`,
  },
  migrations: {
    up: async () => {},
  },
})
