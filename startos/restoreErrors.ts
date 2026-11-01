/**
 * Whether `lncli restorechanbackup` failed because of the channel.backup copy
 * itself, another seed's or damaged, rather than because of the node. The
 * restore skips such a copy and goes on; any other failure stops it, so the
 * staged copies stay and the restore runs again at the next start.
 *
 * LND's RestoreChannelBackups puts every failure behind the same words,
 * `unable to unpack chan backup: ` (or `unable to unpack single backups: `),
 * whether the file could not be read or a channel could not be restored, so
 * only what follows them is looked at. Matching the prefix itself once made
 * a refused restore look like a damaged copy, and the restore deleted the
 * copies and finished without restoring a channel.
 *
 * Imports nothing, so it can be tried outside the package.
 */
export function isUnusableCopy(reason: string): boolean {
  const cause = reason.replace(
    /^.*?unable to unpack (chan backup|single backups): /s,
    '',
  )
  return /unable to (decrypt|read nonce)|message authentication failed|unknown multi-version|unexpected EOF/i.test(
    cause,
  )
}
