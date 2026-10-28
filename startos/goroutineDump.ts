/**
 * A Go goroutine dump (/debug/pprof/goroutine?debug=2), folded so that
 * goroutines with the same stack are printed once, with how many there are,
 * their states and how long each has waited, and their ids. A busy lnd has
 * hundreds of goroutines, most of them alike (one set per peer), and the
 * dump goes into the service log, which a flood of lines can cut short. The
 * first goroutine of each group keeps its stack as captured, arguments and
 * all; only the grouping ignores the arguments and the creator's goroutine
 * id, which differ between otherwise identical goroutines.
 *
 * Imports nothing, so it can be tried on a dump outside the package.
 */
export function foldGoroutines(dump: string): {
  goroutines: number
  lines: string[]
} {
  const groups = new Map<
    string,
    { ids: string[]; states: Map<string, number>; stack: string[] }
  >()
  const other: string[] = []
  let goroutines = 0
  for (const block of dump.replace(/\r/g, '').split(/\n\s*\n/)) {
    const [head, ...frames] = block.split('\n').filter((l) => l.length > 0)
    const m = head?.match(/^goroutine (\d+) \[(.*)\]:$/)
    if (!m) {
      if (head) other.push(head, ...frames)
      continue
    }
    goroutines++
    const key = frames
      .map((f) =>
        f.startsWith('\t')
          ? f
          : f.replace(/ in goroutine \d+$/, '').replace(/\([^()]*\)$/, '(...)'),
      )
      .join('\n')
    let g = groups.get(key)
    if (!g) {
      g = { ids: [], states: new Map(), stack: frames }
      groups.set(key, g)
    }
    g.ids.push(m[1])
    g.states.set(m[2], (g.states.get(m[2]) ?? 0) + 1)
  }

  const lines: string[] = [
    `${goroutines} goroutines, ${groups.size} distinct stacks`,
  ]
  for (const g of groups.values()) {
    const states = [...g.states]
      .map(([s, n]) => (n > 1 ? `[${s}] x${n}` : `[${s}]`))
      .join(', ')
    const ids =
      g.ids.length > 20
        ? `${g.ids.slice(0, 20).join(' ')} and ${g.ids.length - 20} more`
        : g.ids.join(' ')
    lines.push('', `${g.ids.length} x ${states}, ids ${ids}`, ...g.stack)
  }
  if (other.length) lines.push('', ...other)
  return { goroutines, lines }
}
