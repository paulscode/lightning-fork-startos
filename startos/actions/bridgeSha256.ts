import { T } from '@start9labs/start-sdk'
import { lncli } from '../bridge'
import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import {
  sha256AdminMacaroon,
  sha256GrpcPort,
  sha256NodeDir,
} from '../sha256Node'
import { literal } from '../utils'

const { InputSpec, Value } = sdk

// The bridge's own SHA256 Lightning node, reached with its admin macaroon. That
// macaroon never leaves the node's directory: these actions run lncli in this
// package against it, for the operator, and the bridge itself holds only the
// narrow one Lightning Fork baked.
const sha256Node = [
  `--rpcserver=127.0.0.1:${sha256GrpcPort}`,
  `--tlscertpath=${sha256NodeDir}/tls.cert`,
  `--macaroonpath=${sha256AdminMacaroon}`,
]

// Once Lightning Fork has run a node for the bridge: that node goes on
// running, bridge on or off, so its funds and channels stay the operator's to
// manage (only-running, so the service is up to answer).

const everVisibility = async (effects: T.Effects) =>
  (await storeJson
    .read((s) => s.bridgeSha256Ever || s.bridgeMode === 'supervised')
    .const(effects))
    ? ('enabled' as const)
    : ('hidden' as const)

const single = (
  name: string,
  value: string,
  opts: {
    description?: string
    copyable?: boolean
    qr?: boolean
    masked?: boolean
  } = {},
) => ({
  name,
  description: opts.description ?? null,
  type: 'single' as const,
  value,
  copyable: !!opts.copyable,
  qr: !!opts.qr,
  masked: !!opts.masked,
})

