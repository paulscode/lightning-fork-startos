import { startupFlagsJson } from './fileModels/startupFlags.json'
import { sdk } from './sdk'

export const { createBackup, restoreInit } = sdk.setupBackups(
  async ({ effects }) =>
    sdk.Backups.ofVolumes()
      // The copies main makes of tls.cert and admin.macaroon for the
      // dashboard are remade at every start; the main volume carries the
      // originals.
      .addVolume('dashboard', {
        options: {
          delete: true,
          // sha256/ holds the same copies of the bridge's SHA256 node's,
          // remade by that node's daemon.
          exclude: ['tls.cert', 'admin.macaroon', '/sha256'],
        },
      })
      .addVolume('main', {
        options: {
          delete: true,
          exclude: [
            // Holds nothing a restore needs — setPostRestore and seedFiles
            // recreate it with what restore requires, and needsSqliteMigration
            // decides from files on disk — while importPending can hold an
            // origin's password in cleartext, which must not ride into backups.
            'startup-flags.json',
            'data/graph',
            'data/chain/bitcoin/mainnet/channel.db',
            'data/chain/bitcoin/mainnet/sphinxreplay.db',
            'data/chain/bitcoin/mainnet/neutrino.db',
            'data/chain/bitcoin/mainnet/block_headers.bin',
            'data/chain/bitcoin/mainnet/reg_filter_headers.bin',
            // This run's verdict on the selected node; meaningless anywhere
            // else, and main deletes it at every start anyway.
            'data/chain/bitcoin/mainnet/chain-identity.json',
            'logs',
            '.channel-backup-state.json',
            '.channel-backup.lock',
            'channel.backup.startos-restore',
            'channel.backup.startos-restore.tmp',
            '.channel-backup-restore',
            'unlock-status.json',
            // The bridge's SHA256 node (sha256Node.ts) keeps its channel
            // backup and loses its wallet, macaroons and (with data/graph
            // above) its channel database: a channel database from the past
            // can broadcast an old state and lose that channel's funds. On a
            // restore Lightning Fork creates the wallet again from the
            // derived seed and hands it the channel backup, as lnd restores
            // any node from one. The bridge's own macaroon for it goes too,
            // and is baked again.
            '/sha256-node/data/chain/bitcoin/mainnet/wallet.db',
            '/sha256-node/data/chain/bitcoin/mainnet/macaroons.db',
            '/sha256-node/data/chain/bitcoin/mainnet/*.macaroon',
            '/data/chain/bitcoin/mainnet/bridge/sha256/bridge.macaroon',
            '/data/chain/bitcoin/mainnet/bridge/sha256/bridge.macaroon.perms',
          ],
        },
      })
      .setPostRestore(async (effects) => {
        // Drop any import the backup was carrying: its origin credentials are
        // stale, and re-running a copy against the origin is never what a
        // restore means — recovery goes through the SCB flow the restore flag
        // drives. Re-running Initialize Wallet is the way to migrate again.
        await startupFlagsJson.merge(effects, {
          restore: true,
          importPending: false,
        })
      }),
)
