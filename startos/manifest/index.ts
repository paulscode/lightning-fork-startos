import { setupManifest } from '@start9labs/start-sdk'
import {
  depBitcoindDescription,
  depCompanionDescription,
  depSha256Description,
  depMempoolDescription,
  depMempoolPrunedDescription,
  depTorDescription,
  long,
  short,
} from './i18n'

export const manifest = setupManifest({
  id: 'lightning-fork',
  title: 'Lightning Fork',
  license: 'MIT',
  packageRepo: 'https://github.com/paulscode/lightning-fork-startos',
  upstreamRepo: 'https://github.com/paulscode/lightning-fork',
  marketingUrl: 'https://github.com/paulscode/lightning-fork',
  donationUrl: null,
  description: { short, long },
  // `dashboard` holds the dashboard's own small state (password, settings)
  // and copies of the two LND files it needs (tls.cert, admin.macaroon), so
  // the dashboard container mounts nothing of LND's: the SDK does not honour
  // `readonly` on a package's own volumes.
  volumes: ['main', 'dashboard'],
  images: {
    dashboard: {
      // The Umbrel Lightning app's web UI, forked for this chain and run in
      // its StartOS mode (github.com/paulscode/umbrel-lightning-fork). Pulled
      // by tag at pack time, not by digest: a universal pack pulls the image
      // for both architectures, and Docker cannot hold one digest reference
      // for two platforms ("cannot overwrite digest"). The tag is never moved
      // once published. What it resolved to when this version was released,
      // to compare with `docker buildx imagetools inspect <tag>`:
      //   index sha256:DASHBOARD_IMAGE_DIGEST
      // The Makefile refuses to pack while a digest placeholder is in
      // place, for a future edit that forgets this line.
      source: {
        dockerTag: 'paulscode/umbrel-lightning-fork:1.3.2-blake2b.18',
      },
      arch: ['aarch64', 'x86_64'],
    },
    // The bridge's own SHA256 Lightning node: the official lnd image,
    // unmodified, pinned by tag (see the dashboard image above for why not
    // by digest). Every change this fork makes is one that must not apply
    // on the SHA256 chain, so that node runs upstream's binary. What the tag
    // resolved to when this version was released:
    //   index sha256:04d06edcc0f6e99a5e797ea34959f330add222226f840cd86afbc31f8f29627d
    'sha256-lnd': {
      source: {
        dockerTag: 'lightninglabs/lnd:v0.21.4-beta',
      },
      arch: ['aarch64', 'x86_64'],
    },
    lnd: {
      // Built from ./Dockerfile: Lightning Fork from a pinned commit of
      // github.com/paulscode/lightning-fork, plus lndinit and the sqlite3 CLI
      // used by wallet setup and the bolt → SQLite migration
      // (startos/sqliteBackend.ts).
      source: {
        dockerBuild: {},
      },
      arch: ['aarch64', 'x86_64'],
    },
  },
  // Both nodes are optional here and exactly one is returned as required from
  // dependencies.ts, chosen by the user. Declaring the official package
  // mandatory would demand it of someone running the companion.
  dependencies: {
    bitcoind: {
      description: depBitcoindDescription,
      optional: true,
      metadata: {
        title: 'Bitcoin Knots',
        icon: 'https://raw.githubusercontent.com/Start9Labs/bitcoin-core-startos/feec0b1dae42961a257948fe39b40caf8672fce1/dep-icon.svg',
      },
    },
    // The SHA256 chain, for the Lightning node the bridge runs there (see
    // sha256Node.ts). Only ever required while that node runs.
    'knots-prerdts': {
      description: depSha256Description,
      optional: true,
      metadata: {
        title: 'Bitcoin Knots (SHA256) Companion',
        icon: 'https://raw.githubusercontent.com/paulscode/knots-prerdts-startos/main/icon.png',
      },
    },
    'knots-blake2b': {
      description: depCompanionDescription,
      optional: true,
      metadata: {
        title: 'Bitcoin Knots (BLAKE2b) Companion',
        icon: 'https://raw.githubusercontent.com/paulscode/knots-blake2b-startos/main/dep-icon.png',
      },
    },
    // Either Mempool app, when installed, feeds the dashboard's fee rates
    // and transaction links; neither is ever required.
    mempool: {
      description: depMempoolDescription,
      optional: true,
      metadata: {
        title: 'Mempool',
        icon: 'https://raw.githubusercontent.com/Start9Labs/mempool-startos/master/icon.svg',
      },
    },
    'mempool-pruned': {
      description: depMempoolPrunedDescription,
      optional: true,
      metadata: {
        title: 'Mempool Pruned',
        icon: 'https://raw.githubusercontent.com/paulscode/mempool-pruned-startos/master/icon.png',
      },
    },
    tor: {
      description: depTorDescription,
      optional: true,
      metadata: {
        title: 'Tor',
        icon: 'https://raw.githubusercontent.com/Start9Labs/tor-startos/65faea17febc739d910e8c26ff4e61f6333487a8/icon.svg',
      },
    },
  },
})
