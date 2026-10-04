// What the forms call each installed node.
//   npx tsx --test tests/nodes.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nodeLabel, nodeTitle, NodeState } from '../startos/nodes'

const state = (
  id: any,
  version: string | null,
  chain: any,
  installed = true,
): NodeState => ({ id, version, chain, installed })

test('bitcoind is named for what it is', () => {
  assert.equal(
    nodeTitle('Bitcoin Knots', state('bitcoind', '31.1:17', 'sha256')),
    'Bitcoin Core',
  )
  assert.equal(
    nodeTitle('Bitcoin Knots', state('bitcoind', '#knotssha:31.1:0', 'sha256')),
    'Bitcoin Knots SHA256',
  )
  assert.equal(
    nodeTitle('Bitcoin Knots', state('bitcoind', '#knots:29.4.1:7', 'blake2b')),
    'Bitcoin Knots',
  )
  assert.equal(
    nodeTitle('Bitcoin Knots', state('bitcoind', null, 'unknown', false)),
    'Bitcoin Knots',
  )
  assert.equal(
    nodeTitle(
      'Bitcoin Knots (SHA256) Companion',
      state('knots-prerdts', '#knotsprerdts:29.3:31', 'sha256'),
    ),
    'Bitcoin Knots (SHA256) Companion',
  )
})

test('each choice says what is known of it', () => {
  assert.equal(
    nodeLabel('Bitcoin Knots', state('bitcoind', '31.1:17', 'sha256')),
    'Bitcoin Core: installed, on the SHA256 chain',
  )
  assert.equal(
    nodeLabel('Bitcoin Knots', state('bitcoind', '#knots:29.4.1:7', 'blake2b')),
    'Bitcoin Knots: installed, on the BLAKE2b chain',
  )
  assert.equal(
    nodeLabel('Bitcoin Knots', state('bitcoind', '#knots:29.4:11', 'unknown')),
    'Bitcoin Knots: installed; its chain is checked when it starts',
  )
  assert.equal(
    nodeLabel(
      'Bitcoin Knots (BLAKE2b) Companion',
      state('knots-blake2b', null, 'unknown', false),
    ),
    'Bitcoin Knots (BLAKE2b) Companion: not installed',
  )
})
