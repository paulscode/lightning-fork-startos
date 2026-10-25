import { T, utils } from '@start9labs/start-sdk'
import { lstat, mkdir, rename, rm, writeFile } from 'fs/promises'
import { gRPCHostId, gRPCPort } from '../interfaces'
import { sdk } from '../sdk'
import { mainVolumeHost } from '../utils'

/**
 * Write through a temporary file and a rename, so a reader never sees a
 * truncated file: LND reading the pair as it starts, or main's watch on
 * tls.cert, which fires on a rename-replace too (the old file's inode
 * changes) and then reads the new file whole.
 */
export async function replaceFile(
  path: string,
  data: string | Uint8Array,
  mode: number,
): Promise<void> {
  const tmp = `${path}.tmp`
  await rm(tmp, { force: true })
  await writeFile(tmp, data, { mode, flag: 'wx' })
  await rename(tmp, path)
}

/** The folder dependents mount, read-only, for tls.cert and nothing else. */
export const publicDir = `${mainVolumeHost}/public`

/** Put a copy of tls.cert in public/. */
export async function writePublicCert(cert: string | Uint8Array) {
  await mkdir(publicDir, { recursive: true, mode: 0o755 })
  await replaceFile(`${publicDir}/tls.cert`, cert, 0o644)
}

/**
 * Issue the TLS pair for every address LND is reached at and write it to the
 * volume. Watched, not read once: the proxy dials the container by IP on
 * REST's internal leg, so a new container IP must reissue the cert or REST
 * goes dark. Also called by the `:12` update migration before the bolt →
 * SQLite conversion (versions/current.ts): the migration runs earlier in init
 * than this step, and the conversion pins its LND-facing curls to this cert
 * on 127.0.0.1 — a SAN pre-0.21 certs don't carry, which would wedge the
 * update until the conversion's timeout.
 */
export async function writeCerts(effects: T.Effects): Promise<void> {
  // gRPC is TLS passthrough, so every address a client dials has to be a SAN.
  // Read off the binding: an exported interface is only a view of its
  // addresses and vanishes with it. getSslCertificate signs only an IP the box
  // itself holds, which is what drops the WAN IPv4 — the router's, not ours.
  const served = await sdk.host
    .getOwn(effects, gRPCHostId, (host) =>
      host
        ? utils
            .filledAddress(host, {
              hostId: gRPCHostId,
              internalPort: gRPCPort,
              username: null,
              scheme: null,
              sslScheme: null,
              suffix: '',
            })
            .matchesAny([
              { visibility: 'private' },
              { exclude: { kind: 'ipv4' } },
            ])
            .filter({ exclude: { kind: ['localhost', 'link-local'] } })
            .hostnames.map((h) => h.hostname)
        : [],
    )
    .const()

  const hostnames = [
    await sdk.getContainerIp(effects).const(),
    '127.0.0.1',
    await sdk.getOsIp(effects),
    ...served,
  ]
  const cert = (await sdk.getSslCertificate(effects, hostnames).const()).join(
    '',
  )
  const key = await sdk.getSslKey(effects, { hostnames })
  // The key first: main restarts LND when tls.cert changes, and LND reads
  // both.
  await replaceFile(`${mainVolumeHost}/tls.key`, key, 0o600)
  await replaceFile(`${mainVolumeHost}/tls.cert`, cert, 0o644)
  // A dependent can start before main does: on a fresh install, an update
  // from a package without public/, or a restore, which leaves public/ out.
  // Init runs first, so it puts the copy there. Only when there is none:
  // refreshing it is main's public-tls-cert oneshot's, which runs as the
  // daemon starts with this cert. The cert watch that restarts main is not
  // armed while an import or a conversion is pending, so a copy written here
  // then could be ahead of the cert LND is serving until its next restart.
  const hasCopy = await lstat(`${publicDir}/tls.cert`).then(
    (st) => st.isFile(),
    () => false,
  )
  if (!hasCopy) await writePublicCert(cert)
}

export const setupCerts = sdk.setupOnInit(writeCerts)
