import { lndConfFile } from '../fileModels/lnd.conf'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { literal, mainMounts, selfGrpcHost } from '../utils'

// One tower as `lncli wtclient towers` lists it.
type Tower = {
  pubkey: string
  addresses?: string[]
  num_sessions?: number
  session_info?: { num_sessions?: number }[]
}

// Sessions across the policies (legacy, anchor, taproot). From
// 0.21.3-beta-blake2b.14 a tower that does not set the BLAKE2b bit refuses
// this node at the handshake, while adding it still succeeds, so a tower
// with none is the sign of one that never accepted it.
export function towerSessions(tower: Tower): number {
  if (tower.session_info?.length)
    return tower.session_info.reduce(
      (n, info) => n + (Number(info.num_sessions) || 0),
      0,
    )
  return Number(tower.num_sessions) || 0
}

export const watchtowers = sdk.Action.withoutInput(
  // id
  'watchtowers',

  // metadata
  async ({ effects }) => ({
    name: i18n('Watchtowers'),
    description: i18n(
      'The watchtowers this node backs its channels up to, and whether each has accepted it.',
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Watchtower'),
    visibility: (await lndConfFile
      .read((c) => c['wtclient.active'])
      .const(effects))
      ? 'enabled'
      : { disabled: i18n('Watchtower Client must be enabled') },
  }),

  // the execution function
  async ({ effects }) => {
    const res = await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'lnd' },
      mainMounts,
      'watchtowers',
      (subc) =>
        subc.exec([
          'lncli',
          `--rpcserver=${selfGrpcHost}`,
          'wtclient',
          'towers',
        ]),
    )

    let towers: Tower[]
    try {
      if (res.exitCode !== 0) throw new Error(String(res.stderr))
      towers =
        (JSON.parse(String(res.stdout)) as { towers?: Tower[] }).towers ?? []
    } catch (e) {
      return {
        version: '1',
        title: i18n('Watchtowers'),
        message: i18n('Error listing watchtowers'),
        result: {
          type: 'single',
          value: String(res.stderr || e),
          copyable: true,
          qr: false,
          masked: false,
        },
      }
    }

    if (!towers.length)
      return {
        version: '1',
        title: i18n('Watchtowers'),
        message: i18n(
          'No watchtowers have been added. Add them under Watchtower Client Settings.',
        ),
        result: null,
      }

    return {
      version: '1',
      title: i18n('Watchtowers'),
      message: i18n(
        'A tower with no session has not accepted this node: it must run Lightning Fork 0.21.3-beta-blake2b.14 or later, since a stock LND tower or an earlier release refuses it. A tower just added may need a minute.',
      ),
      result: {
        type: 'group',
        value: towers.map((tower) => {
          const sessions = towerSessions(tower)
          return {
            name: sessions
              ? i18n('Sessions: ${count}', { count: literal(String(sessions)) })
              : i18n('No session: this tower has not accepted this node'),
            description: null,
            type: 'single' as const,
            value: tower.addresses?.length
              ? `${tower.pubkey}@${tower.addresses[0]}`
              : tower.pubkey,
            copyable: true,
            qr: false,
            masked: false,
          }
        }),
      },
    }
  },
)
