import { VersionInfo } from '@start9labs/start-sdk'
import { channelBackupJson } from '../fileModels/channel-backup.json'
import { nextcloudDavUrl } from '../utils'

export const current = VersionInfo.of({
  version: '0.21.3-beta.15:0',
  releaseNotes: {
    en_US: `Offers on mainnet: paying a BOLT 12 offer between two Lightning Fork nodes failed with "message names no chain". Fixed; both nodes need this release.

Paying SHA256 invoices: the dashboard pays Lightning invoices from the SHA256 chain through a service run by someone you trust, from the code they give you (menu, Paying SHA256 invoices). You pay the service with an invoice that carries the SHA256 invoice's own payment hash, so it is paid only if it pays yours, and its price is checked against the market before anything is paid. The Android app (0.2.0) pays them too.

Running such a service: the Bridge actions pair Lightning Fork with a stock LND on the SHA256 chain and make a code for each person you serve. Off unless you turn it on; see the instructions.

The mobile app away from home: this update offers a task that gives the Dashboard an onion address (SSL off), which the app needs away from your home network. The dashboard's Mobile app screen says whether it is set up.

Errors on the wallet cards stay in place and can be dismissed, and offer failures are explained in words.

Lightning Fork 0.21.3-beta-blake2b.15, dashboard 1.3.2-blake2b.15.`,
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
