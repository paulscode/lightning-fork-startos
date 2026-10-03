import { T } from '@start9labs/start-sdk'
import { bridgeRestUrls, lncli } from '../bridge'
import { lndConfFile } from '../fileModels/lnd.conf'
import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { controlHostId } from '../interfaces'
import { sdk } from '../sdk'
import { literal } from '../utils'

const { InputSpec, Value } = sdk

// `lncli bridge status` and `lncli bridge info`. Protobuf's JSON writes
// 64-bit integers as strings.
type BridgeStatus = {
  enabled: boolean
  directions: string[]
  refusals: string[]
  swaps_in_flight: number
  rate: number
  rate_set_at: string
  rate_expires_at: string
}
type BridgeInfo = {
  directions: {
    name: string
    open: boolean
    refusal: string
    spread: number
    min_msat: string
    max_msat: string
  }[]
}

const bridgeVisibility = async (effects: T.Effects) =>
  (await lndConfFile.read((c) => c['bridgerpc.enabled']).const(effects))
    ? ('enabled' as const)
    : ('hidden' as const)

const when = (unix: string) =>
  new Date(Number(unix) * 1000).toISOString().slice(0, 16).replace('T', ' ') +
  ' UTC'

const single = (name: string, value: string, description?: string) => ({
  name,
  description: description ?? null,
  type: 'single' as const,
  value,
  copyable: false,
  qr: false,
  masked: false,
})

