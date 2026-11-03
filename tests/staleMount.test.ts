// A node that starts again without its new cookie reaching this service.
//   npx tsx --test tests/staleMount.test.ts
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DependencyStart, restartOnStaleMount } from '../startos/staleMount'

const GRACE = 30_000
const CHECK = 'node'

const settle = () => new Promise((r) => setImmediate(r))
const flush = async () => {
  for (let i = 0; i < 50; i++) await settle()
}

// Runs the grace out, again and again for a while of real time: the watch
// reaches its timer only after real file reads, so a single tick can come
// before the timer exists. Stops early once the service has been restarted.
async function runOutGrace(e: { restarts: number }, ms = 500) {
  const end = Date.now() + ms
  while (Date.now() < end && e.restarts === 0) {
    mock.timers.tick(GRACE)
    await settle()
  }
}

type Status = {
  started: string | null
  health: Record<string, { result: string }>
} | null

const up = (started: string, ready = true): Status => ({
  started,
  health: { [CHECK]: { result: ready ? 'success' : 'starting' } },
})

// Calls back on every change, health included, as StartOS does.
function fakeEffects(status: Status) {
  let callbacks: Array<() => void> = []
  const leave: Array<() => void> = []
  const effects = {
    isInContext: true,
    restarts: 0,
    onLeaveContext: (fn: () => void) => leave.push(fn),
    getStatus: async (opts: { callback?: () => void }) => {
      if (opts.callback) callbacks.push(opts.callback)
      return status
    },
    restart: async () => {
      effects.restarts++
      return null
    },
    set(s: Status) {
      status = s
      const cbs = callbacks
      callbacks = []
      cbs.forEach((cb) => cb())
    },
    leave() {
      effects.isInContext = false
      leave.forEach((fn) => fn())
    },
  }
  return effects
}

function cookieFile(content: string | null) {
  const path = join(mkdtempSync(join(tmpdir(), 'stale-')), '.cookie')
  if (content !== null) writeFileSync(path, content)
  return path
}

type Fx = ReturnType<typeof fakeEffects>

async function scenario(
  initial: Status,
  act: (e: Fx, cookie: string) => Promise<void>,
  cookie: string | null = 'user:one',
) {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const e = fakeEffects(initial)
    const path = cookieFile(cookie)
    await restartOnStaleMount(e as any, 'knots-blake2b', CHECK, path)
    await flush()
    await act(e, path)
    await runOutGrace(e)
    return e.restarts
  } finally {
    mock.timers.reset()
  }
}

// The node restarts: down, up but not ready, then ready.
async function restartNode(e: Fx) {
  e.set(null)
  await flush()
  e.set(up('t2', false))
  await flush()
  e.set(up('t2'))
  await flush()
}

test('a node ready again whose new cookie never shows here restarts the service', async () => {
  assert.equal(await scenario(up('t1'), restartNode), 1)
})

test('a new cookie seen through the mount restarts nothing', async () => {
  assert.equal(
    await scenario(up('t1'), async (e, cookie) => {
      e.set(up('t2', false))
      await flush()
      writeFileSync(cookie, 'user:two')
      e.set(up('t2'))
      await flush()
    }),
    0,
  )
})

test('a node that never gets ready is waited for', async () => {
  assert.equal(
    await scenario(up('t1'), async (e) => {
      e.set(up('t2', false))
      await flush()
    }),
    0,
  )
})

test('a node no longer ready when the grace ends is waited for', async () => {
  assert.equal(
    await scenario(up('t1'), async (e) => {
      await restartNode(e)
      e.set(up('t2', false))
      await flush()
    }),
    0,
  )
})

test('main having run again already restarts nothing', async () => {
  assert.equal(
    await scenario(up('t1'), async (e) => {
      await restartNode(e)
      e.leave()
    }),
    0,
  )
})

test('the start main began with restarts nothing, ready or not', async () => {
  assert.equal(await scenario(up('t1'), async () => {}), 0)
  assert.equal(
    await scenario(up('t1', false), async (e) => {
      e.set(up('t1'))
      await flush()
    }),
    0,
  )
})

test('a node down when main started, then ready with no cookie here, restarts the service', async () => {
  assert.equal(
    await scenario(
      null,
      async (e) => {
        e.set(up('t2'))
        await flush()
      },
      null,
    ),
    1,
  )
})

test('a start time changes on a ready start, not on a stop or a health change', async () => {
  const e = fakeEffects(up('2026-11-03T01:00:00Z'))
  const seen: Array<number | null> = []
  new DependencyStart(e as any, 'bitcoind', CHECK).onChange(async (v) => {
    seen.push(v ?? null)
    return { cancel: false }
  })
  await flush()
  e.set(up('2026-11-03T01:00:00Z', false))
  await flush()
  e.set(null)
  await flush()
  // Started, but its RPC not ready yet: what uses it waits.
  e.set(up('2026-11-03T02:00:00Z', false))
  await flush()
  assert.deepEqual(seen, [Date.parse('2026-11-03T01:00:00Z')])
  e.set(up('2026-11-03T02:00:00Z'))
  await flush()
  e.leave()
  e.set(null)
  await flush()
  assert.deepEqual(seen, [
    Date.parse('2026-11-03T01:00:00Z'),
    Date.parse('2026-11-03T02:00:00Z'),
  ])
})
