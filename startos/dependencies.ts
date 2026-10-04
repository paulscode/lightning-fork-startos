import { T } from '@start9labs/start-sdk'
import { autoconfig as bitcoindAutoconfig } from 'bitcoin-core-startos/startos/actions/config/autoconfig'
import { autoconfig as companionAutoconfig } from 'knots-blake2b-startos/startos/actions/config/autoconfig'
import {
  backendIds,
  backends,
  defaultBackend,
  Sha256BackendId,
} from './backends'
import { sha256Backends, sha256WalletExists } from './sha256Node'
import { lndConfFile } from './fileModels/lnd.conf'
import { storeJson } from './fileModels/store.json'
import { i18n } from './i18n'
import { sdk } from './sdk'

export const setDependencies = sdk.setupDependencies(async ({ effects }) => {
  const torActive = await lndConfFile
    .read((l) => l['tor.active'])
    .const(effects)
  const backend =
    (await storeJson.read((s) => s?.backend).const(effects)) ?? defaultBackend

  const deps: T.CurrentDependenciesResult<any> = {}

  if (torActive) {
    deps.tor = {
      kind: 'running',
      versionRange: '^0.4.9.11:4',
      healthChecks: ['tor'],
    }
  }

  // Where Lightning Fork subscribes to blocks and transactions over ZMQ, the
  // selected node has to have it on; both packages expose the same
  // autoconfig action for exactly this. A backend that is polled instead
  // (see backends.ts) gets no such task. A critical task blocks this service
  // until satisfied, so any raised on a node that is not the selected ZMQ
  // backend (no longer selected, never installed, or polled) must go; the
  // SDK keys tasks as `<package>:<action>`.
  const usesZmq = backends[backend].notifications === 'zmq'
  await sdk.action.clearTask(
    effects,
    ...backendIds
      .filter((b) => b !== backend || !usesZmq)
      .map((b) => `${b}:autoconfig`),
  )
  if (usesZmq) {
    const autoconfig =
      backend === 'bitcoind' ? bitcoindAutoconfig : companionAutoconfig
    await sdk.action.createTask(effects, backend, autoconfig, 'critical', {
      input: {
        kind: 'partial',
        accept: [{ zmqEnabled: true }],
        set: { zmqEnabled: true },
      },
      reason: i18n('Lightning Fork requires ZMQ enabled in the Bitcoin node'),
      when: { condition: 'input-not-matches', once: false },
    })
  }

  // The bridge's own SHA256 Lightning node reads a Bitcoin node on the SHA256
  // chain, which is required only while that node runs: a bridge that is off,
  // or that pays through an LND the operator already runs, needs none. It is
  // polled over RPC (sha256Node.ts), so it needs no ZMQ task.
  const supervised = await lndConfFile
    .read((l) => !!l['bridgerpc.enabled'] && !!l['bridgerpc.sha256.supervised'])
    .const(effects)
  const sha256Backend = (await storeJson
    .read((s) => s?.bridgeSha256Backend)
    .const(effects)) as Sha256BackendId | null | undefined
  if (
    (supervised || (await sha256WalletExists())) &&
    sha256Backend &&
    sha256Backend !== backend
  ) {
    deps[sha256Backend] = {
      kind: 'running',
      versionRange: sha256Backends[sha256Backend].versionRange,
      healthChecks: [...sha256Backends[sha256Backend].healthChecks],
    }
  }

  // Exactly one node, chosen by the user. Return ONLY the selected one: a
  // present-but-undefined entry for the other id crashes the host, which
  // iterates the returned keys and reads .versionRange off each value.
  return {
    ...deps,
    [backend]: {
      kind: 'running',
      versionRange: backends[backend].versionRange,
      healthChecks: [...backends[backend].healthChecks],
    },
  } as any
})
