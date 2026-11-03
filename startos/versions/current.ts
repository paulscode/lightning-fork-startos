import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'
import { channelBackupJson } from '../fileModels/channel-backup.json'
import { nextcloudDavUrl } from '../utils'

export const current = VersionInfo.of({
  version: '0.21.6-beta.23:0',
  releaseNotes: {
    en_US: `- If a Bitcoin node this service uses fails to update, StartOS puts the node's data back by swapping folders, and Lightning Fork kept reading the old copy: LND, or the bridge's SHA256 node, kept the node's old RPC credentials and every call to it failed. Lightning Fork now restarts itself when its own Bitcoin node starts again and the node's new credentials have not reached it 30 seconds after the node is ready, and the bridge's SHA256 node is set up again each time its SHA256 Bitcoin node starts and is ready.
- With a pruned Bitcoin Knots BLAKE2b node, blocks it has pruned are fetched only from peers that advertise the BLAKE2b service bit, which Bitcoin Knots 29.4.3 requires before it serves blocks past the fork.
- The bridge: a swap whose hold invoice the node deleted (with the gc-canceled-invoices options on) now ends instead of retrying forever, once the bridge has checked it is reading the node that issued the invoice; on any other node it stops and is listed as needing the operator. A swap already stuck this way ends after the update.
- Needs StartOS 0.4.0.2 or newer, as since 0.21.4-beta.19:0.

From 0.21.6-beta.22:0, if you are updating from an earlier version: Lightning Fork on LND 0.21.6.

- Resize Channels: after an aborted resize attempt, the channel's reserves now change at the next connection, as the spec says. If your channel's peer runs Lightning Fork 0.21.4-beta.19 to .21.3, upgrade both, or reconnect after each resize locks: otherwise a later aborted attempt can leave the two sides disagreeing about reserves until they reconnect, which at worst force closes the channel.
- LND no longer proposes or accepts a commitment fee rate below 253 sat/kw. A node on an older release with a maximum commitment fee rate of 1 sat/vB cannot open a channel to yours until it raises that setting or upgrades.
- The bridge copes with a SHA256 node slow to answer, which a busy or pruned SHA256 Bitcoin node causes: it says the node is slow and why, waits up to 5 minutes before calling it unreachable, and no longer reports a slow wallet unlock as a wrong password. Quotes whose payout has no usable route are refused instead of funded and refunded.
- LND shows as running while it is slow to answer, instead of restarting the dashboard, the channel backup agent and the other services that depend on it (from Start9's LND package).
- BOLT 12: a paid invoice is kept as the payment's request. If you go back to an earlier version, BOLT 12 payments made on this one no longer show in the payment list, though they stay in the database.
- Dashboard 1.3.2-blake2b.22: whole numbers where LND reads whole numbers, the watchtower sweep fee rate, no trust in the certificate roots behind the compromised eMudhra keys, and the coinbase maturity of Bitcoin Knots 29.4.3 in the wallet.

From 0.21.4-beta.21.3:0, if you are updating from an earlier version: coinbase maturity under Bitcoin Knots 29.4.3: bitcoins mined in block 979919 or later need 25920 confirmations (about 180 days) before a spend of them is accepted, until RDTS expires in September 2027, while bitcoins mined before keep 6480 (about 45 days). The wallet now offers and counts each mined output by the rule its block falls under, and a channel funded by your own mined output waits as long. Earlier versions would have offered an output from block 979919 after 6480 confirmations, which upgraded nodes refuse to relay; that could first happen at block 986399, so nothing has gone wrong yet. This only concerns a wallet paid directly by mining. Nothing else changes.

From 0.21.4-beta.21.2:0, if you are updating from an earlier version: Fixes:

- Restoring channels from a channel backup works. In every earlier release LND refused every restore through its RPC as a backup from another chain: Recover channels in the dashboard, and the restore that runs after you recover this service from a StartOS backup. That one then took the refusal for a damaged copy, logged that it skipped it, and finished without restoring any channel. If you recovered this service from a StartOS backup before this version, its channels were not restored, though copies of the channel backup remain on the node and on your backup targets: do not recover the service again (channels opened since would be lost), and open an issue at github.com/paulscode/lightning-fork-startos so we can restore them with you. Restoring when you create the wallet was not affected.
- Apps that follow channel events (SubscribeChannelEvents) no longer have their stream cut with "internal server error" at the first payment on a channel, which started in 0.21.4-beta.19.
- The bridge's SHA256 node no longer stops answering while it learns the SHA256 Lightning network. It checked every public channel against the SHA256 Bitcoin node one block at a time, which on a pruned node took hours, and the bridge timed out waiting. It now takes channel announcements as given, as phone wallets do, so a payment may occasionally try a channel that has since closed and then route around it. Its own channels are watched on chain as before.
- The SHA256 node runs LND 0.21.6, which turns off Multipath TCP listeners itself (CVE-2026-98432), as Lightning Fork's own LND now does too.

From 0.21.4-beta.21.1:6, if you are updating from an earlier version: Security: Lightning Fork's nodes now listen on plain TCP instead of Multipath TCP. A serious Linux kernel bug, CVE-2026-98432, has a published attack that takes over a server through a Multipath TCP listener, and Go programs such as LND listen that way by default. This closes that route. It does not fix the kernel bug, which needs a StartOS update with a patched kernel; until then, if your node accepts peer connections from the internet rather than only through Tor, consider turning that off. Nothing else changes.

From 0.21.4-beta.21.1:5, if you are updating from an earlier version: troubleshooting for the bridge's SHA256 node: SHA256 Node Logging (Actions, Bridge) turns on detailed logging for that node only, and Capture SHA256 Node State then writes what it is doing into the logs, for when the bridge reports that the node does not answer. Download the logs from the Logs page, then set the logging back to Normal. Nothing else changes.

From 0.21.4-beta.21.1:3, if you are updating from an earlier version: a fix for the bridge's SHA256 node: after the SHA256 Bitcoin node restarted (an update, a reboot), the SHA256 node kept the Bitcoin node's old RPC credentials and every call failed with status 401, so the bridge stopped until Lightning Fork was restarted. It now restarts the SHA256 node by itself when the Bitcoin node's credentials change, without restarting Lightning Fork.

From 0.21.4-beta.21.1:1, if you are updating from an earlier version: for apps that connect to Lightning Fork, a copy of its TLS certificate, alone in a folder of its own, that other StartOS packages can read without seeing the macaroons or the wallet beside it. The same daemon as 0.21.4-beta.21.1:0.

From 0.21.4-beta.21.1:0, if you are updating from an earlier version: Lightning Fork is built with Go 1.27.3, which stops trusting a set of compromised certificate authority intermediates (CVE-2026-111943). Earlier builds still trusted them for the node's outbound HTTPS: fee estimates from a fee URL and, if you run the bridge, its price sources. Nothing else changes.

From 0.21.4-beta.21:0, if you are updating from an earlier version: pay short-lived SHA256 invoices through a bridge. Shops often issue invoices that live about a minute; the bridge refused anything with less than 15 minutes left and now quotes an invoice while it has at least 20 seconds. The phone app (0.2.3) gets a firm price as soon as an invoice is scanned, shows its countdown, and pays in one tap. Both the bridge and the paying node need this version. If a payout can't arrive in time, the payer is refunded within seconds.

Channel backups: a warning before Google ends a Drive sign-in (a Google Cloud app still in Testing ends it after 7 days), a refused sign-in explained with the sign-in link offered again, and a failing backup target no longer keeps LND showing as starting for 5 minutes after a restart.

Also: LND on SQLite could hang for every caller when two invoice subscriptions resumed at once; fixed. Bridge hold invoices carry the destination invoice's payment metadata.

From 0.21.4-beta.20:0, if you are updating from an earlier version: a hardened bridge after a private security review by cguida (thank you), bridge pricing from two exchanges, and no bridge outage after a difficulty retarget. From 0.21.4-beta.19:0: resize channels without closing them, off until you turn on Resize Channels in Actions, Channel Settings; turning it on upgrades the channel database, and StartOS then refuses to install an older Lightning Fork over this one.

Lightning Fork 0.21.6-beta-blake2b.23, dashboard 1.3.2-blake2b.22.`,
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
