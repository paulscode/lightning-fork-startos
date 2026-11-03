import { readFile } from 'node:fs/promises'
import { T, utils } from '@start9labs/start-sdk'

// How long a node that says its RPC is ready may take to show its cookie
// through the mount. It writes the cookie before its RPC answers, so by then
// the cookie is in its data directory and a live mount shows it at once; this
// only covers the order in which the two are observed.
const COOKIE_GRACE_MS = 30_000

type Status = Awaited<ReturnType<T.Effects['getStatus']>>

/**
 * A package's last start time, as a number for use in a name, once its RPC
 * health check passes on that start. A package counts as started before its
 * node has written its cookie or opened its RPC port, and acting then would
 * stop what uses the node while it is down. A stop, or the check failing
 * later, is not a change, so a node going down restarts nothing; its next
 * start does, once ready.
 */
export class DependencyStart extends utils.Watchable<Status, number | null> {
  protected readonly label = 'DependencyStart'

  constructor(
    effects: T.Effects,
    readonly packageId: string,
    rpcCheck: string,
  ) {
    super(effects, {
      map: (status) =>
        status?.started && status.health?.[rpcCheck]?.result === 'success'
          ? Date.parse(status.started)
          : null,
      eq: (prev, next) => next === null || prev === next,
    })
  }

  protected fetch(callback?: () => void) {
    return this.effects.getStatus({ packageId: this.packageId, callback })
  }
}

/** A package's start and whether its RPC health check passes. */
class DependencyReady extends utils.Watchable<
  Status,
  { started: string | null; ready: boolean }
> {
  protected readonly label = 'DependencyReady'

  constructor(
    effects: T.Effects,
    readonly packageId: string,
    rpcCheck: string,
  ) {
    super(effects, {
      map: (status) => ({
        started: status?.started ?? null,
        ready: status?.health?.[rpcCheck]?.result === 'success',
      }),
      eq: (a, b) => a.started === b.started && a.ready === b.ready,
    })
  }

  protected fetch(callback?: () => void) {
    return this.effects.getStatus({ packageId: this.packageId, callback })
  }
}

/**
 * Restarts the service when the node whose cookie main reads through
 * `cookiePath` has started again and says its RPC is ready, but no new cookie
 * shows through the mount.
 *
 * A dependency's volume is mounted once per run of main. A failed install of
 * the node restores its volume by renaming the backup into place, and the
 * mount keeps the directory it was made from, so the node's new cookie never
 * shows through it and LND dials with stale credentials until main runs
 * again. The node's RPC check passing is the evidence: the node writes its
 * cookie before its RPC answers, so a live mount shows the new one by then,
 * and an ordinary restart reruns main through the cookie watch, which ends
 * this watch with its context. A node that never gets ready (crashing, out of
 * disk) is waited for, since stopping LND while its node is down hangs the
 * shutdown.
 */
export async function restartOnStaleMount(
  effects: T.Effects,
  packageId: string,
  rpcCheck: string,
  cookiePath: string,
) {
  const read = () => readFile(cookiePath, 'utf8').catch(() => null)
  const seen = await read()
  // The start main began with, whose cookie `seen` is (or is not yet).
  let checked: string | null | undefined
  new DependencyReady(effects, packageId, rpcCheck).onChange(async (now) => {
    if (checked === undefined) {
      checked = now?.started ?? null
      return { cancel: false }
    }
    if (!now?.started || !now.ready || now.started === checked)
      return { cancel: false }

    await new Promise((resolve) => setTimeout(resolve, COOKIE_GRACE_MS))
    if (!effects.isInContext) return { cancel: true }

    const cookie = await read()
    if (cookie && cookie !== seen) {
      // Shown, so the mount is live; the cookie watch reruns main.
      checked = now.started
      return { cancel: false }
    }
    const again = await effects.getStatus({ packageId })
    if (
      again?.started !== now.started ||
      again?.health?.[rpcCheck]?.result !== 'success'
    )
      return { cancel: false }

    console.info(
      `${packageId} started at ${now.started} and its RPC is ready, but ` +
        'its new RPC cookie has not reached this service; restarting to ' +
        'mount its data again',
    )
    await effects.restart()

    return { cancel: true }
  })
}
