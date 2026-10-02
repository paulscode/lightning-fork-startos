import { VersionInfo } from '@start9labs/start-sdk'
import { channelBackupJson } from '../fileModels/channel-backup.json'
import { nextcloudDavUrl } from '../utils'

export const current = VersionInfo.of({
  version: '0.21.3-beta.14:1',
  releaseNotes: {
    en_US: `Lightning Fork for Android, in testing with a small group first: pair a phone from the dashboard's menu (Mobile app) to see your on-chain and Lightning balances, and send and receive from it. At home the phone reaches the dashboard at its LAN address, pinned to this server's certificate; anywhere else over Tor, once the Dashboard interface has an onion address. Each phone gets a key of its own, listed under Mobile app, where removing it stops it at once.

Peers: the dashboard connects to another node without opening a channel, from its menu or the peer count, so that it can open one to you.

Watchtowers: a Watchtowers action shows which towers accepted this node (its sessions with each). Towers taken out of Watchtower Client Settings are removed from the node when it starts, rather than left in place. The watchtower server can be given a LAN or public address besides its onion, and the address it gives clients follows the interface when it changes.

Lightning Fork 0.21.3-beta-blake2b.14 (unchanged), dashboard 1.3.2-blake2b.14.`,
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
