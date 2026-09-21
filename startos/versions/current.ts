import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:8',
  releaseNotes: {
    en_US: `Follows the chain's temporary long coinbase maturity rule, which raises the wait on newly mined coins from 100 blocks to 6480, roughly 45 days at a ten minute block target.

Your open channels are not affected and you do not need to close anything. A channel spends its funding output, not a coinbase, so the longer wait never touches it. What changes is a channel funded directly by a coinbase transaction, which this node used to treat as usable after 100 confirmations. It now waits the full 6480, because a commitment or a close spending that output would not have relayed before then, and a channel you cannot close on time is worse than one you cannot open yet.

One gap worth knowing about: this node's own wallet still offers freshly mined coins after 100 confirmations, because its coin selection lives in a dependency this release does not replace. If you fund a channel or send on-chain from coins mined in the last 45 days, the transaction will be refused when it is broadcast. Nothing is lost, but the operation fails. Until that is closed, keep freshly mined coins out of this node's wallet.

If you run the node this connects to, update it as well. A node without the rule will accept blocks that updated nodes reject.

Lightning Fork 0.21.3-beta-blake2b.10, dashboard 1.3.2-blake2b.11.`,
  },
  migrations: {
    up: async () => {},
  },
})
