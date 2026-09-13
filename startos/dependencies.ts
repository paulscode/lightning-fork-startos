import { T } from '@start9labs/start-sdk'
import { autoconfig as bitcoindAutoconfig } from 'bitcoin-core-startos/startos/actions/config/autoconfig'
import { autoconfig as companionAutoconfig } from 'knots-blake2b-startos/startos/actions/config/autoconfig'
import { backends, defaultBackend } from './backends'
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

  // Lightning Fork subscribes to blocks and transactions over ZMQ, so the
  // selected node has to have it on. Both packages expose the same
  // autoconfig action for exactly this.
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
