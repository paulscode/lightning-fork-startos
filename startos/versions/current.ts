import { VersionInfo } from '@start9labs/start-sdk'
import { channelBackupJson } from '../fileModels/channel-backup.json'
import { nextcloudDavUrl } from '../utils'

export const current = VersionInfo.of({
  version: '0.21.3-beta.14:0',
  releaseNotes: {
    en_US: `Watchtowers now check which chain they serve. A tower and its client used to recognise each other only by a value this chain shares with Bitcoin nodes that have not upgraded, so a client could hold sessions with a stock tower that watched the wrong chain and would never act on a breach here. From this release every tower and client of Lightning Fork says it follows the BLAKE2b rules, and refuses one that does not. If you use a watchtower, update the node running it too: a client on this release cannot use a tower on an earlier one, and shows no sessions with it until it is updated.

Public channels opened before 17 September are announced again. Their announcements were signed in a form only Lightning Fork can check, so Core Lightning nodes never learned them and answered with warnings. They are no longer passed on in that form; instead, once both ends of such a channel run this release, the two sign it again and it is announced to everyone. Nothing to do but update, and ask the peer on the other end to update too.

A channel is only opened with a peer that says it follows the BLAKE2b rules, in either direction. Such a peer stays connected, but an open to or from it is refused with "peer does not set option_blake2b". Every Lightning Fork release and privkeyio's Core Lightning say so; this only affects clients that connect for other purposes.

Also from the specification Lightning Fork shares with privkeyio's Core Lightning, merged on 29 September: stricter checks on the channel type a peer answers with, and on gossip about channels funded before block 961640.

Package: Cold Storage has a single Turn On / Turn Off action. Unlocking a large wallet on slow hardware, or during a restore, is no longer cut off after 30 seconds. If Bitcoin stops handing blocks to LND, Network and Graph Sync Progress says "Bitcoin is not serving blocks to LND" with the error, and you are notified if it lasts. Channel backups now keep each node's copy in a folder of its own inside the folder you named, so several nodes can share one account without overwriting each other; a restore still finds a copy an earlier release made directly in that folder. Nextcloud targets take the address you open Nextcloud at, and a saved address is completed to the form the backup tool needs. The SFTP folder path says which directory it is relative to.

Updating from 0.21.3-beta:7 or earlier? That crosses the coordinated feature-bit change, whose notes still apply: channels carry over, the conversion cannot be undone, a channel stays inactive until its peer has updated too, and invoices and offers created before it can no longer be paid.

Lightning Fork 0.21.3-beta-blake2b.14, dashboard 1.3.2-blake2b.13.`,
  },
  migrations: {
    // Completes a saved Nextcloud address to the /remote.php/dav/files/USER
    // form rclone requires, as Start9's LND package does in its :4
    // migration. Idempotent: a complete address comes back unchanged and
    // is not written. Carry it into the next `current` (UPDATING.md): a
    // node that skips this release would never run it otherwise.
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
