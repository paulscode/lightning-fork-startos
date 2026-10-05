# Lightning Fork

Lightning Fork is a Lightning Network node for the **Bitcoin BLAKE2b chain**,
the Bitcoin Knots hard fork of 30 August 2026. It is LND with the changes needed
to follow that chain and to stay away from the SHA256 chain's Lightning network. If you
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

If **Network and Graph Sync Progress** reads *Bitcoin is not serving blocks
to LND*, LND has fallen behind the chain because your Bitcoin node cannot
hand it blocks: check that node and its logs. If it lasts, you also get a
notification. Until it clears, LND cannot see new blocks, which it needs to
protect your channels.

## Using your node

Connect a wallet or dashboard with the LND Connect interfaces exactly as you
would to LND: the API, macaroons and certificates are the same. Two things
differ from an LND node on the SHA256 chain:

- **Invoices and offers carry a required feature bit** (`option_blake2b`,
  bit 512). They still start with `lnbc` and `lno`, but a Lightning wallet on
  the SHA256 chain that follows the specification refuses them, and Lightning Fork
  refuses any invoice or offer without the bit. That is intended: it is the
  last line of defence against paying the wrong chain.
- **Peers must be on the BLAKE2b chain.** Lightning Fork sets the same bit in
  every peer handshake, and a node on the SHA256 chain disconnects when it sees it, so
  an ordinary LND node will not stay connected. Open channels with other
  Lightning Fork nodes, or with privkeyio's Core Lightning from
  v26.06.8-blake2b.5.

## Dashboard

The **Dashboard** interface is a web page for everyday use: the on-chain and
Lightning wallets with send and receive, channels with open and close,
transaction history, and the node's status and sync. It is the Umbrel
Lightning app's dashboard, forked for this chain and trimmed to what StartOS
does not already do; wallet setup, LND settings, backups and connection
strings stay in StartOS. **Peers**, in the menu or behind the peer count,
lists the nodes connected to yours and connects to another by its
`pubkey@host:port` without opening a channel, so that it can open one to you.

It opens on a sign-in screen that asks for one password, generated when the
service was installed. The **Dashboard Password** action shows it, masked,
with a copy button; **Set Dashboard Password** replaces it with one of your
own or a freshly generated one, effective at once. A session lasts twelve
hours, and **Sign out** is in the dashboard's menu. Fiat amounts are BTCB2's own price from
neoxa.exchange, converted to other currencies through Coingecko's rate table;
while a feed is unreachable the dashboard shows sats or BTC instead.

## Mobile app

The Lightning Fork app for Android shows your on-chain and Lightning
balances and sends and receives from your phone. To pair a phone, open the
dashboard's menu, choose **Mobile app**, then **Pair a phone**, and scan the
code with the app. The code works once and for five minutes. Each phone gets
a key of its own, listed under Mobile app with when it was last seen; remove
a phone there and it stops working at once.

At home the app reaches the dashboard on its LAN address, over HTTPS pinned
to this server's root certificate. Away from home it uses the dashboard's
onion address through its own built-in Tor, so the **Dashboard** interface
needs one, with **SSL off** (Tor already authenticates and encrypts the
connection). Either:

- run the task Lightning Fork shows after it is installed or updated, which
  opens Tor's **Add Onion Service** with the Dashboard selected and SSL off,
  and confirm it as it is; or
- open Lightning Fork's **Dashboard** interface in StartOS and add a Tor
  (onion) address there, with SSL off.

The task needs the Tor service installed, and goes away once the Dashboard
has an onion address. The dashboard's **Mobile app** screen says whether
away-from-home use is set up. A phone paired before the onion existed picks
it up the next time it reaches the node at home; there is no need to pair
again.

Phones pin this server's root certificate. After restoring the service to
another server (or after StartOS gives this one a new root), paired phones
say the node's certificate changed: pair them again, and remove the old
entries under Mobile app.

## Funds and replay

Coins that existed before block 961640 exist for nodes that have not upgraded
too. Everything Lightning Fork signs on its own, including the funding of a
channel it opens, uses the replay-protected signature type, so its
transactions cannot be copied to those nodes, whatever coins they spend. A
channel funded before block 961640, or with a signature made elsewhere, is
the exception; the node warns at start about channels funded before it. Keep
amounts modest: this chain is weeks old.

## Watchtowers

