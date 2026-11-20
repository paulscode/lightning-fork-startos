import { T, utils } from '@start9labs/start-sdk'
import { base64 } from 'rfc4648'
import { startupFlagsJson } from '../fileModels/startupFlags.json'
import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import {
  literal,
  lndDataDir,
  lndEnv,
  mainMounts,
  scanHostKeys,
  selfRestUrl,
  sleep,
} from '../utils'
import { parseGatewayReply, UNLOCK_TIMEOUT_MS } from '../walletUnlocker'

const { InputSpec, Value, Variants } = sdk

// The alternation must be grouped: `.matches()` anchors the expression as a
// whole, so a bare `A|B` becomes `^A|B$` — each alternative anchored on one
// side only, letting `192.168.1.9; anything` straight through.
const lanHost: T.inputSpecTypes.Pattern = {
  regex: new utils.regexes.ComposableRegex(
    `(?:${utils.regexes.ipv4.asExpr()}|${utils.regexes.localHostname.asExpr()})`,
  ).matches(),
  description: 'Must be a valid IPv4 address or .local hostname',
}

const initWalletSpec = InputSpec.of({
  method: Value.union({
    name: i18n('Initialization Method'),
    description: i18n(
      'Start Fresh creates a new wallet. Migrating a wallet from another node is not offered: a node on the SHA256d chain has channels that cannot be moved to the Bitcoin BLAKE2b chain.',
    ),
    default: 'fresh',
    variants: Variants.of({
      fresh: {
        name: i18n('Start Fresh'),
        spec: InputSpec.of({}),
      },
    }),
  }),
})

export const initializeWallet = sdk.Action.withInput(
  // id
  'initialize-wallet',

  // metadata
  async ({ effects }) => ({
    name: i18n('Initialize Wallet'),
    description: i18n('Create a new wallet'),
    warning: null,
    allowedStatuses: 'only-stopped',
    group: null,
    visibility: 'hidden',
  }),

  // form input specification
  initWalletSpec,

  // optionally pre-fill the input form
  async ({ effects }) => ({}),

  // execution function
  async ({ effects, input }) => {
    // A wallet on disk blocks re-initialization — overwriting it loses funds.
    // A bolt-era or imported wallet is a wallet.db file, tested here. On the
    // SQLite backend the wallet lives in chain.sqlite, which says nothing by
    // itself: LND creates that file at every start, before it has a wallet,
    // so a Start Fresh that failed leaves one behind. Whether it holds a
    // wallet is LND's answer, read in initFresh before anything is written.
    const walletDbExists = await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'lnd' },
      mainMounts,
      'check-wallet',
      async (subc) => {
        const res = await subc.exec([
          'test',
          '-f',
          `${lndDataDir}/data/chain/bitcoin/mainnet/wallet.db`,
        ])
        return res.exitCode === 0
      },
    )
    if (walletDbExists) await refuseExistingWallet(input.method.selection)

    switch (input.method.selection) {
      case 'fresh':
        return await initFresh(effects)
    }
  },
)

/**
 * Refuse to initialize over a wallet that exists. One exception: while an
 * import is scheduled or has failed partway (importPending set), any wallet
 * material on the volume is an incomplete copy of the origin's, so re-running
 * a *migration* over it is the recovery path. Start Fresh stays blocked even
 * then — that partial data could be the only copy of a migrated channel state
 * (a StartOS origin is left stopped, but its data may since be gone), so
 * discarding it is a decision for uninstall, not a side effect.
 */
async function refuseExistingWallet(method: string): Promise<void> {
  const importPending = (await startupFlagsJson.read().once())?.importPending
  if (!importPending) {
    throw new Error(
      'A wallet already exists. Re-initializing would overwrite your existing wallet and could lead to loss of funds.',
    )
  }
  if (method === 'fresh') {
    throw new Error(
      'An interrupted migration left imported data on this server. Re-run the migration to finish it — it picks up where it left off — or uninstall LND and reinstall to truly start fresh.',
    )
  }
}

