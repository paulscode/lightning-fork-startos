# Lightning Fork

Lightning Fork is a Lightning Network node for the **Bitcoin BLAKE2b chain**,
the Bitcoin Knots hard fork of 30 August 2026. It is LND with the changes needed
to follow that chain and to stay away from the Bitcoin Lightning network. If you
have used LND on StartOS, everything below will look familiar.

## Before you start

You need a Bitcoin node on the BLAKE2b chain running on this server. Two
qualify:

- **Bitcoin Knots**: the official Bitcoin package in its Knots flavor,
  version 29.4.1 or later.
- **Bitcoin Knots (BLAKE2b) Companion**: a pruned node that fits beside a
  Bitcoin node on the other chain.

A Bitcoin Core node, or a Knots node older than 29.4.1, is on the other
chain. Lightning Fork will not start against it; the **Chain Identity** health
check will say so in words.

## Setup

1. Install and start your BLAKE2b node and let it sync.
2. Install Lightning Fork. Two critical tasks appear: **Initialize Wallet**
   creates your wallet, and **Select Node** asks which Bitcoin node to use.
   Complete both. A third, **Configure Channel Backups**, can wait. The node
   you chose gets a task of its own to turn on ZMQ; accept it.
3. Start the service. The **Chain Identity** health check goes to *waiting*
   while the node is still syncing to block 961640, then to *On the Bitcoin
   BLAKE2b chain*. Then the usual chain and graph sync follows.

If Chain Identity reports a refusal, open **Select Node** and choose a node on
the BLAKE2b chain.

## Using your node

Connect a wallet or dashboard with the LND Connect interfaces exactly as you
would to LND: the API, macaroons and certificates are the same. Two things
differ from an LND node on Bitcoin:

- **Invoices start with `lnblake`** instead of `lnbc`. A Bitcoin wallet will
  refuse them, and Lightning Fork refuses `lnbc` invoices. That is intended: it
  is the last line of defence against paying the wrong chain.
- **Peers must be on the BLAKE2b chain.** Lightning Fork drops any peer that
  does not say it serves this chain, so an ordinary LND node will not stay
  connected. Open channels with other Lightning Fork nodes (or other
  implementations that follow this chain).

## Dashboard

The **Dashboard** interface is a web page for everyday use: the on-chain and
Lightning wallets with send and receive, channels with open and close,
transaction history, and the node's status and sync. It is the Umbrel
Lightning app's dashboard, forked for this chain and trimmed to what StartOS
does not already do; wallet setup, LND settings, backups and connection
strings stay in StartOS.

It opens on a sign-in screen that asks for one password, generated when the
service was installed. The **Dashboard Password** action shows it, masked,
with a copy button; **Set Dashboard Password** replaces it with one of your
own or a freshly generated one, effective at once. A session lasts twelve
hours, and **Sign out** is in the dashboard's menu. Fiat amounts are BTCB2's own price from
neoxa.exchange, converted to other currencies through Coingecko's rate table;
while a feed is unreachable the dashboard shows sats or BTC instead.

## Funds and replay

Coins that existed before block 961640 exist on both chains. Everything
Lightning Fork signs on its own uses the chain's replay-protected signature
type, so its transactions cannot be mirrored on the other chain. A channel
funded before that protection arrived, or with a signature made elsewhere, is
the exception; the node warns about channels funded before the fork. Prefer
funding channels with coins you received after the split, and keep amounts
modest: this chain is weeks old.

## Backups

Make a StartOS backup after every channel open or close, and consider
**Configure Channel Backups** for a continuous off-server copy. Restoring a
backup closes the channels it contains and returns the funds on-chain, as with
LND. A backup taken from an LND node on Bitcoin cannot be restored here.
