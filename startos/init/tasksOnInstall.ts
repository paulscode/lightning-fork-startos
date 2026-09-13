import { selectBackend } from '../actions/selectBackend'
import { initializeWallet } from '../actions/initializeWallet'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

export const tasksOnInstall = sdk.setupOnInit(async (effects, kind) => {
  if (kind === 'install') {
    await sdk.action.createOwnTask(effects, initializeWallet, 'critical', {
      reason: i18n('LND needs a wallet to operate'),
    })
    await sdk.action.createOwnTask(effects, selectBackend, 'critical', {
      reason: i18n(
        'Lightning Fork needs to know which Bitcoin node to use. It must be on the Bitcoin BLAKE2b chain.',
      ),
    })
  }
})
