import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'
import { channelBackupJson } from '../fileModels/channel-backup.json'
import { nextcloudDavUrl } from '../utils'

export const current = VersionInfo.of({
  version: '0.21.4-beta.21.1:2',
  releaseNotes: {
    en_US: `Apps that connect to Lightning Fork can ask for access to it: you see what an app asks for in plain words and the app it is for, you approve exactly what each gets, and you can revoke it per app (Actions, App Access). Moving on-chain funds, opening or closing channels and making credentials are never granted to an app. Revoke Macaroons now also removes what apps were granted. The same daemon as 0.21.4-beta.21.1:0.

From 0.21.4-beta.21.1:1, if you are updating from an earlier version: a copy of Lightning Fork's TLS certificate, alone in a folder of its own, that other StartOS packages can read without seeing the macaroons or the wallet beside it.

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
