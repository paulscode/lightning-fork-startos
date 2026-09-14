import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:5',
  releaseNotes: {
    en_US: `Pay through any blinded path, including one that starts at this node. A node that is its payee's channel peer, the common case on a small chain, could not pay a BOLT 11 invoice with blinded paths or a BOLT 12 invoice; the router now processes its own hop and pays on, splitting the payment into parts when it has to. Route queries through such paths work the same way. A node whose only peer has no other channel can now be paid to its offers too: when no peer can start an invoice's payment path, the path starts at the node itself.

The dashboard mints and pays offers. Receive has an Invoice / Reusable offer switch: an offer needs no amount, can be paid any number of times, and is the payout address a pool that pays to offers asks for. Send takes an offer next to an invoice, fetches an invoice for it, shows what will be paid and asks for the amount when the offer leaves it open. A Lightning offers page off the wallet menu lists every offer with its QR code and payments, and disables or enables it.

Lightning Fork 0.21.3-beta-blake2b.8, dashboard 1.3.2-blake2b.10.`,
  },
  migrations: {
    up: async () => {},
  },
})