export const bridgeSha256Fund = sdk.Action.withoutInput(
  // id
  'bridge-sha256-fund',

  // metadata
  async ({ effects }) => ({
    name: i18n('Fund the SHA256 Node'),
    description: i18n(
      "Where to send coins on the SHA256 chain for the bridge's own Lightning node, and how other nodes reach it. It starts empty: fund it, then open a channel from it.",
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Bridge'),
    visibility: await everVisibility(effects),
  }),

  // the execution function
  async ({ effects }) => {
    const [addrOut, balOut, infoOut] = await lncli(
      effects,
      'bridge-sha256-fund',
      [...sha256Node, 'newaddress', 'p2tr', '--unused'],
      [...sha256Node, 'walletbalance'],
      [...sha256Node, 'getinfo'],
    )
    const address: string = JSON.parse(addrOut).address
    const balance = JSON.parse(balOut)
    const info = JSON.parse(infoOut)

    return {
      version: '1',
      title: i18n('Fund the SHA256 Node'),
      message: i18n(
        'Send coins on the SHA256 chain to this address, then open a channel from the node with Open SHA256 Channel. The bridge pays out of that channel.',
      ),
      result: {
        type: 'group',
        value: [
          single(i18n('Deposit address'), address, {
            copyable: true,
            qr: true,
          }),
          single(
            i18n('On-chain balance'),
            i18n('${confirmed} sats confirmed, ${unconfirmed} confirming', {
              confirmed: String(balance.confirmed_balance ?? 0),
              unconfirmed: String(balance.unconfirmed_balance ?? 0),
            }),
          ),
          single(
            i18n('Node'),
            (info.uris as string[] | undefined)?.join('\n') ||
              String(info.identity_pubkey),
            {
              copyable: true,
              description: (info.uris as string[] | undefined)?.length
                ? i18n(
                    'How nodes on the SHA256 chain reach it, to connect or open a channel to it.',
                  )
                : i18n(
                    'Its identity on the SHA256 chain. It takes no incoming connections, so open channels from it.',
                  ),
            },
          ),
        ],
      },
    }
  },
)

export const bridgeSha256OpenChannel = sdk.Action.withInput(
  // id
  'bridge-sha256-open-channel',

  // metadata
  async ({ effects }) => ({
    name: i18n('Open SHA256 Channel'),
    description: i18n(
      "Open a channel from the bridge's SHA256 Lightning node. The bridge pays out of it, so open it to a well-connected node and make it larger than your largest swap.",
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Bridge'),
    visibility: await everVisibility(effects),
  }),

  InputSpec.of({
    peer: Value.text({
      name: i18n('Peer'),
      description: i18n(
        'The node to open it to, as pubkey@host:port, on the SHA256 chain.',
      ),
      default: null,
      required: true,
      patterns: [
        {
          regex: '^[0-9a-fA-F]{66}@[^\\s@]+:[0-9]{1,5}$',
          description: i18n('pubkey@host:port'),
        },
      ],
    }),
    amount: Value.number({
      name: i18n('Amount'),
      description: i18n('From the on-chain balance, in sats.'),
      default: null,
      required: true,
      min: 20000,
      integer: true,
      units: 'sats',
    }),
  }),

  async () => ({}),

  async ({ effects, input }) => {
    const peer = input.peer.trim()
    const pubkey = peer.slice(0, peer.indexOf('@'))

    // Connecting first, and tolerating "already connected", so a peer the
    // node already knows is not a reason to fail.
    try {
      await lncli(effects, 'bridge-sha256-connect', [
        ...sha256Node,
        'connect',
        peer,
      ])
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e)
      if (!/already connected/i.test(why))
        throw new Error(
          i18n('Could not reach ${peer}: ${error}', {
            peer: literal(peer),
            error: literal(why),
          }),
        )
    }

    const [out] = await lncli(effects, 'bridge-sha256-open', [
      ...sha256Node,
      'openchannel',
      `--node_key=${pubkey}`,
      `--local_amt=${input.amount}`,
    ])
    const txid = JSON.parse(out).funding_txid ?? out.trim()

    return {
      version: '1',
      title: i18n('Open SHA256 Channel'),
      message: i18n(
        'The channel opens once its funding transaction confirms; Bridge Status shows it then.',
      ),
      result: single(i18n('Funding transaction'), String(txid), {
        copyable: true,
      }),
    }
  },
)

export const bridgeSha256Seed = sdk.Action.withoutInput(
  // id
  'bridge-sha256-seed',

  // metadata
  async ({ effects }) => ({
    name: i18n('SHA256 Node Recovery Phrase'),
    description: i18n(
      "The 24 words that restore the bridge's SHA256 Lightning node in a stock LND, without Lightning Fork. They are derived from this node's own phrase, so there is nothing new to keep; this is for restoring that node somewhere else, once it no longer runs here: two copies of one node with channels can lose them.",
    ),
    warning: i18n(
      'Anyone who sees these words can spend what the SHA256 node holds.',
    ),
    allowedStatuses: 'only-running',
    group: i18n('Bridge'),
    visibility: await everVisibility(effects),
  }),

  // the execution function
  async ({ effects }) => {
    const [out] = await lncli(effects, 'bridge-sha256-seed', [
      'bridge',
      'sha256seed',
    ])
    const seed = JSON.parse(out)

    return {
      version: '1',
      title: i18n('SHA256 Node Recovery Phrase'),
      message: i18n(
        'Type the phrase into a stock LND at "lncli create" (no passphrase), then recover its channels from the SHA256 node\'s own channel backup, which the dashboard\'s Bridge page downloads. Either form restores the same node; check that it reports the identity below.',
      ),
      result: {
        type: 'group',
        value: [
          single(
            i18n('Recovery phrase'),
            (seed.mnemonic as string[]).join(' '),
            { copyable: true, masked: true },
          ),
          single(i18n('BIP32 root key'), String(seed.extended_master_key), {
            copyable: true,
            masked: true,
          }),
          single(i18n('Identity it will have'), String(seed.identity_pubkey), {
            copyable: true,
          }),
          single(i18n('How it is derived'), String(seed.derivation)),
        ],
      },
    }
  },
)
