import { X509Certificate } from 'crypto'
import { access, mkdir, rename, rm, writeFile } from 'fs/promises'
import {
  bridgeCertFile,
  bridgeDirHost,
  bridgeDirLnd,
  bridgeMacaroonFile,
  lncli,
} from '../../bridge'
import { lndConfFile } from '../../fileModels/lnd.conf'
import { storeJson } from '../../fileModels/store.json'
import { i18n } from '../../i18n'
import { sdk } from '../../sdk'
import { literal } from '../../utils'

const { InputSpec, Value } = sdk

// Every key this action writes, so that turning the bridge off leaves none
// behind. The certificate, macaroon and journal stay on disk.
const bridgeOff = {
  'bridgerpc.enabled': undefined,
  'bridgerpc.tosha256': undefined,
  'bridgerpc.toblake2b': undefined,
  'bridgerpc.sha256.rpchost': undefined,
  'bridgerpc.sha256.tlscertpath': undefined,
  'bridgerpc.sha256.macaroonpath': undefined,
  'bridgerpc.fixedrate': undefined,
  'bridgerpc.spread': undefined,
  'bridgerpc.maxswapmsat': undefined,
  'bridgerpc.minswapmsat': undefined,
  'bridgerpc.ratemaxage': undefined,
}

// A connection is configured once a URI has been saved and its files are
// still there.
async function connectionConfigured(): Promise<string | null> {
  const host = await storeJson.read((s) => s.bridgeSha256RpcHost).once()
  if (!host) return null
  try {
    await access(`${bridgeDirHost}/${bridgeCertFile}`)
    await access(`${bridgeDirHost}/${bridgeMacaroonFile}`)
    return host
  } catch {
    return null
  }
}

const bridgeSpec = InputSpec.of({
  enabled: Value.toggle({
    name: i18n('Enable Bridge'),
    default: false,
  }),
  tosha256: Value.toggle({
    name: i18n('Pay SHA256 invoices for participants'),
    description: i18n(
      'They pay this node on the BLAKE2b chain; the SHA256 node pays out. Needs outbound liquidity on the SHA256 node.',
    ),
    default: true,
  }),
  toblake2b: Value.toggle({
    name: i18n('Pay BLAKE2b invoices for participants'),
    description: i18n(
      'They pay the SHA256 node; this node pays out. Needs outbound liquidity here.',
    ),
    default: false,
  }),
  connection: Value.dynamicText(async () => {
    const configured = await connectionConfigured()
    return {
      name: i18n('SHA256 Node Connection'),
      description: i18n(
        "The gRPC lndconnect URI of a stock LND on the SHA256 chain, with its admin macaroon. This server dials that address directly, never through Tor: use the form with the node's LAN IP address, not .local or .onion.",
      ),
      default: null,
      required: false,
      masked: true,
      placeholder: configured
        ? i18n('Configured for ${host}. Leave empty to keep it.', {
            host: literal(configured),
          })
        : 'lndconnect://192.168.1.10:10009?cert=…&macaroon=…',
    }
  }),
  rate: Value.number({
    name: i18n('Rate'),
    description: i18n(
      'SHA256 coin per BLAKE2b coin, such as 0.00483. There is no default: a wrong rate loses money on every swap. Change it later with Set Bridge Rate.',
    ),
    default: null,
    required: false,
    min: 0,
    integer: false,
    placeholder: '0.00483',
  }),
  spread: Value.number({
    name: i18n('Spread'),
    description: i18n(
      'What you keep on top of the rate; routing fees come out of it.',
    ),
    default: 1,
    required: true,
    min: 0.3,
    max: 19.9,
    integer: false,
    units: '%',
  }),
  minSwapSats: Value.number({
    name: i18n('Smallest Swap'),
    description: i18n(
      'In SHA256 sats, in both directions (converted at your rate).',
    ),
    default: 1000,
    required: true,
    min: 1,
    integer: true,
    units: 'sats',
  }),
  maxSwapSats: Value.number({
    name: i18n('Largest Swap'),
    description: i18n(
      'In SHA256 sats, in both directions (converted at your rate).',
    ),
    default: 150000,
    required: true,
    min: 1,
    integer: true,
    units: 'sats',
  }),
  rateMaxAgeHours: Value.number({
    name: i18n('Rate Maximum Age'),
    description: i18n(
      'After this long without a new rate the bridge stops quoting.',
    ),
    default: 24,
    required: true,
    min: 1,
    integer: true,
    units: i18n('hours'),
  }),
})

