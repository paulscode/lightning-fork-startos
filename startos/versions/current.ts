import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'
import { channelBackupJson } from '../fileModels/channel-backup.json'
import { nextcloudDavUrl } from '../utils'

export const current = VersionInfo.of({
  version: '0.21.4-beta.20:0',
  releaseNotes: {
    en_US: `A safer bridge. A private security review found a way for a payer who also controls the recipient to make a bridge lose a payout, and several smaller problems; all are fixed. If you run the bridge, update.

The bridge now refuses to quote an invoice again once an attempt to pay it was funded (the payer is told to ask for a new invoice), each expiring invoice cancels only itself, and before paying it checks for a route and waits while there is none. A swap stopped while paying can be decided with lncli bridge resolve. It keeps quoting through a difficulty retarget on either chain instead of stopping for about a day. Participants see a fixed sentence for each refusal and a rounded maximum.

Pricing reads two exchanges, Neoxa and NonKYC, from their order books at the largest swap size, and each direction trades at whichever is worse for its payer; a direction stops when they are more than 4% apart. Drift from the 24 hour median, a thin book or a stopped exchange widens the fee rather than stopping quotes. Quotes now hold for 60 seconds.

Paying SHA256 invoices through a service checks prices against both exchanges and allows what the service widened its fee by, up to 5%.

From 0.21.4-beta.19:0, if you are updating from an earlier version: resize channels without closing them (Add funds and Move funds out in a channel's details), off until you turn on Resize Channels in Actions, Channel Settings. Turning it on upgrades the channel database, and StartOS then refuses to install an older Lightning Fork over this one. Built on LND 0.21.4 (from 0.21.4-beta.18:0): every new channel carries chain-bound signatures.

Lightning Fork 0.21.4-beta-blake2b.20, dashboard 1.3.2-blake2b.20.`,
  },
  migrations: {
    // Resize Channels moves the channel database to a version older
    // daemons refuse to open, and the package can't tell whether it has
    // (UPDATING.md). Carry this into the next `current`.
    down: IMPOSSIBLE,
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
