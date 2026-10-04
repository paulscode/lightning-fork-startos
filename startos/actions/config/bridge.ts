import { T } from '@start9labs/start-sdk'
import { X509Certificate } from 'crypto'
import { access, mkdir, rename, rm, writeFile } from 'fs/promises'
import {
  bridgeCertFile,
  bridgeDirHost,
  bridgeDirLnd,
  bridgeMacaroonFile,
  bridgeUnfinished,
  lncli,
} from '../../bridge'
import { lndConfFile } from '../../fileModels/lnd.conf'
import { storeJson } from '../../fileModels/store.json'
import { backends, defaultBackend, Sha256BackendId } from '../../backends'
import { sha256BackendChoices, sha256Backends } from '../../sha256Node'
import { nodeLabel, nodeTitle, surveyNodes } from '../../nodes'
import { suggestNode } from '../../nodeChain'
import { i18n } from '../../i18n'
import { sdk } from '../../sdk'
import { literal } from '../../utils'

const { InputSpec, Value, Variants } = sdk

// Every key this action writes, so that turning the bridge off leaves none
// behind. The certificate, macaroon and journal stay on disk.
// Off keeps how to reach the SHA256 node (bridgerpc.sha256.*): a bridge off
// with a payment unfinished finishes it through that node, quoting nothing,
// and stops (Lightning Fork's draining mode).
const bridgeOff = {
  'bridgerpc.enabled': undefined,
  'bridgerpc.tosha256': undefined,
  'bridgerpc.toblake2b': undefined,
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
  sha256: Value.union({
    name: i18n('SHA256 Lightning Node'),
    description: i18n(
      'The LND on the SHA256 chain the bridge pays through. Lightning Fork can run one for you: its seed comes from this wallet, so there is nothing new to write down; it takes about 1-3 GB (a Lightning node, not a second chain node); and it starts empty, so fund it and open a channel from it before the bridge can pay. Or use an LND you already run.',
    ),
    default: 'supervised',
    variants: Variants.of({
      supervised: {
        name: i18n('Lightning Fork runs one'),
        spec: InputSpec.of({
          bitcoin: Value.dynamicSelect(async ({ effects }) => {
            const store = await storeJson.read().once()
            const lf = store?.backend ?? defaultBackend
            const choices = sha256BackendChoices(lf)
            const nodes = await surveyNodes(effects)
            const lfNode = nodes[lf]
            return {
              warning:
                lfNode.installed && lfNode.chain === 'sha256'
                  ? i18n(
                      "Lightning Fork is set to read ${name}, which follows the SHA256 chain. In Select Node, choose your node on the BLAKE2b chain first; this one can then be the bridge's node.",
                      { name: literal(nodeTitle(backends[lf].title, lfNode)) },
                    )
                  : null,
              name: i18n('SHA256 Chain Node'),
              description: i18n(
                'The node on the SHA256 chain it reads. Each installed node shows the chain its version says; never the node Lightning Fork reads, which is on the BLAKE2b chain.',
              ),
              default: suggestNode(
                choices,
                nodes,
                'sha256',
                (store?.bridgeSha256Backend as Sha256BackendId | null) ?? null,
                lf,
              ),
              values: Object.fromEntries(
                choices.map((id) => [
                  id,
                  nodeLabel(sha256Backends[id].title, nodes[id]),
                ]),
              ),
            }
          }),
        }),
      },
      existing: {
        name: i18n('An LND I already run'),
        spec: InputSpec.of({
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
        }),
      },
    }),
  }),
  rate: Value.number({
    name: i18n('Rate'),
    description: i18n(
      'SHA256 coin per BLAKE2b coin, such as 0.00483. Leave it empty to set it later with Set Bridge Rate: the bridge quotes nothing until there is one. There is no default, because a wrong rate loses money on every swap.',
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

/**
 * The node on the SHA256 chain chosen for the bridge's own node, checked:
 * not the node Lightning Fork reads, installed, and not plainly on the
 * BLAKE2b chain. Setup 1 before Select Node has been changed (Lightning Fork
 * still on its default, the main node, which is on the SHA256 chain and so is
 * the node the bridge should read) is said as such.
 */
async function checkSha256Choice(
  effects: T.Effects,
  bitcoin: Sha256BackendId,
): Promise<Sha256BackendId> {
  const lf = (await storeJson.read((s) => s.backend).once()) ?? defaultBackend
  if (!sha256BackendChoices(lf).includes(bitcoin))
    throw new Error(
      i18n(
        'That node is the one Lightning Fork reads, on the BLAKE2b chain. Choose one on the SHA256 chain.',
      ),
    )
  const nodes = await surveyNodes(effects)
  const lfNode = nodes[lf]
  if (lfNode.installed && lfNode.chain === 'sha256')
    throw new Error(
      i18n(
        "Lightning Fork is set to read ${name}, which follows the SHA256 chain. In Select Node, choose your node on the BLAKE2b chain first; this one can then be the bridge's node.",
        { name: literal(nodeTitle(backends[lf].title, lfNode)) },
      ),
    )
  const node = nodes[bitcoin]
  const name = literal(nodeTitle(sha256Backends[bitcoin].title, node))
  if (!node.installed)
    throw new Error(
      i18n(
        '${name} is not installed. Install it first (it must be on the SHA256 chain), or choose another.',
        { name },
      ),
    )
  if (node.chain === 'blake2b')
    throw new Error(
      i18n(
        "${name} here follows the BLAKE2b chain (version ${version}); the bridge's node needs one on the SHA256 chain.",
        { name, version: literal(node.version ?? '') },
      ),
    )
  return bitcoin
}

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
      'Pay Lightning invoices on the SHA256 chain for people you choose, through a Lightning node there that Lightning Fork runs for you or one you already run, without holding their funds.',
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
    const store = await storeJson.read().once()
    const lf = store?.backend ?? defaultBackend
    const saved = store?.bridgeSha256Backend as Sha256BackendId | null
    const sha256 =
      store?.bridgeMode === 'external' ||
      (store?.bridgeMode === null && store?.bridgeSha256RpcHost)
        ? { selection: 'existing' as const, value: { connection: null } }
        : {
            selection: 'supervised' as const,
            value: {
              bitcoin: suggestNode(
                sha256BackendChoices(lf),
                await surveyNodes(effects),
                'sha256',
                saved,
                lf,
              ),
            },
          }
    if (!c?.['bridgerpc.enabled']) return { enabled: false, sha256 }
    return {
      enabled: true,
      sha256,
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
    // Off, or onto another SHA256 node, only once nothing is half done
    // (bridgeUnfinished says why): from one mode to the other, or to an LND
    // at another address.
    const current = await lndConfFile.read().once()
    const newConnection =
      input.sha256.selection === 'existing' &&
      input.sha256.value.connection?.trim()
        ? parseLndConnect(input.sha256.value.connection).host
        : null
    const switchingNode =
      !!current?.['bridgerpc.enabled'] &&
      (!!current?.['bridgerpc.sha256.supervised'] !==
        (input.sha256.selection === 'supervised') ||
        (!!newConnection &&
          newConnection !== current?.['bridgerpc.sha256.rpchost']))
    if (!input.enabled || switchingNode) {
      const unfinished = await bridgeUnfinished(effects)
      if (unfinished)
        throw new Error(
          i18n(
            '${count} payments through the bridge are not finished. Wait until Bridge Status shows none in flight and none needing you, then turn it off or change its node: a payment cut off halfway can cost you what the bridge has already paid.',
            { count: String(unfinished) },
          ),
        )
    }

    if (!input.enabled) {
      // The node on the SHA256 chain the bridge's own node reads is kept,
      // and can be changed, while the bridge is off: that node goes on
      // running once it exists (it may hold channels).
      const store = await storeJson.read().once()
      if (
        input.sha256.selection === 'supervised' &&
        store?.bridgeSha256Ever &&
        input.sha256.value.bitcoin !== store.bridgeSha256Backend
      )
        await storeJson.merge(effects, {
          bridgeSha256Backend: await checkSha256Choice(
            effects,
            input.sha256.value.bitcoin as Sha256BackendId,
          ),
        })
      await lndConfFile.merge(effects, bridgeOff)
      return
    }

    // What LND would refuse at start, refused here instead: a bad
    // combination of settings keeps LND from starting at all, unlike an
    // unreachable SHA256 node, which only keeps the bridge down.
    if (!input.tosha256 && !input.toblake2b)
      throw new Error(i18n('Choose at least one direction to serve.'))
    if (input.rate !== null && input.rate !== undefined && input.rate <= 0)
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

    const common = {
      'bridgerpc.enabled': true,
      'bridgerpc.tosha256': input.tosha256,
      'bridgerpc.toblake2b': input.toblake2b,
      'bridgerpc.fixedrate': input.rate ?? undefined,
      'bridgerpc.spread': Number((input.spread / 100).toFixed(6)),
      'bridgerpc.minswapmsat': input.minSwapSats * 1000,
      'bridgerpc.maxswapmsat': input.maxSwapSats * 1000,
      'bridgerpc.ratemaxage': `${input.rateMaxAgeHours}h`,
    }

    // Lightning Fork runs the SHA256 node: nothing to dial or check here.
    // The node is started once the bridge has made its wallet password,
    // and Bridge Status follows it from there.
    if (input.sha256.selection === 'supervised') {
      const bitcoin = await checkSha256Choice(
        effects,
        input.sha256.value.bitcoin as Sha256BackendId,
      )
      await storeJson.merge(effects, {
        bridgeMode: 'supervised',
        bridgeSha256Backend: bitcoin,
        bridgeSha256Ever: true,
      })
      await lndConfFile.merge(effects, {
        ...common,
        'bridgerpc.sha256.supervised': true,
        'bridgerpc.sha256.rpchost': undefined,
        'bridgerpc.sha256.tlscertpath': undefined,
        'bridgerpc.sha256.macaroonpath': undefined,
      })
      return
    }

    // A new URI is written beside the saved one and replaces it only once
    // the SHA256 node has answered with it.
    const connection = input.sha256.value.connection
    let host = await connectionConfigured()
    let suffix = ''
    if (connection?.trim()) {
      const parsed = parseLndConnect(connection)
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

    await storeJson.merge(effects, { bridgeMode: 'external' })
    await lndConfFile.merge(effects, {
      ...common,
      'bridgerpc.sha256.supervised': undefined,
      'bridgerpc.sha256.rpchost': host,
      'bridgerpc.sha256.tlscertpath': `${bridgeDirLnd}/${bridgeCertFile}`,
      'bridgerpc.sha256.macaroonpath': `${bridgeDirLnd}/${bridgeMacaroonFile}`,
    })
  },
)
