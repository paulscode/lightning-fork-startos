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
 * when the node serves it, RPC polling when it does not. The companion's
 * bitcoind is built without libzmq (its `getzmqnotifications` is "Method not
 * found"), so the ZMQ endpoints its package exports are never listened on;
 * subscribing to them stops the daemon at start with "connection refused".
 * Polling notices a block within ten seconds, which a Lightning node can live
 * with. Switch the companion back to `zmq` once its image serves it.
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
    versionRange: '>=28.4:17',
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
    notifications: 'rpcpolling' as Notifications,
    // The revision that adopted the official action set, including the
    // autoconfig action this package will drive to turn ZMQ on once the
    // companion's image serves it.
    versionRange: '>=1.0.0:31',
  },
} as const

export type BackendId = keyof typeof backends
export const backendIds = Object.keys(backends) as BackendId[]
export const defaultBackend: BackendId = 'bitcoind'
