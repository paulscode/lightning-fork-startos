import { backends, defaultBackend } from '../backends'
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
  backend: Value.select({
    name: i18n('Select Node'),
    description: i18n(
      'Which Bitcoin node Lightning Fork connects to. It must be on the Bitcoin BLAKE2b chain: Bitcoin Knots 29.4.1 or later, or the BLAKE2b Companion. A node on the SHA256d chain is refused when the service starts, and the Chain Identity health check says so.',
    ),
    values: Object.fromEntries(
      Object.entries(backends).map(([id, b]) => [id, b.title]),
    ) as Record<string, string>,
    default: defaultBackend,
  }),
})

export const selectBackend = sdk.Action.withInput(
  'select-backend',

  {
    name: i18n('Select Node'),
    description: i18n(
      'Choose which Bitcoin node backs Lightning Fork',
    ),
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

  async ({ effects, input }) =>
    storeJson.merge(effects, { backend: input.backend as any }),
)
