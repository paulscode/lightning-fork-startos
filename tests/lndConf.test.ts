// What is written to lnd.conf: one line per value, never more.
//   npx tsx --test tests/lndConf.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toLndConf } from '../startos/fileModels/lnd.conf'

test('values are written one per line', () => {
  assert.equal(
    toLndConf({
      alias: 'my node = fine',
      externalip: ['1.2.3.4', '5.6.7.8'],
    } as any),
    'alias=my node = fine\nexternalip=1.2.3.4\nexternalip=5.6.7.8\n',
  )
})

test('a line break or control character is refused', () => {
  for (const conf of [
    { alias: 'node\nbitcoind.rpchost=203.0.113.1' },
    { alias: 'node\r' },
    { externalip: ['1.2.3.4', '5.6.7.8\nrpclisten=0.0.0.0:10009'] },
    { 'a=b': 'c' },
  ]) {
    assert.throws(
      () => toLndConf(conf as any),
      /refusing/,
      JSON.stringify(conf),
    )
  }
})

test('what an existing lnd.conf holds is written back as it was read', () => {
  assert.equal(
    toLndConf({ alias: 'my\tnode', '; a comment': '', 'odd key': 1 } as any),
    'alias=my\tnode\n; a comment=\nodd key=1\n',
  )
})

test('Resize Channels reads and writes protocol.splice, unset by default', async () => {
  const { fileToForm, formToFile } =
    await import('../startos/fileModels/lnd.conf')
  assert.equal(formToFile({ splice: true } as any)['protocol.splice'], true)
  assert.equal(formToFile({ splice: false } as any)['protocol.splice'], false)
  // Not set: lnd's default (off), nothing written.
  assert.equal(
    formToFile({ splice: null } as any)['protocol.splice'],
    undefined,
  )
  assert.equal('protocol.splice' in formToFile({ alias: 'x' } as any), false)
  // The schema fills the rest of a conf read from disk.
  const read = { 'caches.rpc-graph-cache-duration': '5m' }
  assert.equal(
    fileToForm({ ...read, 'protocol.splice': true } as any).splice,
    true,
  )
  assert.equal(fileToForm(read as any).splice, undefined)
  assert.equal(
    toLndConf({ 'protocol.splice': true } as any),
    'protocol.splice=true\n',
  )
})
