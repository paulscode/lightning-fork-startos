import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'
import { channelBackupJson } from '../fileModels/channel-backup.json'
import { nextcloudDavUrl } from '../utils'

export const current = VersionInfo.of({
  version: '0.21.4-beta.21.1:6',
  releaseNotes: {
    en_US: `Security: Lightning Fork's nodes now listen on plain TCP instead of Multipath TCP. A serious Linux kernel bug, CVE-2026-98432, has a published attack that takes over a server through a Multipath TCP listener, and Go programs such as LND listen that way by default. This closes that route. It does not fix the kernel bug, which needs a StartOS update with a patched kernel; until then, if your node accepts peer connections from the internet rather than only through Tor, consider turning that off. Nothing else changes.

From 0.21.4-beta.21.1:5, if you are updating from an earlier version: troubleshooting for the bridge's SHA256 node: SHA256 Node Logging (Actions, Bridge) turns on detailed logging for that node only, and Capture SHA256 Node State then writes what it is doing into the logs, for when the bridge reports that the node does not answer. Download the logs from the Logs page, then set the logging back to Normal. Nothing else changes.

From 0.21.4-beta.21.1:3, if you are updating from an earlier version: a fix for the bridge's SHA256 node: after the SHA256 Bitcoin node restarted (an update, a reboot), the SHA256 node kept the Bitcoin node's old RPC credentials and every call failed with status 401, so the bridge stopped until Lightning Fork was restarted. It now restarts the SHA256 node by itself when the Bitcoin node's credentials change, without restarting Lightning Fork.

From 0.21.4-beta.21.1:1, if you are updating from an earlier version: for apps that connect to Lightning Fork, a copy of its TLS certificate, alone in a folder of its own, that other StartOS packages can read without seeing the macaroons or the wallet beside it. The same daemon as 0.21.4-beta.21.1:0.

From 0.21.4-beta.21.1:0, if you are updating from an earlier version: Lightning Fork is built with Go 1.27.3, which stops trusting a set of compromised certificate authority intermediates (CVE-2026-111943). Earlier builds still trusted them for the node's outbound HTTPS: fee estimates from a fee URL and, if you run the bridge, its price sources. Nothing else changes.

From 0.21.4-beta.21:0, if you are updating from an earlier version: pay short-lived SHA256 invoices through a bridge. Shops often issue invoices that live about a minute; the bridge refused anything with less than 15 minutes left and now quotes an invoice while it has at least 20 seconds. The phone app (0.2.3) gets a firm price as soon as an invoice is scanned, shows its countdown, and pays in one tap. Both the bridge and the paying node need this version. If a payout can't arrive in time, the payer is refunded within seconds.

Channel backups: a warning before Google ends a Drive sign-in (a Google Cloud app still in Testing ends it after 7 days), a refused sign-in explained with the sign-in link offered again, and a failing backup target no longer keeps LND showing as starting for 5 minutes after a restart.

Also: LND on SQLite could hang for every caller when two invoice subscriptions resumed at once; fixed. Bridge hold invoices carry the destination invoice's payment metadata.

From 0.21.4-beta.20:0, if you are updating from an earlier version: a hardened bridge after a private security review by cguida (thank you), bridge pricing from two exchanges, and no bridge outage after a difficulty retarget. From 0.21.4-beta.19:0: resize channels without closing them, off until you turn on Resize Channels in Actions, Channel Settings; turning it on upgrades the channel database, and StartOS then refuses to install an older Lightning Fork over this one.

Lightning Fork 0.21.4-beta-blake2b.21.1, dashboard 1.3.2-blake2b.21.`,
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
