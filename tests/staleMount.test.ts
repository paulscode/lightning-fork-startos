// A node that starts again without its new cookie reaching this service.
//   npx tsx --test tests/staleMount.test.ts
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { restartOnStaleMount } from '../startos/staleMount'

const GRACE = 120_000

// Lets queued promise callbacks and the watch loop run.
const settle = () => new Promise((r) => setImmediate(r))
const flush = async () => {
  for (let i = 0; i < 50; i++) await settle()
}

// Runs the grace out, again and again for a while of real time: the watch
// reaches its timer only after real file reads, so a single tick can come
// before the timer exists. Stops early once main has been restarted.
async function runOutGrace(e: { restarts: number }, ms = 500) {
  const end = Date.now() + ms
  while (Date.now() < end && e.restarts === 0) {
    mock.timers.tick(GRACE)
    await settle()
  }
}

function fakeEffects(started: string | null) {
  let status: { started: string | null } | null = { started }
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
    // Test controls.
    setStarted(s: string | null) {
      status = s === null ? null : { started: s }
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

function cookieFile(content: string) {
  const path = join(mkdtempSync(join(tmpdir(), 'stale-')), '.cookie')
  writeFileSync(path, content)
  return path
}

async function scenario(
  act: (e: ReturnType<typeof fakeEffects>, cookie: string) => void,
) {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const e = fakeEffects('t1')
    const cookie = cookieFile('user:one')
    await restartOnStaleMount(e as any, 'knots-blake2b', cookie)
    await flush()
    e.setStarted('t2')
    await flush()
    act(e, cookie)
    await runOutGrace(e)
    return e.restarts
  } finally {
    mock.timers.reset()
  }
}

test('a node that started again but whose cookie never changed here restarts main', async () => {
  assert.equal(await scenario(() => {}), 1)
})

test('a new cookie seen through the mount restarts nothing', async () => {
  assert.equal(
    await scenario((_, cookie) => writeFileSync(cookie, 'user:two')),
    0,
  )
})

test('a node that went down again within the grace is waited for', async () => {
  assert.equal(await scenario((e) => e.setStarted(null)), 0)
})

test('main having run again already restarts nothing', async () => {
  assert.equal(await scenario((e) => e.leave()), 0)
})

test('the start main began with restarts nothing', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const e = fakeEffects('t1')
    await restartOnStaleMount(e as any, 'knots-blake2b', cookieFile('u:1'))
    await runOutGrace(e)
    assert.equal(e.restarts, 0)
  } finally {
    mock.timers.reset()
  }
})