export const bridgeStatus = sdk.Action.withoutInput(
  // id
  'bridge-status',

  // metadata
  async ({ effects }) => ({
    name: i18n('Bridge Status'),
    description: i18n(
      'Whether the bridge is serving swaps, and if not, why; its rate and limits.',
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Bridge'),
    visibility: await bridgeVisibility(effects),
  }),

  // the execution function
  async ({ effects }) => {
    const [statusOut, infoOut] = await lncli(
      effects,
      'bridge-status',
      ['bridge', 'status'],
      ['bridge', 'info'],
    )
    const status: BridgeStatus = JSON.parse(statusOut)
    const info: BridgeInfo = JSON.parse(infoOut)

    const state = !status.enabled
      ? i18n('Off')
      : status.refusals.length
        ? status.refusals.join('\n')
        : i18n('Serving swaps')
    const expires = Number(status.rate_expires_at)
      ? when(status.rate_expires_at)
      : i18n('never')

    return {
      version: '1',
      title: i18n('Bridge Status'),
      message: null,
      result: {
        type: 'group',
        value: [
          single(i18n('State'), state),
          single(
            i18n('Rate'),
            String(status.rate),
            i18n(
              'SHA256 coin per BLAKE2b coin, set ${set}, used until ${expires}.',
              { set: when(status.rate_set_at), expires },
            ),
          ),
          single(i18n('Swaps in flight'), String(status.swaps_in_flight)),
          // The outgoing chain's sats: SHA256 for toSHA256, BLAKE2b for
          // toBLAKE2b.
          ...info.directions.map((d) =>
            single(
              d.name,
              d.open
                ? i18n(
                    'Open: spread ${spread}%, invoices of ${min} to ${max} sats',
                    {
                      spread: String(Math.round(d.spread * 10000) / 100),
                      min: String(Math.ceil(Number(d.min_msat) / 1000)),
                      max: String(Math.floor(Number(d.max_msat) / 1000)),
                    },
                  )
                : i18n('Refusing: ${reason}', { reason: literal(d.refusal) }),
            ),
          ),
        ],
      },
    }
  },
)

export const bridgeSetRate = sdk.Action.withInput(
  // id
  'bridge-set-rate',

  // metadata
  async ({ effects }) => ({
    name: i18n('Set Bridge Rate'),
    description: i18n(
      'Change the rate the bridge trades at, at once and without a restart.',
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Bridge'),
    visibility: await bridgeVisibility(effects),
  }),

  // form input specification
  InputSpec.of({
    rate: Value.number({
      name: i18n('Rate'),
      description: i18n(
        'SHA256 coin per BLAKE2b coin, such as 0.00483. It must be set again before the rate maximum age passes, or the bridge stops quoting.',
      ),
      default: null,
      required: true,
      min: 0,
      integer: false,
      placeholder: '0.00483',
    }),
  }),

  // the rate in force, or the configured one if LND does not answer
  async ({ effects }) => {
    try {
      const [out] = await lncli(effects, 'bridge-rate', ['bridge', 'status'])
      const rate = (JSON.parse(out) as BridgeStatus).rate
      if (rate > 0) return { rate }
    } catch {}
    return {
      rate:
        (await lndConfFile.read((c) => c['bridgerpc.fixedrate']).once()) ??
        undefined,
    }
  },

  // the execution function
  async ({ effects, input }) => {
    const [out] = await lncli(effects, 'bridge-set-rate', [
      'bridge',
      'setrate',
      String(input.rate),
    ])
    const { rate } = JSON.parse(out) as { rate: number }
    return {
      version: '1',
      title: i18n('Set Bridge Rate'),
      message: i18n(
        'The bridge now trades at ${rate} SHA256 coin per BLAKE2b coin.',
        { rate: String(rate) },
      ),
      result: null,
    }
  },
)

export const bridgeAddParticipant = sdk.Action.withInput(
  // id
  'bridge-add-participant',

  // metadata
  async ({ effects }) => ({
    name: i18n('Add Bridge Participant'),
    description: i18n(
      'Make a bridge code for someone you will pay invoices for. It lets their node ask for prices and quotes, nothing else.',
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Bridge'),
    visibility: await bridgeVisibility(effects),
  }),

  // form input specification
  InputSpec.of({
    label: Value.text({
      name: i18n('Label'),
      description: i18n(
        'A name for this service that the participant will see, and that you will know them by here.',
      ),
      default: null,
      required: true,
      maxLength: 64,
    }),
    url: Value.dynamicSelect(async ({ effects }) => {
      const urls = await sdk.host
        .getOwn(effects, controlHostId, bridgeRestUrls)
        .const()
      if (!urls?.length)
        return {
          name: i18n('Address'),
          description: i18n(
            'Participants reach this node at an onion address of its REST LND Connect interface, and it has none. Add one to that interface in StartOS, then open this form again.',
          ),
          values: { none: 'none' },
          default: 'none',
        }
      return {
        name: i18n('Address'),
        description: i18n(
          "Where the participant's node reaches this node: an onion address of its REST LND Connect interface. Other addresses would also need the certificate's fingerprint, which changes when StartOS renews it, so they are not offered.",
        ),
        values: Object.fromEntries(urls.map((u) => [u, u])),
        default: urls[0],
      }
    }),
  }),

  // optionally pre-fill the input form
  async () => ({}),

  // the execution function
  async ({ effects, input }) => {
    const label = input.label.trim()
    if (!label || /[\x00-\x1f\x7f]/.test(label))
      throw new Error(i18n('The label must be one line of text.'))
    if (!input.url.startsWith('https://'))
      throw new Error(
        i18n(
          'Participants reach this node at an onion address of its REST LND Connect interface, and it has none. Add one to that interface in StartOS, then open this form again.',
        ),
      )

    const [out] = await lncli(effects, 'bridge-code', [
      'bridge',
      'code',
      `--url=${input.url}`,
      `--label=${label}`,
    ])
    // The id is a uint64, which JSON.parse would round.
    const code: string = JSON.parse(out).code
    const rootKeyId = out.match(/"root_key_id":\s*(\d+)/)?.[1]
    if (!code || !rootKeyId) throw new Error(out)

    const participants =
      (await storeJson.read((s) => s.bridgeParticipants).once()) ?? []
    await storeJson.merge(effects, {
      bridgeParticipants: [
        ...participants,
        { rootKeyId, label, createdAt: new Date().toISOString() },
      ],
    })

    return {
      version: '1',
      title: i18n('Bridge Code'),
      message: i18n(
        'A credential for ${label}: send it privately, as you would a password. They add it in their dashboard under "Paying SHA256 invoices". Remove Bridge Participant revokes it.',
        { label: literal(label) },
      ),
      result: {
        type: 'single',
        value: code,
        copyable: true,
        qr: true,
        masked: true,
      },
    }
  },
)

// Shown while any code is recorded, whether or not the bridge is on: a code
// issued while it was on works again whenever it is turned back on.
export const bridgeRemoveParticipant = sdk.Action.withInput(
  // id
  'bridge-remove-participant',

  // metadata
  async ({ effects }) => ({
    name: i18n('Remove Bridge Participant'),
    description: i18n(
      'Revoke a bridge code. Swaps it has already started still complete.',
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Bridge'),
    visibility: (await storeJson
      .read((s) => s.bridgeParticipants.length)
      .const(effects))
      ? 'enabled'
      : 'hidden',
  }),

  // form input specification
  InputSpec.of({
    participant: Value.dynamicSelect(async ({ effects }) => {
      const participants =
        (await storeJson.read((s) => s.bridgeParticipants).const(effects)) ?? []
      const values: Record<string, string> = Object.fromEntries(
        participants.map((p) => [
          p.rootKeyId,
          `${p.label} (${p.createdAt.slice(0, 10)})`,
        ]),
      )
      return {
        name: i18n('Participant'),
        values,
        default: participants[0]?.rootKeyId ?? '',
      }
    }),
  }),

  // optionally pre-fill the input form
  async () => ({}),

  // the execution function
  async ({ effects, input }) => {
    const participants =
      (await storeJson.read((s) => s.bridgeParticipants).once()) ?? []
    const participant = participants.find(
      (p) => p.rootKeyId === input.participant,
    )
    if (!participant) throw new Error(i18n('No such participant.'))

    await lncli(effects, 'bridge-revoke', [
      'deletemacaroonid',
      participant.rootKeyId,
    ])
    await storeJson.merge(effects, {
      bridgeParticipants: participants.filter((p) => p !== participant),
    })

    return {
      version: '1',
      title: i18n('Remove Bridge Participant'),
      message: i18n('${label} can no longer use the bridge.', {
        label: literal(participant.label),
      }),
      result: null,
    }
  },
)