A watchtower watches your channels while your node is offline and acts if a
peer tries to cheat. From 0.21.3-beta-blake2b.14 a Lightning Fork node only
works with towers that run Lightning Fork 0.21.3-beta-blake2b.14 or later; a
stock LND tower, or an earlier release, refuses it. So towers are run by
Lightning Fork users for each other.

- **Run one:** **Watchtower Server** turns the tower on and picks the
  address it is reached at: its Tor onion, a public address, or a LAN address
  for nodes on your own network. **Watchtower Server Info** then shows the URI
  to give to others. If that address changes, the tower follows it; give the
  new URI to anyone using it.
- **Use others':** **Watchtower Client Settings** turns the client on and
  takes the URIs you were given. A tower removed from that list is removed
  from LND at its next start.
- **Check:** **Watchtowers** lists the towers in use. Each shows how many
  sessions it holds; one with no session has not accepted your node, which is
  what an incompatible tower looks like.

## Running a bridge

A bridge lets people you choose pay Lightning invoices on the SHA256 chain
from their BLAKE2b funds, or the reverse, without you ever
holding their money: they pay a hold invoice with the same payment hash, which
you can only claim by paying their invoice. It needs a Lightning node on the
SHA256 chain with outbound liquidity, and it stays off until you turn it on.

1. **Bridge:** turn it on. By default Lightning Fork runs that Lightning
   node for you (**Lightning Fork runs one**): a stock LND, created from a
   seed derived from this node's own, so there is nothing new to write down.
   Choose the node on the SHA256 chain it reads: the form lists your node
   packages and the chain each one is on. Run both chains however suits you:
   your main node on one chain and a companion on the other, either way
   round, or two companions. Or choose **An LND I already run** and paste
   its gRPC lndconnect URI (the form with its LAN IP address).
2. **Fund the SHA256 Node** and **Open SHA256 Channel:** the node starts
   empty. Send it coins on the SHA256 chain, then open a channel from it to a
   well-connected node there (the dashboard's **Run a bridge** window
   recommends one, and walks you through the rest). Other nodes can open
   channels to it too once its **SHA256 Lightning Peer** interface has an
   onion address.
3. **The rate** follows the market (Neoxa), read live: there is nothing to
   set. Set your **Fee** in **Bridge** (1.5% by default). **Bridge Status**
   shows the rate, your fees, and whether the bridge is serving and why not.
4. **Add Bridge Participant:** makes a bridge code for one person, which they
   add in their dashboard. It needs an onion address on the REST LND Connect
   interface. A code is a credential: send it privately.
   **Remove Bridge Participant** revokes one.

The bridge cannot be turned off, or moved to another node, while payments
through it are unfinished; one that slips through all the same is finished
before the bridge stops. To let other nodes on the SHA256 chain open channels
to the bridge's node, add an onion address to its **SHA256 Lightning Peer**
interface. Once Lightning Fork has run a node for the bridge,
that node keeps running, bridge on or off: it may hold channels, and a node
must watch its channels. **SHA256 Node Recovery Phrase** shows the words that
restore it in another LND; your Lightning Fork phrase already recreates it
here.

The swap journal, which records swaps in flight, is kept in this service's
data, so StartOS backups include it. A backup also keeps the bridge node's
channel backup and leaves out its wallet: after a restore, turning the bridge
on recreates the node and restores its channels. Keep a recent copy of that
node's channel backup too (the dashboard downloads it), as for this node's.

## Backups

Make a StartOS backup after every channel open or close, and consider
**Configure Channel Backups** for a continuous off-server copy. Restoring a
backup closes the channels it contains and returns the funds on-chain, as with
LND. A backup taken from an LND node on the SHA256 chain cannot be restored here.

Configure Channel Backups keeps each node's copy in a folder of its own,
inside the folder you name: `<folder>/<node id>/channel.backup`, where the
node id is 64 characters derived from the node's public key. Several nodes
can share one account without overwriting each other, a restore from your
seed finds the same folder again, and the layout is the same as Start9's LND
package uses. A copy made by an earlier release, directly in the folder you
named, is still found on a restore when the node's own folder holds none.

For SFTP, the folder path is relative to the directory your SFTP login starts
in: your home directory on most servers, somewhere else on a NAS or a
chrooted account. Connect with an SFTP client and run `pwd` to see it.