// A Go duration as whole hours, for the prefill: what this action writes
// (`24h`) and what LND accepts by hand (`36h0m0s`, `90m`).
function durationHours(d?: string): number | undefined {
  const m = d?.match(/^(?:([\d.]+)h)?(?:([\d.]+)m)?(?:([\d.]+)s)?$/)
  if (!m) return undefined
  const hours =
    Number(m[1] ?? 0) + Number(m[2] ?? 0) / 60 + Number(m[3] ?? 0) / 3600
  return hours >= 1 ? Math.round(hours) : undefined
}

// lndconnect://host:port?cert=<base64url DER>&macaroon=<base64url>. The
// query is split by hand: URLSearchParams reads `+` as a space, which breaks
// a value written in plain base64.
function parseLndConnect(uri: string) {
  const malformed = i18n(
    "That is not the SHA256 node's gRPC lndconnect URI: lndconnect://host:port?cert=…&macaroon=…",
  )
  let url: URL
  try {
    url = new URL(uri.trim())
  } catch {
    throw new Error(malformed)
  }
  if (url.protocol !== 'lndconnect:' || !url.hostname || !url.port)
    throw new Error(malformed)
  if (url.hostname.toLowerCase().endsWith('.onion'))
    throw new Error(
      i18n(
        'The bridge dials the SHA256 node directly, not through Tor, so an onion address cannot be used. Use its LAN IP address.',
      ),
    )

  const params: Record<string, string> = {}
  for (const pair of url.search.slice(1).split('&')) {
    const eq = pair.indexOf('=')
    if (eq > 0)
      params[pair.slice(0, eq)] = decodeURIComponent(pair.slice(eq + 1))
  }

  let cert: string
  try {
    cert = new X509Certificate(
      Buffer.from(params.cert ?? '', 'base64url'),
    ).toString()
  } catch {
    throw new Error(
      i18n('The certificate in the lndconnect URI cannot be read.'),
    )
  }

  // A binary (v2) macaroon starts with its version byte.
  const macaroon = Buffer.from(params.macaroon ?? '', 'base64url')
  if (macaroon.length < 32 || macaroon[0] !== 2)
    throw new Error(i18n('The macaroon in the lndconnect URI cannot be read.'))

  return { host: url.host, cert, macaroon }
}

