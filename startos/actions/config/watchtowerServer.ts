import { rm } from 'fs/promises'
import { lndConfFile } from '../../fileModels/lnd.conf'
import { i18n } from '../../i18n'
import { storeJson } from '../../fileModels/store.json'
import {
  getWatchtowerAddresses,
  kindOf,
  watchtowerAddressKinds,
} from '../../watchtowerAddress'
import { sdk } from '../../sdk'
import { watchtowerServerDir } from '../../utils'

const { InputSpec } = sdk

const watchtowerServerSpec = InputSpec.of({
  'watchtower.externalip': getExternalAddresses(),
})

export const watchtowerServerConfig = sdk.Action.withInput(
  // id
  'watchtower-server-config',

  // metadata
  async ({ effects }) => ({
    name: i18n('Watchtower Server'),
    description: i18n('Enable Watchtower Server in lnd.conf'),
    warning: i18n(
      "Setting the address to 'none' disables the watchtower server and permanently deletes the backup data it holds for the client nodes that rely on it. This cannot be undone.",
    ),
    allowedStatuses: 'any',
    group: i18n('Watchtower'),
    visibility: 'enabled',
  }),

  // form input specification
  watchtowerServerSpec,

  // optionally pre-fill the input form
  async ({ effects }) => ({
    'watchtower.externalip':
      (await lndConfFile.read((c) => c['watchtower.externalip']).once()) ||
      'none',
  }),

  // the execution function
  async ({ effects, input }) => {
    const address = input['watchtower.externalip']
    const watchtowerEnabled = !!address && address !== 'none'

    await lndConfFile.merge(
      effects,
      watchtowerEnabled
        ? {
            'watchtower.active': true,
            'watchtower.listen': ['0.0.0.0:9911'],
            'watchtower.externalip': address,
          }
        : {
            'watchtower.active': false,
            'watchtower.listen': undefined,
            'watchtower.externalip': undefined,
          },
    )

    // Remember the kind of address, so that a later change of the address
    // itself is followed (init/watchHosts.ts).
    const addrs = watchtowerEnabled
      ? await getWatchtowerAddresses(effects).once()
      : undefined
    await storeJson.merge(effects, {
      watchtowerAddressKind:
        watchtowerEnabled && addrs ? kindOf(addrs, address) : null,
    })

    if (!watchtowerEnabled) {
      await rm(watchtowerServerDir, { recursive: true, force: true })
    }
  },
)

export function getExternalAddresses() {
  return sdk.Value.dynamicSelect(async ({ effects }) => {
    const addrs = await getWatchtowerAddresses(effects).const()
    const label: Record<(typeof watchtowerAddressKinds)[number], string> = {
      tor: i18n('Tor'),
      domain: i18n('Public'),
      ipv4: i18n('Public'),
      lan: i18n('LAN only'),
    }
    const values: Record<string, string> = {}
    for (const kind of watchtowerAddressKinds)
      for (const url of addrs?.[kind] ?? [])
        values[url] = `${url} (${label[kind]})`

    if (Object.keys(values).length === 0) {
      return {
        name: i18n('External Address'),
        description: i18n(
          'No available address at which your watchtower can be reached by LND peers.',
        ),
        values: { none: 'none' },
        default: 'none',
      }
    }

    values['none'] = 'none'

    return {
      name: i18n('External Address'),
      description: i18n(
        "Address at which your node can be reached by peers. Select 'none' to disable the watchtower server.",
      ),
      values,
      default: addrs?.tor[0] || 'none',
    }
  })
}
