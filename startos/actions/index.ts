import { sdk } from '../sdk'
import { autoconfig } from './config/autoconfig'
import { backupChannelsNow } from './backupChannelsNow'
import { prepareColdStorage, toggleColdStorage } from './coldStorage'
import { unlockWallet } from './unlockWallet'
import { dashboardPassword } from './dashboardPassword'
import { setDashboardPassword } from './setDashboardPassword'
import { configureChannelBackup } from './configureChannelBackup'
import { selectBackend } from './selectBackend'
import { autopilotConfig } from './config/autopilot'
import { channelsConfig } from './config/channels'
import { customExternalHostConfig } from './config/customExternalHost'
import { general } from './config/general'
import { performanceConfig } from './config/performance'
import { routingFeesConfig } from './config/routing-fees'
import { torConfig } from './config/tor'
import { wtClientConfig } from './config/watchtowerClient'
import { watchtowerServerConfig } from './config/watchtowerServer'
import { initializeWallet } from './initializeWallet'
import { nodeInfo } from './nodeInfo'
import { revokeMacaroons } from './revoke-macaroons'
import { resetWalletTransactions } from './resetTxns'
import { towerInfo } from './towerInfo'
import { watchtowers } from './watchtowers'
import { bridgeConfig } from './config/bridge'
import {
  bridgeAddParticipant,
  bridgeRemoveParticipant,
  bridgeSetRate,
  bridgeStatus,
} from './bridge'
import {
  bridgeSha256Fund,
  bridgeSha256OpenChannel,
  bridgeSha256Seed,
} from './bridgeSha256'

export const actions = sdk.Actions.of()
  .addAction(general)
  .addAction(routingFeesConfig)
  .addAction(channelsConfig)
  .addAction(autopilotConfig)
  .addAction(torConfig)
  .addAction(customExternalHostConfig)
  .addAction(selectBackend)
  .addAction(performanceConfig)
  .addAction(watchtowerServerConfig)
  .addAction(wtClientConfig)
  .addAction(resetWalletTransactions)
  .addAction(towerInfo)
  .addAction(watchtowers)
  .addAction(bridgeConfig)
  .addAction(bridgeStatus)
  .addAction(bridgeSha256Fund)
  .addAction(bridgeSha256OpenChannel)
  .addAction(bridgeSha256Seed)
  .addAction(bridgeSetRate)
  .addAction(bridgeAddParticipant)
  .addAction(bridgeRemoveParticipant)
  .addAction(nodeInfo)
  .addAction(dashboardPassword)
  .addAction(setDashboardPassword)
  .addAction(initializeWallet)
  .addAction(revokeMacaroons)
  .addAction(autoconfig)
  .addAction(configureChannelBackup)
  .addAction(backupChannelsNow)
  .addAction(prepareColdStorage)
  .addAction(toggleColdStorage)
  .addAction(unlockWallet)
