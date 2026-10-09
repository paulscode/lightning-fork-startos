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
    { 'a b': 'c' },
  ]) {
    assert.throws(
      () => toLndConf(conf as any),
      /refusing/,
      JSON.stringify(conf),
    )
  }
})
