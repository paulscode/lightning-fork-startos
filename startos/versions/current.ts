import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:6',
  releaseNotes: {
    en_US: `Dashboard improvements from first use. Balances, channels and transactions refresh on their own every ten seconds while the page is open. The node's alias is shown under the title with its color. Transaction fees for sending and for opening channels are chosen as Low, Medium or High: from a Mempool app you pick under the menu's Mempool app entry (Mempool or Mempool Pruned, the rates its own page shows), or from the node's own estimate. Channel details show the funding transaction, and the closing transaction while a channel closes, with a copy button and a link to the chosen Mempool app. A page whose session has ended goes back to the sign-in screen by itself.

Lightning Fork 0.21.3-beta-blake2b.8, dashboard 1.3.2-blake2b.11.`,
  },
  migrations: {
    up: async () => {},
  },
})
