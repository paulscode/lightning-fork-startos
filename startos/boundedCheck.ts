import type { healthFns } from '@start9labs/start-sdk'
import { i18n } from './i18n'

type Result = healthFns.HealthCheckResult

/**
 * How long one run of a health check may take before it is treated as
 * unanswered. The longest legitimate run is sync-progress when the Bitcoin
 * node serves headers but not blocks: lncli getinfo (25 s), then the block
 * probe (getbestblock and getblock, capped at 120 s together), then a
 * notification. Three minutes covers that with room to spare, so it only runs
 * out on a call that is not coming back. It is not a limit on LND: nothing is
 * killed, and LND's own shutdown keeps its separate timeout.
 */
export const CHECK_TIMEOUT_MS = 180_000

/**
 * How many runs in a row may go unanswered while the check keeps showing its
 * last real result. Anything but `success` pauses every daemon that
 * `requires` the check, so one slow answer must not stop them; a check
 * that stays unanswered must still say so.
 */
export const STALE_REPEATS = 2

/**
 * Wrap a health check's `fn` so a run that never returns cannot wedge it.
 *
 * Why this exists: start-sdk's `HealthDaemon.runHealthCheckLoop` awaits `fn()`
 * with no limit and only looks at its abort signal once `fn()` returns. When a
 * service stops, `Daemons` terms entries one by one in dependency order
 * (`_term`, and `stopEntries` when it reconciles), every check before the daemon it requires, and each term waits
 * for that loop to end. So one `fn()` that never returns freezes its check at
 * "Starting" for the life of the service, and later blocks every stop, update
 * and restart before the daemon it requires is ever signalled. In Bitcoin
 * Knots (BLAKE2b) Companion that left the node running while an update sat at
 * "Installing 80%" and the OS Restart hung (knots-blake2b-startos#4). The same
 * SDK loop runs this package's checks, LND's own readiness included. It can
 * happen even though `SubContainer.exec` has a 30 s timeout of its own: that
 * timer is armed only after `exec` has waited, without a limit, for its file
 * mounts to sync.
 *
 * At most one run is outstanding. If the previous one is still pending when
 * the check fires again, this waits on that run again rather than starting
 * another, so a call that never returns costs one pending promise, not one a
 * minute.
 */
export function bounded(
  fn: () => Result | Promise<Result>,
  onTimeout: () => Result,
  ms: number = CHECK_TIMEOUT_MS,
): () => Promise<Result> {
  let inFlight: Promise<Result> | null = null
  let last: Result | null = null
  let misses = 0

  return async () => {
    if (!inFlight) {
      const run = Promise.resolve()
        .then(fn)
        .finally(() => {
          if (inFlight === run) inFlight = null
        })
      inFlight = run
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms)
    })
    try {
      // The race also handles the run, so if it is abandoned here and rejects
      // later there is no unhandled rejection to take down the runtime.
      const res = await Promise.race([inFlight, timedOut])
      if (res !== null) {
        misses = 0
        last = res
        return res
      }
    } catch (e) {
      // A thrown fn is the SDK's to report, exactly as before.
      misses = 0
      last = null
      throw e
    } finally {
      clearTimeout(timer)
    }

    misses += 1
    console.warn(
      `health check run unanswered after ${ms / 1000}s (${misses} in a row)`,
    )
    if (last && misses <= STALE_REPEATS) return last
    return onTimeout()
  }
}

// What a health check shows when a run of it has not finished in time:
// starting, never failure, so a slow answer does not read as a fault. The
// check shows its result again once that run finishes.
export const unanswered = () => ({
  result: 'starting' as const,
  message: i18n('This check has not finished after 3 minutes'),
})
