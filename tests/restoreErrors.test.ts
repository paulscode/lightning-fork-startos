// Which restorechanbackup failures skip a channel.backup copy.
//   npx tsx --test tests/restoreErrors.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isUnusableCopy } from '../startos/restoreErrors'

const rpc = (cause: string) =>
  `[lncli] rpc error: code = Unknown desc = unable to unpack chan backup: ${cause}`

test('a copy LND cannot open is skipped', () => {
  // Another seed's: the key does not decrypt it.
  assert.ok(isUnusableCopy(rpc('chacha20poly1305: message authentication failed')))
  assert.ok(isUnusableCopy(rpc('unable to unpack unknown multi-version of 9')))
  assert.ok(isUnusableCopy(rpc('unexpected EOF')))
  // Too short to hold a nonce, or a channel of a version LND does not know.
  assert.ok(isUnusableCopy(rpc('payload size too small, must be at least 24 bytes')))
  assert.ok(isUnusableCopy(rpc('unable to de-serialize w/ unknown version: 9')))
  assert.ok(
    isUnusableCopy(
      '[lncli] rpc error: code = Unknown desc = unable to unpack single backups: unexpected EOF',
    ),
  )
})

test('a restore the node refused is not blamed on the copy', () => {
  // What every restore through the RPC said before 0.21.4-beta.21.2.
  assert.equal(
    isUnusableCopy(
      rpc(
        `channel backup names chain 6fe28c0a8a2aaa8bf8fea2e2b5a3ab8c4ac5e1d8bc73b9e5a4fcc2fbf1c7ae00, and this node follows the BLAKE2b chain, whose chain_hash is ${'0'.repeat(64)}; a channel from another chain cannot be restored here`,
      ),
    ),
    false,
  )
  assert.equal(
    isUnusableCopy(rpc('channel restorer has no chain hash to check backups against')),
    false,
  )
  assert.equal(isUnusableCopy(rpc('unable to restore channel: database is locked')), false)
  assert.equal(
    isUnusableCopy('[lncli] rpc error: code = Unknown desc = server is still in the process of starting'),
    false,
  )
  // A connection that broke mid-restore says unexpected EOF too, without
  // LND's prefix: the node's trouble, so the restore runs again.
  assert.equal(
    isUnusableCopy(
      '[lncli] rpc error: code = Unavailable desc = error reading from server: unexpected EOF',
    ),
    false,
  )
})
