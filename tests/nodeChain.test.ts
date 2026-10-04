// Which chain each installed node package follows, from its version.
//   npx tsx --test tests/nodeChain.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chainOfVersion } from '../startos/nodeChain'

test('the companions follow one chain whatever their version', () => {
  assert.equal(chainOfVersion('knots-blake2b', '1.0.0:34'), 'blake2b')
  assert.equal(chainOfVersion('knots-blake2b', null), 'blake2b')
  assert.equal(
    chainOfVersion('knots-prerdts', '#knotsprerdts:29.3:31'),
    'sha256',
  )
})

test('bitcoind is told apart by its flavor and version', () => {
  // Bitcoin Core, unflavored.
  assert.equal(chainOfVersion('bitcoind', '31.1:17'), 'sha256')
  assert.equal(chainOfVersion('bitcoind', '28.1:3'), 'sha256')
  // The Knots builds for the SHA256 chain.
  assert.equal(chainOfVersion('bitcoind', '#knotssha:31.1:0'), 'sha256')
  assert.equal(chainOfVersion('bitcoind', '#knotsprerdts:29.3:27'), 'sha256')
  // Bitcoin Knots: before 29.4 the one chain there was; from 29.4.1 BLAKE2b.
  assert.equal(chainOfVersion('bitcoind', '#knots:29.3:5'), 'sha256')
  assert.equal(chainOfVersion('bitcoind', '#knots:29.4.1:7'), 'blake2b')
  assert.equal(chainOfVersion('bitcoind', '#knots:29.4.2:1'), 'blake2b')
  assert.equal(chainOfVersion('bitcoind', '#knots:30.0:1'), 'blake2b')
  // 29.4, the RDTS build, follows neither: not guessed.
  assert.equal(chainOfVersion('bitcoind', '#knots:29.4:11'), 'unknown')
})

test('what cannot be read is not guessed', () => {
  assert.equal(chainOfVersion('bitcoind', null), 'unknown')
  assert.equal(chainOfVersion('bitcoind', '#someoneelse:31.0:1'), 'unknown')
  assert.equal(chainOfVersion('bitcoind', 'garbage'), 'unknown')
})

import { suggestNode, chainOfVersion as c } from '../startos/nodeChain'

const lfIds = ['bitcoind', 'knots-blake2b'] as const
const shaIds = ['knots-prerdts', 'bitcoind'] as const
const seen = (versions: Record<string, string | null>) =>
  Object.fromEntries(
    Object.entries(versions).map(([id, v]) => [
      id,
      { installed: true, chain: c(id as any, v) },
    ]),
  )

test('setup 1: Knots on the SHA256 chain, the BLAKE2b Companion', () => {
  for (const main of [
    '#knotsprerdts:29.3:27',
    '#knotssha:31.1:0',
    '31.1:17',
    '#knots:29.3:5',
  ]) {
    const s = seen({ bitcoind: main, 'knots-blake2b': '1.0.0:34' })
    // A fresh install defaults to bitcoind; the BLAKE2b one is suggested.
    const lf = suggestNode(lfIds, s, 'blake2b', 'bitcoind')
    assert.equal(lf, 'knots-blake2b', main)
    assert.equal(suggestNode(shaIds, s, 'sha256', null, lf), 'bitcoind', main)
  }
})

test('setup 2: Knots on the BLAKE2b chain, the SHA256 Companion', () => {
  const s = seen({
    bitcoind: '#knots:29.4.1:7',
    'knots-prerdts': '#knotsprerdts:29.3:31',
  })
  const lf = suggestNode(lfIds, s, 'blake2b', 'bitcoind')
  assert.equal(lf, 'bitcoind')
  assert.equal(suggestNode(shaIds, s, 'sha256', null, lf), 'knots-prerdts')
})

test('setup 3: both companions', () => {
  const s = seen({
    'knots-blake2b': '1.0.0:34',
    'knots-prerdts': '#knotsprerdts:29.3:31',
  })
  const lf = suggestNode(lfIds, s, 'blake2b', 'bitcoind')
  assert.equal(lf, 'knots-blake2b')
  assert.equal(suggestNode(shaIds, s, 'sha256', null, lf), 'knots-prerdts')
})

test('a choice that still fits is kept; one that does not is not', () => {
  const s = seen({ bitcoind: '#knots:29.4.1:7', 'knots-blake2b': '1.0.0:34' })
  assert.equal(
    suggestNode(lfIds, s, 'blake2b', 'knots-blake2b'),
    'knots-blake2b',
  )
  const t = seen({ bitcoind: '31.1:17', 'knots-blake2b': '1.0.0:34' })
  assert.equal(suggestNode(lfIds, t, 'blake2b', 'bitcoind'), 'knots-blake2b')
})

test("the other side's node is never suggested, even as the only one", () => {
  const s = seen({ bitcoind: '#knotsprerdts:29.3:27' })
  // Lightning Fork wrongly on bitcoind: the SHA256 choice is the companion,
  // not installed yet, rather than the node Lightning Fork reads.
  assert.equal(
    suggestNode(shaIds, s, 'sha256', null, 'bitcoind'),
    'knots-prerdts',
  )
})

test('nothing installed: what was chosen, else the first', () => {
  assert.equal(
    suggestNode(lfIds, {}, 'blake2b', 'knots-blake2b'),
    'knots-blake2b',
  )
  assert.equal(suggestNode(lfIds, {}, 'blake2b', null), 'bitcoind')
  // An unknown chain beats nothing.
  const s = seen({ bitcoind: '#knots:29.4:11' })
  assert.equal(suggestNode(lfIds, s, 'blake2b', 'knots-blake2b'), 'bitcoind')
})
