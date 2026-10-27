import { T } from '@start9labs/start-sdk'
import { randomBytes } from 'node:crypto'
import { chmod, mkdir, readdir, rm } from 'node:fs/promises'
import { lncli } from '../bridge'
import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { removeUnless, replaceFile } from '../init/setupCerts'
import { sdk } from '../sdk'
import { literal, mainVolumeHost } from '../utils'
import { getLndState } from '../walletUnlocker'

const { InputSpec, Value } = sdk

/**
 * Macaroons for other StartOS packages. A package asks with a task for
 * grant-app-access (README, "For packages that depend on this one"); the owner
 * sees exactly what it asks for and approves it, or not. Each grant has a root
 * key of its own, so Revoke App Access invalidates that one alone, and the
 * macaroon is written to apps/<packageId>/access.macaroon in the main volume,
 * which the package mounts read-only.
 *
 * StartOS has no per-dependent mount control: any package that declares this
 * one as a dependency could mount another's folder, or the whole volume. This
 * gives honest apps least privilege and the owner consent and per-app
 * revocation; it is not a wall between dependents.
 */

/** Folder of the per-package folders, at the main volume's root. */
export const appsDir = `${mainVolumeHost}/apps`
export const appMacaroonFile = 'access.macaroon'

/** A StartOS package id. */
const packageIdPattern = /^[a-z0-9][a-z0-9-]{0,62}$/

/**
 * What an app may be granted. Everything else is refused, above all
 * macaroon:* (it could bake itself more), signer:* (signs with the node's
 * keys), onchain:write (moves on-chain funds; opens and closes channels),
 * peers:write, info:write (stops the daemon) and uri: permissions.
 */
const permissionWords = {
  'info:read': () =>
    i18n(
      "See node information: this node's identity, version and sync state, and the public network graph",
    ),
  'offchain:read': () =>
    i18n('See Lightning channels, balances and payment history'),
  'offchain:write': () =>
    i18n(
      'Send Lightning payments from your channels, change channel fees, abandon a channel, restore channel backups and delete payment history',
    ),
  'invoices:read': () => i18n('See invoices and whether they were paid'),
  'invoices:write': () => i18n('Create invoices to receive payments'),
  'onchain:read': () => i18n('See the on-chain balance and transactions'),
  'address:read': () => i18n("See the on-chain wallet's addresses"),
  'address:write': () => i18n('Create new on-chain addresses to receive to'),
  'peers:read': () => i18n('See the connected peers'),
  'message:read': () => i18n('Verify messages signed by other nodes'),
  'message:write': () => i18n("Sign messages with this node's key"),
} as const
type Permission = keyof typeof permissionWords
const permissions = Object.keys(permissionWords) as Permission[]

const describe = (p: string) =>
  p in permissionWords ? `${permissionWords[p as Permission]()} (${p})` : p

/** The package's folder, refusing anything but a package id in the path. */
function appDir(packageId: string) {
  if (!packageIdPattern.test(packageId))
    throw new Error(
      i18n('"${id}" is not a StartOS package id.', {
        id: literal(packageId),
      }),
    )
  return `${appsDir}/${packageId}`
}

/** A folder of ours: a directory (not a symlink to one) this process owns. */
const ownDir = (st: { isDirectory(): boolean; uid: number | bigint }) =>
  st.isDirectory() && Number(st.uid) === (process.getuid?.() ?? 0)

/**
 * apps/ itself, made in init so that it is ours before any package mounts
 * its folder: StartOS creates a missing mount source, apps/<id>/ included,
 * and a folder it made inside an apps/ it also made could belong to a user
 * this container cannot write as, and could not be removed from here.
 */
export async function ensureAppsDir() {
  await removeUnless(appsDir, ownDir)
  await mkdir(appsDir, { recursive: true, mode: 0o755 })
  await chmod(appsDir, 0o755)
}

/**
 * Write the macaroon where the package reads it. A restored or imported
 * volume can carry an apps/ or apps/<id>/ that is a symlink (mkdir would
 * follow it), or an access.macaroon that isn't a regular file; lstat sees
 * the entry itself, so either is removed first, as for public/. A folder
 * StartOS made for the package's mount before the grant (empty) is used
 * as it is when it is ours, and replaced when it is not; a package that has
 * it mounted then sees the file from its next start.
 */
async function writeAppMacaroon(packageId: string, macaroon: Uint8Array) {
  const dir = appDir(packageId)
  const to = `${dir}/${appMacaroonFile}`
  await ensureAppsDir()
  await removeUnless(dir, ownDir)
  await mkdir(dir, { recursive: true, mode: 0o755 })
  await chmod(dir, 0o755)
  await removeUnless(to, (st) => st.isFile())
  await replaceFile(to, macaroon, 0o644)
}

