import { VersionInfo } from '@start9labs/start-sdk'
import { channelBackupJson } from '../fileModels/channel-backup.json'
import { nextcloudDavUrl } from '../utils'

export const current = VersionInfo.of({
  version: '0.21.3-beta.13:0',
  releaseNotes: {
    en_US: `From this release the version shown here matches the daemon's: this is Lightning Fork 0.21.3-beta-blake2b.13, "beta 13". The previous package, labelled 0.21.3-beta:9, carried beta 12.

Coins from mining now wait for the chain's relay rule. A coinbase output paid to this node's wallet, for example by a mining pool, is spendable once a spend of it will relay: 6480 confirmations, roughly 45 days, while the long coinbase maturity rule is deployed. Until then the wallet no longer offers it, so a send or channel open is refused up front instead of failing at broadcast, and it is not counted in the wallet's balance: the dashboard shows it under the Bitcoin balance as coins from mining, maturing. If you received coinbase outputs in the last 45 days, your balance drops by that amount on this update and returns as each output matures. Nothing is lost. The advice in earlier notes to keep freshly mined coins out of this wallet no longer applies.

The dashboard's Mempool app choice now checks which chain each app follows, by the hash of block 961640. An app connected to a node on the other chain is shown as such and not used, and its fee rates and links are replaced by the node's own estimate and mempool.guide. The installed Mempool package is shown under its own name, Mempool or Mempool Guide.

Channel details show whether a channel's signatures are bound to this chain, and a Connect To line with the peer's key@host:port and a copy button, for opening a channel back to it. A node holding a chain-bound channel must not go back to a version before 0.21.3-beta-blake2b.10.

Also: a channel funded by a coinbase is no longer given up on by the receiving side after a restart while it matures, and this node no longer asks upgraded Core Lightning peers for the stale Bitcoin channels some of them still hold.

Updating from 0.21.3-beta:7 or earlier? That crosses the coordinated feature-bit change, whose notes still apply: channels carry over, the conversion cannot be undone, a channel stays inactive until its peer has updated too, and invoices and offers created before it can no longer be paid.

Lightning Fork 0.21.3-beta-blake2b.13, dashboard 1.3.2-blake2b.12.`,
  },
  migrations: {
    // Completes a saved Nextcloud address to the /remote.php/dav/files/USER
    // form rclone requires, as Start9's LND package does in its :4
    // migration. Idempotent: a complete address comes back unchanged and
    // is not written.
    up: async ({ effects }) => {
      const nextcloud = (await channelBackupJson.read().once())?.nextcloud
      if (!nextcloud?.url) return
      let url: string
      try {
        url = nextcloudDavUrl(nextcloud.url, nextcloud.user)
      } catch {
        return
      }
      if (url !== nextcloud.url)
        await channelBackupJson.merge(effects, {
          nextcloud: { ...nextcloud, url },
        })
    },
  },
})
