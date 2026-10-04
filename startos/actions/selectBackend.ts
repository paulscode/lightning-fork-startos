import { BackendId, backendIds, backends, defaultBackend } from '../backends'
import { nodeLabel, nodeTitle, surveyNodes } from '../nodes'
import { suggestNode } from '../nodeChain'
import { literal } from '../utils'
import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

const { InputSpec, Value } = sdk

/**
 * Which Bitcoin node Lightning Fork runs against.
 *
 * The manifest declares both as optional dependencies and `dependencies.ts`
 * returns exactly one as required, so the UI shows a single node dependency
 * and does not nag about the one the user is not running. The choice is
 * recorded as intent; the address it resolves to is read from the selected
 * package at start, by getBackendBundle, so nothing here can go stale.
 */
const backendInputSpec = InputSpec.of({
  backend: Value.dynamicSelect(async ({ effects }) => {
    const nodes = await surveyNodes(effects)
    const current =
      (await storeJson.read((s) => s?.backend).once()) ?? defaultBackend
    return {
      name: i18n('Select Node'),
      description: i18n(
        'Which node Lightning Fork connects to. It must be on the Bitcoin BLAKE2b chain: Bitcoin Knots 29.4.1 or later, or the BLAKE2b Companion. Each installed node shows the chain its version says; the Chain Identity health check confirms it when the service starts, and refuses a node on the SHA256 chain.',
      ),
      values: Object.fromEntries(
        backendIds.map((id) => [id, nodeLabel(backends[id].title, nodes[id])]),
      ) as Record<string, string>,
      default: suggestNode(backendIds, nodes, 'blake2b', current),
    }
  }),
})

export const selectBackend = sdk.Action.withInput(
  'select-backend',

  {
    name: i18n('Select Node'),
    description: i18n('Choose which Bitcoin node backs Lightning Fork'),
    warning: i18n(
      'Switching nodes restarts Lightning Fork. The node you switch to must be on the Bitcoin BLAKE2b chain.',
    ),
    allowedStatuses: 'any',
    group: i18n('Configuration'),
    visibility: 'enabled',
  },

  backendInputSpec,

  async ({ effects }) => ({
    backend: ((await storeJson.read((s) => s?.backend).const(effects)) ??
      defaultBackend) as any,
  }),

  async ({ effects, input }) => {
    // A node that plainly follows the other chain is refused here, where
    // the person choosing it is, rather than at the next start. (One whose
    // chain is not known is checked then.)
    const chosen = input.backend as BackendId
    const node = (await surveyNodes(effects))[chosen]
    if (node.installed && node.chain === 'sha256')
      throw new Error(
        i18n(
          '${name} here follows the SHA256 chain (version ${version}). Lightning Fork needs a node on the BLAKE2b chain: Bitcoin Knots 29.4.1 or later, or the Bitcoin Knots (BLAKE2b) Companion.',
          {
            name: literal(nodeTitle(backends[chosen].title, node)),
            version: literal(node.version ?? ''),
          },
        ),
      )

    // The package the bridge's SHA256 node reads is on the SHA256 chain;
    // Lightning Fork cannot read it too.
    const store = await storeJson.read().once()
    if (
      (store?.bridgeMode === 'supervised' || store?.bridgeSha256Ever) &&
      store.bridgeSha256Backend === input.backend
    )
      throw new Error(
        i18n(
          "That node is the one the bridge's SHA256 Lightning node reads, on the SHA256 chain. Lightning Fork needs a node on the BLAKE2b chain; choose another, or change the bridge's node in Bridge first.",
        ),
      )
    await storeJson.merge(effects, { backend: input.backend as any })
  },
)