/** Remove a package's folder; a symlink in its place goes, not its target. */
async function removeAppDir(packageId: string) {
  await rm(appDir(packageId), { force: true, recursive: true })
}

/**
 * Every grant's folder and record go. `lncli deletemacaroonid` on each root
 * key is attempted while LND answers; once it doesn't, the rest are left to
 * the root key rotation this is called before (Revoke Macaroons), which
 * replaces every root key, these included.
 */
export async function removeAllAppGrants(effects: T.Effects) {
  const grants = (await storeJson.read((s) => s.appGrants).once()) ?? []
  if (grants.length)
    await lncli(
      effects,
      'app-revoke',
      ...grants.map((g) => ['deletemacaroonid', g.rootKeyId]),
    ).catch((e) =>
      console.warn('Could not delete the app root keys; the rotation will', e),
    )
  // apps/ stays, ours, for the next grant (ensureAppsDir).
  for (const entry of await readdir(appsDir).catch(() => []))
    await rm(`${appsDir}/${entry}`, { force: true, recursive: true })
  if (grants.length) await storeJson.merge(effects, { appGrants: [] })
}

/** Baking and deleting root keys needs the wallet unlocked and RPC up. */
async function requireRpc() {
  const state = await getLndState()
  if (state !== 'RPC_ACTIVE' && state !== 'SERVER_ACTIVE')
    throw new Error(
      i18n(
        'LND is not ready: its wallet must be unlocked and LND started. Try again in a moment.',
      ),
    )
}

/** A uint64 that names no root key yet, never 0 (the node's own). */
async function freshRootKeyId(effects: T.Effects): Promise<string> {
  const [out] = await lncli(effects, 'app-root-keys', ['listmacaroonids'])
  const used = new Set(out.match(/\d+/g) ?? [])
  const store = await storeJson.read().once()
  for (const g of store?.appGrants ?? []) used.add(g.rootKeyId)
  for (const p of store?.bridgeParticipants ?? []) used.add(p.rootKeyId)
  for (;;) {
    const id = randomBytes(8).readBigUInt64BE().toString()
    if (id !== '0' && !used.has(id)) return id
  }
}

