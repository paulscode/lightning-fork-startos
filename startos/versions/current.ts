import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'
import { channelBackupJson } from '../fileModels/channel-backup.json'
import { nextcloudDavUrl } from '../utils'

export const current = VersionInfo.of({
  version: '0.21.4-beta.19:0',
  releaseNotes: {
    en_US: `Resize channels without closing them. A channel's details in the Dashboard have Add funds (from your on-chain wallet) and Move funds out (to your wallet or an address). The channel keeps working while the change confirms and costs one on-chain transaction. This is splicing, and it is off until you turn on Resize Channels in Actions, Channel Settings.

Before you turn it on: it upgrades the node's channel database at the next start, and after that the service can't go back to an older version of Lightning Fork. Because the package can't tell whether that happened, from this version StartOS refuses to install an older Lightning Fork over this one. Both nodes of a channel need splicing (Lightning Fork from this version, or the Core Lightning port), and only channels with chain-bound signatures can be resized.

A resize counts once both nodes have seen six confirmations; one your peer puts coins into waits longer, up to 36, the more it puts in. Until then the channel works at its old size. If your peer adds its own coins, your node won't let the peer spend them through the channel until the resize has 36 confirmations, so a peer that undoes its deposit by reorganising the chain can't take your funds with it. Moving funds out: the amount you enter is what arrives, and the fee comes from your side of the channel. Channel backups made after a resize carry the new funding output.

Also: pairing a phone asks for the Dashboard password first, the Dashboard says so when LND can't follow a channel's funding output, and a node on a pruned Knots can fetch the blocks it pruned from peers again (it refused them and banned the peer that sent them).

From 0.21.4-beta.18:0, if you are updating from an earlier version: built on LND 0.21.4. Every new channel carries chain-bound signatures, and a peer that has not upgraded gets no new channel; no new taproot or legacy channels. Apps can get their own macaroon from the Dashboard's menu. A new Dashboard password also unpairs every phone. Importing a wallet from Start9's LND package, or restoring a backup from before SQLite, works again.

Lightning Fork 0.21.4-beta-blake2b.19, dashboard 1.3.2-blake2b.19.`,
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
