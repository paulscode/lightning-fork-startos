import { readFile } from 'node:fs/promises'
import { T, utils } from '@start9labs/start-sdk'

// Long enough for any node to write its cookie after starting: bitcoind
// writes it as its RPC server starts, before it loads the chain.
const COOKIE_GRACE_MS = 120_000

type Status = Awaited<ReturnType<T.Effects['getStatus']>>

/** A package's last start time. A stop is not a change. */
class DependencyStart extends utils.Watchable<Status, string | null> {
  protected readonly label = 'DependencyStart'

  constructor(
    effects: T.Effects,
    readonly packageId: string,
  ) {
    super(effects, {
      map: (status) => status?.started ?? null,
      eq: (prev, next) => next === null || prev === next,
    })
  }

  protected fetch(callback?: () => void) {
    return this.effects.getStatus({ packageId: this.packageId, callback })
  }
}

/**
 * Restarts main when a node whose cookie is read through `cookiePath` starts
 * again and no new cookie appears there.
 *
 * A dependency's volume is mounted once per run of main. A failed install of
 * the node restores its volume by renaming the backup into place, and the
 * mount keeps the directory it was made from, so the node's new cookie never
 * shows through it and LND dials with stale credentials until main runs
 * again. An ordinary restart writes a new cookie that does show, well within
 * the grace: for the main node it reruns main, which ends this watch with the
 * context, and for the bridge's SHA256 node its own shell restarts lnd.
 */
export async function restartOnStaleMount(
  effects: T.Effects,
  packageId: string,
  cookiePath: string,
) {
  const read = () => readFile(cookiePath, 'utf8').catch(() => null)
  let seen = await read()
  let first = true
  new DependencyStart(effects, packageId).onChange(async (started) => {
    if (first || !started) {
      first = false
      return { cancel: false }
    }

    await new Promise((resolve) => setTimeout(resolve, COOKIE_GRACE_MS))
    if (!effects.isInContext) return { cancel: true }

    // Still on the same start: a node that went down again in the meantime
    // writes its cookie when it is back, and stopping LND while its node is
    // down hangs the shutdown.
    const now = await effects.getStatus({ packageId })
    if (now?.started !== started) return { cancel: false }

    const cookie = await read()
    if (cookie && cookie !== seen) {
      seen = cookie
      return { cancel: false }
    }

    console.info(
      `${packageId} started at ${started} and its new RPC cookie has not ` +
        'reached this service; restarting to mount its data again',
    )
    await effects.restart()

    return { cancel: true }
  })
}
