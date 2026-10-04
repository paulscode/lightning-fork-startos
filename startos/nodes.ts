import { T } from '@start9labs/start-sdk'
import {
  Chain,
  chainOfVersion,
  NodePackageId,
  nodePackageIds,
} from './nodeChain'
import { i18n } from './i18n'
import { sdk } from './sdk'
import { literal } from './utils'

export { chainOfVersion, nodePackageIds } from './nodeChain'
export type { Chain, NodePackageId } from './nodeChain'

export type NodeState = {
  id: NodePackageId
  installed: boolean
  version: string | null
  chain: Chain
}

/** Which node packages are installed, at what version, on which chain. */
export async function surveyNodes(
  effects: T.Effects,
): Promise<Record<NodePackageId, NodeState>> {
  const installed: string[] = await effects
    .getInstalledPackages()
    .catch(() => [])
  const out = {} as Record<NodePackageId, NodeState>
  for (const id of nodePackageIds) {
    let version: string | null = null
    if (installed.includes(id)) {
      try {
        version = await sdk
          .getServiceManifest(effects, id, (m) => m?.version ?? null)
          .once()
      } catch {
        version = null
      }
    }
    out[id] = {
      id,
      installed: installed.includes(id),
      version,
      chain: installed.includes(id) ? chainOfVersion(id, version) : 'unknown',
    }
  }
  return out
}

/**
 * What a node package is called once installed: `bitcoind` is several
 * packages, and a form that says "Bitcoin Knots" of a Bitcoin Core node
 * misleads. Other packages keep their title.
 */
export function nodeTitle(fallback: string, s: NodeState): string {
  if (s.id !== 'bitcoind' || !s.installed || !s.version) return fallback
  if (/^[0-9]/.test(s.version)) return 'Bitcoin Core'
  if (s.version.startsWith('#knotssha:')) return 'Bitcoin Knots SHA256'
  return fallback
}

/** A node package as a choice in a form: its name and what is known of it. */
export function nodeLabel(title: string, s: NodeState): string {
  const name = literal(nodeTitle(title, s))
  if (!s.installed) return i18n('${name}: not installed', { name })
  if (s.chain === 'blake2b')
    return i18n('${name}: installed, on the BLAKE2b chain', { name })
  if (s.chain === 'sha256')
    return i18n('${name}: installed, on the SHA256 chain', { name })
  return i18n('${name}: installed; its chain is checked when it starts', {
    name,
  })
}
