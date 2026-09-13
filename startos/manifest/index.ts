import { setupManifest } from '@start9labs/start-sdk'
import {
  depBitcoindDescription,
  depCompanionDescription,
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
  volumes: ['main'],
  images: {
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
    'knots-blake2b': {
      description: depCompanionDescription,
      optional: true,
      metadata: {
        title: 'Bitcoin Knots (BLAKE2b) Companion',
        icon: 'https://raw.githubusercontent.com/paulscode/knots-blake2b-startos/main/dep-icon.png',
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
