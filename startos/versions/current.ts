import { VersionInfo } from '@start9labs/start-sdk'
import { channelBackupJson } from '../fileModels/channel-backup.json'
import { nextcloudDavUrl } from '../utils'

export const current = VersionInfo.of({
  version: '0.21.3-beta.17:0',
  releaseNotes: {
    en_US: `Run a bridge, with nothing new to set up. A bridge lets people pay invoices on the SHA256 chain's Lightning network with BTCB2 through your node, without trusting you. Lightning Fork can now run the bridge's SHA256 Lightning node for you: a stock LND whose seed is derived from your existing recovery phrase, so there is nothing new to write down. Turn it on with the Bridge action, then follow the dashboard's Bridge window: fund that node, open its channel (it recommends a well-connected peer and can open the largest channel your deposit allows), and invite participants. Running a bridge through an LND you already have still works.

The bridge prices from the market. It reads Neoxa's BTCB2_BTC market every 30 seconds (through Tor), checks it against BTCB2_USDC, and quotes nothing while the market can't be read, the two disagree, or the market jumps; just before paying it checks the price again. Set Bridge Rate is gone: there is no rate to keep current. Your Fee (Bridge action, 1.5% by default, optionally different for each direction) widens by itself when the market moves fast or your bridge runs low. If you set a fee before, check it: the old default was 1%.

Routes are checked before quoting, so a payer is never held for a payment the bridge can't make, and short routes ask a short hold of the payer. Give the bridge's node a channel to a well-connected node.

Pay SHA256 invoices from your own bridge: a node running a bridge pays them straight from the bridge's SHA256 node, with no swap and no fee.

Also: the bridge's node's channel backup is copied off the server to your targets too; other SHA256 nodes can open channels to it once its SHA256 Lightning Peer interface has an onion address; a bridge turned off finishes the payments under way first; bridge codes carry your node's name; health checks no longer leave stray processes behind. The download grows by the stock LND image (about 64 MB); none of it runs unless you turn the bridge on.

From 0.21.3-beta.15, if you are updating from an earlier version: paying SHA256 invoices through a service you trust (menu, Paying SHA256 invoices), and a task that gives the Dashboard an onion address so the Android app works away from home.

Lightning Fork 0.21.3-beta-blake2b.17, dashboard 1.3.2-blake2b.17.`,
  },
  migrations: {
    // Completes a saved Nextcloud address to the /remote.php/dav/files/USER
    // form rclone requires, as Start9's LND package does in its :4
    // migration. Idempotent: a complete address comes back unchanged and
    // is not written. Carry it into the next `current` (UPDATING.md): a
    // node that skips this release would never run it otherwise.
    //
    // Best effort: an unreadable configuration must not fail the update,
    // which the backup agent reports on its own.
    up: async ({ effects }) => {
      try {
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
      } catch (e) {
        console.warn('Could not complete the saved Nextcloud address', e)
      }
    },
  },
})