async function initFresh(
  effects: T.Effects,
): Promise<T.ActionResult & { version: '1' }> {
  const cipherSeed = await sdk.SubContainer.withTemp(
    effects,
    { imageId: 'lnd' },
    mainMounts,
    'initialize-lnd',
    async (subc) => {
      // No chain backend: genseed and initwallet are served before any chain
      // init, and the wallet this creates is empty, so there is nothing for one
      // to do. --nobootstrap keeps the server initwallet starts from dialing
      // peers it has no use for.
      const child = await subc.spawn(
        [
          'lnd',
          '--bitcoin.active',
          '--bitcoin.mainnet',
          '--bitcoin.node=nochainbackend',
          '--nobootstrap',
        ],
        { env: lndEnv },
      )

      // LND's wallet state, from its unauthenticated state service:
      // NON_EXISTING until a wallet is written, then LOCKED or later. Null
      // while LND cannot answer.
      const lndState = async (): Promise<string | null> => {
        const res = await subc.exec([
          'curl',
          '--no-progress-meter',
          '--max-time',
          '5',
          '--cacert',
          `${lndDataDir}/tls.cert`,
          '--fail-with-body',
          `${selfRestUrl}/v1/state`,
        ])
        const state =
          res.exitCode === 0
            ? parseGatewayReply(String(res.stdout))?.state
            : undefined
        return typeof state === 'string' ? state : null
      }
      const stopLnd = async () => {
        child.kill(T.SIGTERM)
        await new Promise<void>((resolve) => {
          child.on('exit', () => resolve())
          setTimeout(resolve, 60_000)
        })
      }

      // LND reports NON_EXISTING or LOCKED once it has opened its databases
      // and looked for a wallet; WAITING_TO_START (or no answer) is before.
      let state: string | null
      while (
        (state = await lndState()) === null ||
        state === 'WAITING_TO_START'
      ) {
        console.log('Waiting for RPC to start...')
        await sleep(2_000)
      }
      if (state !== 'NON_EXISTING') {
        await stopLnd()
        await refuseExistingWallet('fresh')
      }

      // Drop a migration the user scheduled and then thought better of —
      // otherwise main would import over the wallet this creates on the next
      // start.
      await startupFlagsJson.merge(effects, { importPending: false })

      let cipherSeed: string[] = []
      do {
        const res = await subc.exec([
          'curl',
          '--no-progress-meter',
          '--cacert',
          `${lndDataDir}/tls.cert`,
          '--fail-with-body',
          `${selfRestUrl}/v1/genseed`,
        ])
        if (
          res.exitCode === 0 &&
          res.stdout !== '' &&
          typeof res.stdout === 'string'
        ) {
          cipherSeed = JSON.parse(res.stdout)['cipher_seed_mnemonic']
          break
        } else {
          console.log('Waiting for RPC to start...')
          await sleep(5_000)
        }
      } while (true)

      const walletPassword = (await storeJson.read().once())?.walletPassword
      if (!walletPassword) throw new Error('No wallet password found')

      // Before the call, so a wallet created despite a failed reply keeps its
      // seed. Creating the wallet is the same work as opening it, and a
      // SIGKILLed curl would carry on to stop LND mid-write. The body goes
      // over stdin, so the password and seed stay out of the process list.
      await storeJson.merge(effects, { aezeedCipherSeed: cipherSeed })
      const status = await subc.exec(
        [
          'curl',
          '--no-progress-meter',
          '-X',
          'POST',
          '--cacert',
          `${lndDataDir}/tls.cert`,
          '--fail-with-body',
          `${selfRestUrl}/v1/initwallet`,
          '--data-binary',
          '@-',
        ],
        {
          input: JSON.stringify({
            wallet_password: base64.stringify(
              Buffer.from(walletPassword, 'latin1'),
            ),
            cipher_seed_mnemonic: cipherSeed,
          }),
        },
        UNLOCK_TIMEOUT_MS,
      )

      // A failed call may still have written the wallet: a reply lost after
      // LND wrote it (a timeout, a dropped connection) leaves a wallet whose
      // seed is the one stored above, and showing it is the only way out, as
      // a second Start Fresh refuses an existing wallet. LND is asked before
      // it is stopped, as its state moves past NON_EXISTING once the wallet
      // is written. A call LND answered with an error has finished, so one
      // reading settles it; a call with no answer may still be writing, so
      // LND gets up to 20 seconds.
      const message =
        status.exitCode === 0
          ? undefined
          : parseGatewayReply(String(status.stdout))?.message
      const answered = typeof message === 'string'
      let created: boolean | null = status.exitCode === 0 ? true : null
      for (let i = 0; created === null && i < (answered ? 1 : 10); i++) {
        if (i > 0) await sleep(2_000)
        const now = await lndState()
        if (now !== null && now !== 'WAITING_TO_START')
          created = now !== 'NON_EXISTING' ? true : answered ? false : null
      }
      await stopLnd()

      if (status.exitCode !== 0 && created)
        console.warn(
          'initwallet failed, but LND wrote the wallet; showing its seed',
        )
      // No reply and no word from LND: the wallet may exist, so its seed
      // stays stored (Show Credentials shows it) and the user is told so.
      if (created === null)
        throw new Error(
          i18n(
            'LND did not answer while creating the wallet, and it could not be told whether the wallet was written. Run Initialize Wallet again: if it reports that a wallet already exists, the wallet was created, and Show Credentials shows its seed.',
          ),
        )

      if (!created) {
        // Nothing was written, so the stored seed belongs to no wallet.
        await storeJson.merge(effects, { aezeedCipherSeed: null })
        throw new Error(
          i18n('LND could not create the wallet: ${error}', {
            error: literal(
              (typeof message === 'string' && message.trim()) ||
                String(status.stderr).trim() ||
                `curl exited ${status.exitCode}`,
            ),
          }),
        )
      }

      return cipherSeed
    },
  )

  return {
    version: '1' as const,
    title: i18n('Aezeed Cipher Seed'),
    message: i18n(
      "IMPORTANT: Write down these 24 words and store them in a safe place — this is the ONLY time they will be displayed. The seed alone is NOT enough to recover your node: it restores ON-CHAIN funds only and has no knowledge of your channels. To recover funds locked in Lightning channels, you must ALSO keep StartOS backups, which include LND's Static Channel Backup. This is NOT a BIP-39 seed and cannot be used with wallets other than LND.",
    ),
    result: {
      type: 'single' as const,
      value: cipherSeed.map((word, i) => `${i + 1}: ${word}`).join(' '),
      copyable: true,
      qr: false,
      masked: true,
    },
  }
}

