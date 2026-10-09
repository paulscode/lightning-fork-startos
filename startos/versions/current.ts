import { VersionInfo } from '@start9labs/start-sdk'
import { channelBackupJson } from '../fileModels/channel-backup.json'
import { nextcloudDavUrl } from '../utils'

export const current = VersionInfo.of({
  version: '0.21.4-beta.18:0',
  releaseNotes: {
    en_US: `Built on LND 0.21.4. It fixes HTLCs that could be left pending while a channel changed state (and end in a needless force close), keeps a peer from flooding a channel with fee updates or other messages, and fixes breach handling for old channel states.

New channels are bound to this chain. Every new channel now carries chain-bound signatures (option_unified_sigs), as the BLAKE2b Lightning spec requires: a peer that has not upgraded can still connect and route over the channels you already have, but gets no new channel. New taproot channels can't be opened any more (the Taproot settings say so), and LND no longer opens old-style (legacy) channels at all; channels you already have keep working. A channel funded directly from a block reward is refused.

Macaroons: in the Dashboard's menu, give an app its own key to your node with only the access it needs (read only, receive payments, a Lightning wallet, or your own choice of permissions), with an optional expiry, and revoke it on its own. Making one asks for your Dashboard password again.

A new Dashboard password (Set Dashboard Password) now also unpairs every phone paired with the Android app: pair them again afterwards. The Dashboard refuses form posts from other sites and won't be framed, and its dependencies are up to date. Settings that would add lines to lnd.conf are refused.

The bridge: it no longer counts the blocks before LND gives up on a held payment, quotes only invoices its node would pay, refunds a payment that never left, and stops quoting at a 10% market move. Offers are rate limited per offer and can't fill the disk.

From 0.21.3-beta.15, if you are updating from an earlier version: paying SHA256 invoices through a service you trust (menu, Paying SHA256 invoices), running a bridge with its own SHA256 node, and a task that gives the Dashboard an onion address so the Android app works away from home.

Lightning Fork 0.21.4-beta-blake2b.18, dashboard 1.3.2-blake2b.18.`,
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
