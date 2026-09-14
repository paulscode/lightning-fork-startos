const shortEn =
  'A Lightning Network node for the Bitcoin BLAKE2b chain, forked from LND'

export const short = {
  en_US: shortEn,
  es_ES: shortEn,
  de_DE: shortEn,
  pl_PL: shortEn,
  fr_FR: shortEn,
}

const longEn = `Lightning Fork is a fork of LND (Lightning Network Daemon) that follows the Bitcoin BLAKE2b chain: the Bitcoin Knots hard fork that replaced SHA256d proof of work with BLAKE2b at block 961640 on 30 August 2026. It creates and closes channels, routes payments, sends and receives over the Lightning Network on that chain, and keeps a fully validated channel graph, exactly as LND does on Bitcoin.

The BLAKE2b chain shares its history, addresses and keys with Bitcoin, so a Lightning node cannot tell the two apart by any ordinary check. Lightning Fork therefore refuses to start against a node on the SHA256d chain, advertises the BLAKE2b chain in every peer handshake and drops peers that do not, and issues invoices with the lnblake prefix that no Bitcoin wallet will pay. Nothing here can connect to, pay, or be paid from the Bitcoin Lightning network by accident.

It runs against a Bitcoin Knots node (29.4.1 or later) or the Bitcoin Knots (BLAKE2b) Companion, chosen under Select Node. The Chain Identity health check shows which chain the node is on.`

export const long = {
  en_US: longEn,
  es_ES: longEn,
  de_DE: longEn,
  pl_PL: longEn,
  fr_FR: longEn,
}

const alertInstallEn =
  'READ CAREFULLY! Lightning Fork, LND and the Lightning Network are considered beta software, and the Bitcoin BLAKE2b chain is weeks old. Please use with caution and do not risk more money than you are willing to lose. We encourage frequent backups, particularly after opening or closing channels. If for any reason you need to restore from a backup, your on-chain wallet will be restored. Any channels in the backup will be closed and their funds returned to your on-chain wallet, minus fees. It may also take some time for this process to occur. Any channels opened after the last backup CANNOT be recovered by backup restore. Coins that existed before block 961640 exist on both chains; until Lightning Fork signs with the replay-protected signature type, prefer funding channels with coins received after that block.'

export const alertInstall = {
  en_US: alertInstallEn,
  es_ES: alertInstallEn,
  de_DE: alertInstallEn,
  pl_PL: alertInstallEn,
  fr_FR: alertInstallEn,
}

const alertUninstallEn =
  'READ CAREFULLY! Uninstalling Lightning Fork will result in permanent loss of data, including its private keys for its on-chain wallet and all channel states. Please make a backup if you have any funds in your on-chain wallet or in any channels. Recovering from backup will restore your on-chain wallet, but due to the architecture of the Lightning Network, your channels cannot be recovered. All channels included in the backup will be closed and their funds returned to your on-chain wallet, minus fees. Any channels opened after the last backup CANNOT be recovered by backup restore'

export const alertUninstall = {
  en_US: alertUninstallEn,
  es_ES: alertUninstallEn,
  de_DE: alertUninstallEn,
  pl_PL: alertUninstallEn,
  fr_FR: alertUninstallEn,
}

const alertRestoreEn =
  'READ CAREFULLY! Any channels opened since the last backup will be forgotten and may linger indefinitely, and channels contained in the backup will be closed and their funds returned to your on-chain wallet, minus fees. After all recoverable funds are available in your on-chain wallet, all funds should be swept to a different wallet. NEVER use a restored wallet to open new channels. If you would like to use Lightning Fork after a backup restore you will first need to sweep all on-chain funds to a different wallet, next Lightning Fork can be safely uninstalled, and finally it can be installed fresh from the marketplace.'

export const alertRestore = {
  en_US: alertRestoreEn,
  es_ES: alertRestoreEn,
  de_DE: alertRestoreEn,
  pl_PL: alertRestoreEn,
  fr_FR: alertRestoreEn,
}

const depBitcoindEn =
  'The official Bitcoin package in its Knots flavor, 29.4.1 or later, following the BLAKE2b chain. Used to read blocks and transactions and to subscribe to new block events.'

export const depBitcoindDescription = {
  en_US: depBitcoindEn,
  es_ES: depBitcoindEn,
  de_DE: depBitcoindEn,
  pl_PL: depBitcoindEn,
  fr_FR: depBitcoindEn,
}

const depCompanionEn =
  'A pruned Bitcoin Knots node on the BLAKE2b chain that fits beside a node on the other chain. Used to read blocks and transactions and to subscribe to new block events.'

export const depCompanionDescription = {
  en_US: depCompanionEn,
  es_ES: depCompanionEn,
  de_DE: depCompanionEn,
  pl_PL: depCompanionEn,
  fr_FR: depCompanionEn,
}

export const depTorDescription = {}

const depMempoolEn =
  'Optional. The dashboard takes its fee rates (the Low, Medium and High its page shows) and its transaction links from a Mempool app you choose.'

export const depMempoolDescription = {
  en_US: depMempoolEn,
  es_ES: depMempoolEn,
  de_DE: depMempoolEn,
  pl_PL: depMempoolEn,
  fr_FR: depMempoolEn,
}

export const depMempoolPrunedDescription = depMempoolDescription
