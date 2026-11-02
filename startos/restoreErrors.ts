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
  // Without the prefix LND did not get as far as the copy: lncli could not
  // reach it, or the connection broke ("error reading from server:
  // unexpected EOF"). That is the node's trouble, never the copy's.
  const m = reason.match(/unable to unpack (chan backup|single backups): (.*)$/s)
  if (!m) return false
  return /unable to (decrypt|read nonce)|message authentication failed|unknown multi-version|unknown version|unexpected EOF|payload size too small/i.test(
    m[2],
  )
}