export const grantAppAccess = sdk.Action.withInput(
  // id
  'grant-app-access',

  // metadata
  async ({ effects }) => ({
    name: i18n('Grant an App Access'),
    description: i18n(
      'Give another package on this server a macaroon with only the permissions you check. Apps that need Lightning Fork ask for it with a task, which opens this form filled in with what they asked for. Revoke App Access takes it back.',
    ),
    warning: i18n(
      'The package named below can do exactly what is checked, until you revoke it. Check that the package id is the app you mean, and leave unchecked anything it should not do.',
    ),
    allowedStatuses: 'only-running',
    group: i18n('App Access'),
    visibility: 'enabled',
  }),

  // form input specification
  InputSpec.of({
    packageId: Value.text({
      name: i18n('Package id'),
      description: i18n(
        'The StartOS package id of the app that gets this access, as in its address in StartOS (for example lightning-stream-gateway). The macaroon is written to apps/<package id>/access.macaroon for that package to read.',
      ),
      default: null,
      required: true,
      maxLength: 63,
      patterns: [
        {
          regex: packageIdPattern.source,
          description: i18n(
            'A StartOS package id: lower-case letters, digits and hyphens, starting with a letter or digit.',
          ),
        },
      ],
    }),
    permissions: Value.multiselect({
      name: i18n('Permissions'),
      description: i18n(
        'What the app may do. Each checked line is granted, and nothing else. Moving on-chain funds, opening or closing channels, signing with the wallet keys and making macaroons are never offered.',
      ),
      values: Object.fromEntries(
        permissions.map((p) => [p, describe(p)]),
      ) as Record<Permission, string>,
      default: [],
      minLength: 1,
    }),
    label: Value.text({
      name: i18n('Label'),
      description: i18n(
        'Optional: a note to know this grant by in Revoke App Access.',
      ),
      default: null,
      required: false,
      maxLength: 64,
    }),
  }),

  // optionally pre-fill the input form
  async () => ({}),

  // the execution function
  async ({ effects, input }) => {
    const packageId = input.packageId.trim()
    appDir(packageId)
    const asked: string[] = input.permissions
    const refused = asked.filter((p) => !(p in permissionWords))
    if (refused.length)
      throw new Error(
        i18n('These permissions cannot be granted to an app: ${list}', {
          list: literal(refused.join(', ')),
        }),
      )
    // In the form's order, once each.
    const granted = permissions.filter((p) => asked.includes(p))
    if (!granted.length) throw new Error(i18n('Check at least one permission.'))
    const label = (input.label ?? '').trim()
    if (/[\x00-\x1f\x7f]/.test(label))
      throw new Error(i18n('The label must be one line of text.'))

    const installed = await sdk.getInstalledPackages(effects)
    if (!installed.includes(packageId))
      throw new Error(
        i18n('No package "${id}" is installed on this server.', {
          id: literal(packageId),
        }),
      )
    await requireRpc()

    // The new macaroon is baked and in place before the old one is revoked,
    // so a replaced grant never leaves the app without one.
    const rootKeyId = await freshRootKeyId(effects)
    const [out] = await lncli(effects, 'app-bake', [
      'bakemacaroon',
      `--root_key_id=${rootKeyId}`,
      ...granted,
    ])
    const hex = out.trim()
    if (!/^([0-9a-f]{2})+$/.test(hex)) throw new Error(out)
    try {
      await writeAppMacaroon(packageId, Buffer.from(hex, 'hex'))
    } catch (e) {
      await lncli(effects, 'app-revoke', ['deletemacaroonid', rootKeyId]).catch(
        () => {},
      )
      throw e
    }

    const grants = (await storeJson.read((s) => s.appGrants).once()) ?? []
    const previous = grants.find((g) => g.packageId === packageId)
    await storeJson.merge(effects, {
      appGrants: [
        ...grants.filter((g) => g.packageId !== packageId),
        {
          packageId,
          rootKeyId,
          permissions: granted,
          label,
          createdAt: new Date().toISOString(),
        },
      ],
    })

    let replaced = ''
    if (previous) {
      try {
        await lncli(effects, 'app-revoke', [
          'deletemacaroonid',
          previous.rootKeyId,
        ])
        replaced = i18n('The access it had before is revoked.')
      } catch (e) {
        replaced = i18n(
          'Its previous macaroon could not be revoked (${error}); Revoke Macaroons revokes it.',
          { error: literal(String(e instanceof Error ? e.message : e)) },
        )
      }
    }

    return {
      version: '1',
      title: i18n('Grant an App Access'),
      message: [
        i18n(
          "${id} can now: ${list}. Its macaroon is at apps/${id}/access.macaroon in Lightning Fork's main volume, which it mounts read-only. Revoke App Access takes it back.",
          {
            id: literal(packageId),
            list: literal(granted.join(', ')),
          },
        ),
        replaced,
      ]
        .filter(Boolean)
        .join(' '),
      result: {
        type: 'group',
        value: granted.map((p) => ({
          name: p,
          description: null,
          type: 'single' as const,
          value: describe(p),
          copyable: false,
          qr: false,
          masked: false,
        })),
      },
    }
  },
)

// Hidden while nothing is granted.
export const revokeAppAccess = sdk.Action.withInput(
  // id
  'revoke-app-access',

  // metadata
  async ({ effects }) => ({
    name: i18n('Revoke App Access'),
    description: i18n(
      "Take back an app's macaroon: it stops working at once, and its file is removed. The app can ask again.",
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('App Access'),
    visibility: (await storeJson.read((s) => s.appGrants.length).const(effects))
      ? 'enabled'
      : 'hidden',
  }),

  // form input specification
  InputSpec.of({
    packageId: Value.dynamicSelect(async ({ effects }) => {
      const grants =
        (await storeJson.read((s) => s.appGrants).const(effects)) ?? []
      return {
        name: i18n('App'),
        description: i18n(
          'Package id, label, what it may do, and when it was granted.',
        ),
        values: Object.fromEntries(
          grants.map((g) => [
            g.packageId,
            `${g.packageId}${g.label ? ` "${g.label}"` : ''}: ${g.permissions.join(', ')} (${g.createdAt.slice(0, 10)})`,
          ]),
        ),
        default: grants[0]?.packageId ?? '',
      }
    }),
  }),

  // optionally pre-fill the input form
  async () => ({}),

  // the execution function
  async ({ effects, input }) => {
    const grants = (await storeJson.read((s) => s.appGrants).once()) ?? []
    const grant = grants.find((g) => g.packageId === input.packageId)
    if (!grant) throw new Error(i18n('No such grant.'))
    await requireRpc()

    await lncli(effects, 'app-revoke', ['deletemacaroonid', grant.rootKeyId])
    await removeAppDir(grant.packageId)
    await storeJson.merge(effects, {
      appGrants: grants.filter((g) => g !== grant),
    })

    return {
      version: '1',
      title: i18n('Revoke App Access'),
      message: i18n(
        '${id} can no longer use its macaroon, and apps/${id}/ is removed.',
        { id: literal(grant.packageId) },
      ),
      result: null,
    }
  },
)