export const bridgeConfig = sdk.Action.withInput(
  // id
  'bridge-config',

  // metadata
  async ({ effects }) => ({
    name: i18n('Bridge'),
    description: i18n(
      'Pay Lightning invoices on the SHA256 chain for people you choose, through your own LND there, without holding their funds.',
    ),
    warning: i18n(
      'If LND cannot reach the SHA256 node, the bridge stays down and tries again every minute; LND itself runs as usual. Bridge Status says why.',
    ),
    allowedStatuses: 'any',
    group: i18n('Bridge'),
    visibility: 'enabled',
  }),

  // form input specification
  bridgeSpec,

  // optionally pre-fill the input form; never the connection, a secret
  async ({ effects }) => {
    const c = await lndConfFile.read().once()
    if (!c?.['bridgerpc.enabled']) return { enabled: false }
    return {
      enabled: true,
      tosha256: !!c['bridgerpc.tosha256'],
      toblake2b: !!c['bridgerpc.toblake2b'],
      rate: c['bridgerpc.fixedrate'] ?? null,
      spread:
        c['bridgerpc.spread'] !== undefined
          ? Math.round(c['bridgerpc.spread'] * 10000) / 100
          : 1,
      minSwapSats:
        c['bridgerpc.minswapmsat'] !== undefined
          ? Math.round(c['bridgerpc.minswapmsat'] / 1000)
          : 1000,
      maxSwapSats:
        c['bridgerpc.maxswapmsat'] !== undefined
          ? Math.round(c['bridgerpc.maxswapmsat'] / 1000)
          : 150000,
      rateMaxAgeHours: durationHours(c['bridgerpc.ratemaxage']) ?? 24,
    }
  },

  // the execution function
  async ({ effects, input }) => {
    if (!input.enabled) {
      await lndConfFile.merge(effects, bridgeOff)
      return
    }

    // What LND would refuse at start, refused here instead: a bad
    // combination of settings keeps LND from starting at all, unlike an
    // unreachable SHA256 node, which only keeps the bridge down.
    if (!input.tosha256 && !input.toblake2b)
      throw new Error(i18n('Choose at least one direction to serve.'))
    if (!input.rate || input.rate <= 0)
      throw new Error(
        i18n(
          'Enter the rate, in SHA256 coin per BLAKE2b coin, such as 0.00483.',
        ),
      )
    if (input.spread < 0.3 || input.spread >= 20)
      throw new Error(i18n('The spread must be from 0.3% to under 20%.'))
    if (input.minSwapSats > input.maxSwapSats)
      throw new Error(
        i18n('The smallest swap must not be larger than the largest.'),
      )

    // A new URI is written beside the saved one and replaces it only once
    // the SHA256 node has answered with it.
    let host = await connectionConfigured()
    let suffix = ''
    if (input.connection?.trim()) {
      const parsed = parseLndConnect(input.connection)
      host = parsed.host
      suffix = '.new'
      await mkdir(bridgeDirHost, { recursive: true, mode: 0o700 })
      await writeFile(
        `${bridgeDirHost}/${bridgeCertFile}${suffix}`,
        parsed.cert,
        { mode: 0o600 },
      )
      await writeFile(
        `${bridgeDirHost}/${bridgeMacaroonFile}${suffix}`,
        parsed.macaroon,
        { mode: 0o600 },
      )
    }
    if (!host)
      throw new Error(
        i18n(
          "Paste the SHA256 node's gRPC lndconnect URI to turn the bridge on.",
        ),
      )

    try {
      await lncli(effects, 'bridge-check', [
        `--rpcserver=${host}`,
        `--tlscertpath=${bridgeDirLnd}/${bridgeCertFile}${suffix}`,
        `--macaroonpath=${bridgeDirLnd}/${bridgeMacaroonFile}${suffix}`,
        'getinfo',
      ])
    } catch (e) {
      if (suffix) {
        await rm(`${bridgeDirHost}/${bridgeCertFile}${suffix}`, { force: true })
        await rm(`${bridgeDirHost}/${bridgeMacaroonFile}${suffix}`, {
          force: true,
        })
      }
      throw new Error(
        i18n('The SHA256 node did not answer at ${host}: ${error}', {
          host: literal(host),
          error: literal(e instanceof Error ? e.message : String(e)),
        }),
      )
    }
    if (suffix) {
      for (const file of [bridgeCertFile, bridgeMacaroonFile])
        await rename(
          `${bridgeDirHost}/${file}${suffix}`,
          `${bridgeDirHost}/${file}`,
        )
      await storeJson.merge(effects, { bridgeSha256RpcHost: host })
    }

    await lndConfFile.merge(effects, {
      'bridgerpc.enabled': true,
      'bridgerpc.tosha256': input.tosha256,
      'bridgerpc.toblake2b': input.toblake2b,
      'bridgerpc.sha256.rpchost': host,
      'bridgerpc.sha256.tlscertpath': `${bridgeDirLnd}/${bridgeCertFile}`,
      'bridgerpc.sha256.macaroonpath': `${bridgeDirLnd}/${bridgeMacaroonFile}`,
      'bridgerpc.fixedrate': input.rate,
      'bridgerpc.spread': Number((input.spread / 100).toFixed(6)),
      'bridgerpc.minswapmsat': input.minSwapSats * 1000,
      'bridgerpc.maxswapmsat': input.maxSwapSats * 1000,
      'bridgerpc.ratemaxage': `${input.rateMaxAgeHours}h`,
    })
  },
)
