import { VersionInfo } from '@start9labs/start-sdk'
import { channelBackupJson } from '../fileModels/channel-backup.json'
import { nextcloudDavUrl } from '../utils'

export const current = VersionInfo.of({
  version: '0.21.3-beta.16:0',
  releaseNotes: {
    en_US: `Offers on mainnet: paying a BOLT 12 offer from the dashboard or the Android app fetched the invoice and then failed with "This request is for a different network". Fixed; only the paying node needs this release.

The wallet cards fit every message: long descriptions show one or two lines with More, the explanations of offers open on request, and nothing is drawn over the buttons or an error any more.

Lightning Fork 0.21.3-beta-blake2b.16, dashboard 1.3.2-blake2b.16.`,
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