/**
 * Verify we can log in to the origin node, then record the migration in
 * startup-flags for main to run. The copy itself cannot happen here: StartOS
 * caps an action run at 120 seconds, while handing over a routing node's channel
 * database takes minutes to hours. So the action does the part that has to be
 * interactive — telling the user, now, whether the address and password work —
 * and main's import phase does the part that has to be long.
 *
 * The SSH login is the whole preflight: every import script authenticates with
 * this same user and password (myNode and StartOS feed it to `sudo -S` as well),
 * so a login that succeeds is the strongest check available without touching the
 * origin's data.
 *
 * Nothing is sent to the origin until its host key is pinned (lnd-startos
 * #242): a first run scans the key and shows its fingerprint, and only a later
 * run for the same host with `verified` (a "Host key verified" toggle in the
 * migration's form) logs in, with StrictHostKeyChecking=yes against that key,
 * which the import scripts then use as well. This package offers no migration
 * (see the method's description), so nothing calls this today; a migration
 * variant brought back must add that toggle.
 */
async function scheduleImport(
  effects: T.Effects,
  source: {
    id: 'umbrel' | 'mynode' | 'startos'
    label: string
    user: string
    host: string
    password: string
    verified: boolean
    reached: string
  },
): Promise<T.ActionResult & { version: '1' }> {
  const scanned = await startupFlagsJson.read((f) => f.importHostKey).once()
  if (!source.verified || scanned?.host !== source.host) {
    const scan = await scanHostKeys(effects, source.host, '22', source.label)
    await startupFlagsJson.merge(effects, {
      importHostKey: { host: source.host, ...scan },
    })
    throw new Error(
      i18n(
        '${source} identified itself as ${fingerprint}. Compare it with the fingerprint the origin reports, then run this again with Host key verified turned on. Nothing has been sent to it.',
        { source: source.label, fingerprint: literal(scan.fingerprints) },
      ),
    )
  }
  const res = await sdk.SubContainer.withTemp(
    effects,
    { imageId: 'lnd' },
    null,
    `preflight-${source.id}`,
    (subc) =>
      subc.exec(
        [
          'sh',
          '-c',
          `printf '%s\\n' "$KNOWN_HOSTS" > /tmp/known_hosts && exec sshpass -e ssh -o UserKnownHostsFile=/tmp/known_hosts -o StrictHostKeyChecking=yes -o ConnectTimeout=10 -T "$1" true`,
          'sh',
          `${source.user}@${source.host}`,
        ],
        {
          env: { SSHPASS: source.password, KNOWN_HOSTS: scanned.knownHosts },
        },
        30_000,
      ),
  )

  if (res.exitCode !== 0) {
    // sshpass exits 5 when the password is rejected; everything else means we
    // never got that far (wrong address, host down, SSH disabled, firewall).
    throw new Error(
      res.exitCode === 5
        ? `The password for ${source.user}@${source.host} was rejected. Check your ${source.label} password and try again.`
        : `Could not reach ${source.label} at ${source.user}@${source.host} over SSH: ${String(res.stderr).trim()}`,
    )
  }

  await startupFlagsJson.merge(effects, {
    importPending: {
      source: source.id,
      host: source.host,
      password: source.password,
      knownHosts: scanned.knownHosts,
    },
    importHostKey: null,
  })

  return {
    version: '1' as const,
    title: i18n('Success'),
    message: `${source.reached} ${i18n(
      'Start LND to run the migration — LND stops the origin node, copies its data, and converts the database before coming online. On a large node this can take hours; watch its progress under Health Checks. Once the migration is complete, never run LND on the origin server again: two nodes sharing one seed leads to unpredictable behavior or loss of funds.',
    )}`,
    result: null,
  }
}
