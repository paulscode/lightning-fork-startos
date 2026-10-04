/**
 * The chain node packages a server may have installed, and which chain each
 * follows, as far as its version says.
 *
 * People run both chains in one of two ways: their main node (the official
 * `bitcoind` package) on one chain and a companion on the other, or both as
 * companions. The forms that ask for a node use this to put the right one
 * first and to say what each installed one is, so that choosing is a matter
 * of recognising one's own setup rather than knowing package ids.
 *
 * A guess from the version, never the final word: Lightning Fork checks the
 * chain of the node it reads when it starts (the Chain Identity health
 * check), and the bridge checks its SHA256 node's before using it. So
 * "unknown" is offered with that said, and only a clear mismatch is refused.
 */
export type Chain = 'blake2b' | 'sha256' | 'unknown'

/** The packages that can be a chain node for either side. */
export const nodePackageIds = [
  'bitcoind',
  'knots-blake2b',
  'knots-prerdts',
] as const
export type NodePackageId = (typeof nodePackageIds)[number]

/**
 * The chain a package version follows.
 *
 * - The companions follow one chain each, whatever their version.
 * - `bitcoind` is several packages under one id, told apart by the version's
 *   flavor: unflavored is Bitcoin Core; `#knotssha` and `#knotsprerdts` are
 *   the Knots builds for the SHA256 chain; `#knots` is Bitcoin Knots, which
 *   follows the BLAKE2b chain from 29.4.1 (29.4 is the RDTS build, which
 *   follows neither chain this package uses).
 */
export function chainOfVersion(
  id: NodePackageId,
  version: string | null,
): Chain {
  if (id === 'knots-blake2b') return 'blake2b'
  if (id === 'knots-prerdts') return 'sha256'
  if (!version) return 'unknown'

  const m = version.match(/^(?:#([a-z0-9-]+):)?([0-9][0-9.]*)/i)
  if (!m) return 'unknown'
  const flavor = (m[1] ?? '').toLowerCase()
  const upstream = m[2].split('.').map((n) => Number(n) || 0)

  if (flavor === '') return 'sha256'
  if (flavor === 'knotssha' || flavor === 'knotsprerdts') return 'sha256'
  if (flavor === 'knots') {
    if (atLeast(upstream, [29, 4, 1])) return 'blake2b'
    if (!atLeast(upstream, [29, 4])) return 'sha256'
  }
  return 'unknown'
}

function atLeast(v: number[], min: number[]): boolean {
  for (let i = 0; i < min.length; i++) {
    const a = v[i] ?? 0
    if (a !== min[i]) return a > min[i]
  }
  return true
}

/** What a form knows of a node package: installed, and its chain. */
export type Seen = { installed: boolean; chain: Chain }

/**
 * The package to put first when asking for a node on `want`'s chain, from
 * `ids` and what is installed: the one already chosen while it still fits;
 * else an installed one on that chain; else an installed one whose chain is
 * not known; else what was chosen, or the first. `exclude` is never offered
 * first (the node the other side reads).
 */
export function suggestNode<Id extends string>(
  ids: readonly Id[],
  seen: Partial<Record<string, Seen>>,
  want: 'blake2b' | 'sha256',
  keep: Id | null,
  exclude: string | null = null,
): Id {
  const other = want === 'blake2b' ? 'sha256' : 'blake2b'
  const usable = ids.filter((id) => id !== exclude)
  const fits = (id: Id) => !!seen[id]?.installed && seen[id]?.chain !== other
  if (keep && usable.includes(keep) && fits(keep)) return keep
  const sure = usable.find(
    (id) => seen[id]?.installed && seen[id]?.chain === want,
  )
  if (sure) return sure
  const maybe = usable.find(
    (id) => seen[id]?.installed && seen[id]?.chain === 'unknown',
  )
  if (maybe) return maybe
  if (keep && usable.includes(keep)) return keep
  return usable[0] ?? ids[0]
}
