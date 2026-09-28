import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:9',
  releaseNotes: {
    en_US: `The coordinated upgrade of Lightning on this chain. Lightning Fork and privkeyio's Core Lightning (from v26.06.8-blake2b.5) now mark themselves with the feature bits both projects agreed on. Updated nodes connect to each other; they do not connect to nodes that have not updated, in either direction. Update at the agreed time, Monday 28 September 2026 at 23:00 UTC, or as soon as you can after it.

You do not need to close any channels. The first start converts the node's channel database once, and every open channel carries over, including one that is still closing. A channel whose peer has not updated yet shows as inactive, and becomes active again as soon as that peer updates. Do not force close a channel only because it is inactive right after the update. In the hour before you update, avoid sending or routing payments, so that none is still pending while your peers are updating too.

The conversion cannot be undone. Once this version has started, an earlier version refuses to start on the same data, so there is no going back to it.

Invoices and offers created before this update can no longer be paid. Offers are switched off automatically on the first start and show as disabled. Create new ones, and if a mining pool pays you to an offer, give the pool the new offer's string.

This version also follows the chain's temporary long coinbase maturity rule, which raises the wait on newly mined coins from 100 blocks to 6480, roughly 45 days. It does not affect channels that are already open. A channel funded directly by a coinbase transaction is no longer treated as usable after 100 confirmations: it waits the full 6480, because a commitment or a close spending that output would not relay before then. This node's own wallet still offers freshly mined coins after 100 confirmations, because its coin selection lives in a dependency this release does not replace. If you fund a channel or send on-chain from coins mined in the last 45 days, the transaction is refused when it is broadcast. Nothing is lost, but the operation fails, so keep freshly mined coins out of this node's wallet. If you run the Bitcoin node this connects to, update it as well: a node without the rule accepts blocks that updated nodes reject.

Lightning Fork 0.21.3-beta-blake2b.12, dashboard 1.3.2-blake2b.11.`,
  },
  migrations: {
    up: async () => {},
  },
})
