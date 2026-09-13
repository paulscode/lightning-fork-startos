import {
  rpcHostId as btcRpcHostId,
  rpcPort as btcRpcPort,
  zmqHostId as btcZmqHostId,
  zmqPortBlock as btcZmqPortBlock,
  zmqPortTransaction as btcZmqPortTransaction,
} from 'bitcoin-core-startos/startos/utils'
import {
  rpcHostId as b2bRpcHostId,
  rpcPort as b2bRpcPort,
  zmqHostId as b2bZmqHostId,
  zmqPortBlock as b2bZmqPortBlock,
  zmqPortTransaction as b2bZmqPortTransaction,
} from 'knots-blake2b-startos/startos/utils'

/**
 * Where a backend's RPC and ZMQ endpoints live inside its own container, as
 * exported by that package's `startos/utils.ts`. Imported rather than written
 * out so a change upstream reaches this package as a type error.
 */
type Endpoints = {
  rpcHostId: string
  rpcPort: number
  zmqHostId: string
  zmqPortBlock: number
  zmqPortTransaction: number
}

/**
 * How the daemon learns of new blocks and transactions from a backend: ZMQ
 * when the node serves it, RPC polling when it does not. Both backends serve
 * it now (the companion from 1.0.0:34; before that its bitcoind was built
 * without libzmq and subscribing stopped the daemon with "connection
 * refused"); polling stays available for a backend that stops serving it.
 */
export type Notifications = 'zmq' | 'rpcpolling'

/**
 * The health checks a backend must be passing before Lightning Fork is
 * started against it. Written out because a health check id is not exported
 * by the package that declares it. StartOS treats an id the dependency does
 * not declare exactly like a failing check, and the warning cannot name it,
 * so these must match the dependency's `main.ts` precisely.
 *
 * The official package runs a daemon `bitcoind` with a `sync-progress` check
 * beside it. The companion runs a daemon `node` with a `chain` check that
 * fails while the node is below the BLAKE2b activation height; its own
 * `sync-progress` is deliberately not required on top, since `chain` already
 * answers the question that matters and a second check that stays amber
 * through IBD would only make the dependency look unsatisfied for longer.
 */
const officialHealthChecks = ['bitcoind', 'sync-progress'] as const
const companionHealthChecks = ['node', 'chain'] as const

/**
 * The Bitcoin nodes this package can run against.
 *
 * Both are declared as optional dependencies in the manifest and exactly one
 * is returned as required from `dependencies.ts`, chosen by the user through
 * the Select Node action. Either can be on the wrong chain (the official
 * package in its Core flavor, or in its Knots flavor below 29.4.1), which is
 * why the daemon itself checks the chain at start and the `chain-identity`
 * health check shows the outcome.
 */
export const backends = {
  bitcoind: {
    // Named for Knots rather than Core, a deliberate departure from the
    // packaging guide's "call a multi-flavor dependency Bitcoin": only the
    // Knots flavor, at 29.4.1 or later, follows the BLAKE2b chain.
    title: 'Bitcoin Knots',
    endpoints: {
      rpcHostId: btcRpcHostId,
      rpcPort: btcRpcPort,
      zmqHostId: btcZmqHostId,
      zmqPortBlock: btcZmqPortBlock,
      zmqPortTransaction: btcZmqPortTransaction,
    } satisfies Endpoints,
    healthChecks: officialHealthChecks,
    notifications: 'zmq' as Notifications,
    // Any version. A range cannot name a flavor (the SDK's parser rejects
    // `#knots:>=…`), and a flavored version such as `#knots:29.4.1:7` only
    // satisfies an unflavored range through the package's own `satisfies`
    // list, which the Knots build most BLAKE2b users run (from the
    // start9.mempool.guide registry) ships empty; the inherited `>=28.4:17`
    // therefore showed an unmet dependency against exactly the node this
    // package is for. Nothing is lost: a range never told Core from Knots
    // either, and the requirement that matters, a node on the BLAKE2b
    // chain (Knots 29.4.1 or later), is checked by the daemon at start and
    // shown by the Chain Identity health check.
    versionRange: '*',
  },
  'knots-blake2b': {
    title: 'Bitcoin Knots (BLAKE2b) Companion',
    endpoints: {
      rpcHostId: b2bRpcHostId,
      rpcPort: b2bRpcPort,
      zmqHostId: b2bZmqHostId,
      zmqPortBlock: b2bZmqPortBlock,
      zmqPortTransaction: b2bZmqPortTransaction,
    } satisfies Endpoints,
    healthChecks: companionHealthChecks,
    notifications: 'zmq' as Notifications,
    // 1.0.0:34 is the first companion whose bitcoind is built with libzmq;
    // earlier ones advertised ZMQ ports they never listened on, which is
    // why this package polled the companion until now.
    versionRange: '>=1.0.0:34',
  },
} as const

export type BackendId = keyof typeof backends
export const backendIds = Object.keys(backends) as BackendId[]
export const defaultBackend: BackendId = 'bitcoind'
