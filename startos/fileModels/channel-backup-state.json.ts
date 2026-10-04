import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

export const backupFailureShape = z.object({
  target: z.string(),
  code: z.string(),
  detail: z.string().catch(''),
})

export type BackupFailure = z.infer<typeof backupFailureShape>

const channelBackupStateShape = z.object({
  attempt: z.number().int().nonnegative().catch(0),
  lastSuccess: z.number().nullable().catch(null),
  failures: z.array(backupFailureShape).catch([]),
})

export const channelBackupStateJson = FileHelper.json(
  { base: sdk.volumes.main, subpath: '/.channel-backup-state.json' },
  channelBackupStateShape,
)

// The same, for the bridge's SHA256 node: a second agent copies its
// channel.backup to the same targets, into that node's own folder.
export const sha256ChannelBackupStateJson = FileHelper.json(
  { base: sdk.volumes.main, subpath: '/.channel-backup-sha256-state.json' },
  channelBackupStateShape,
)
