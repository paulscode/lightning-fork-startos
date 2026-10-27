import { utils } from '@start9labs/start-sdk'
import { ensureAppsDir } from '../actions/appAccess'
import { coldStorageJson } from '../fileModels/cold-storage.json'
import { dashboardJson } from '../fileModels/dashboard.json'
import { lndConfFile } from '../fileModels/lnd.conf'
import { startupFlagsJson } from '../fileModels/startupFlags.json'
import { storeJson } from '../fileModels/store.json'
import { sdk } from '../sdk'

export const seedFiles = sdk.setupOnInit(async (effects, kind) => {
  // Seed the one-time startup flags to their false defaults.
  await startupFlagsJson.merge(effects, {})
  await coldStorageJson.merge(effects, {})

  if (kind === 'install') {
    // Seed the defaults that live only in the form spec. A default the shape
    // itself supplies (`.catch()` / `.transform()`) is applied by every merge,
    // install and update alike, so it does not belong here.
    await lndConfFile.merge(effects, {
      'accept-keysend': true,
    })
    await storeJson.merge(effects, {
      walletPassword: utils.getDefaultString({
        charset: 'A-Z,2-7',
        len: 22,
      }),
    })
  } else {
    await lndConfFile.merge(effects, {})
    await storeJson.merge(effects, {})
  }

  // The folder of the macaroons granted to other packages
  // (actions/appAccess.ts), ours before any package mounts its part of it.
  // Never fails init: the grant action makes it again, or says why not.
  await ensureAppsDir().catch((e) =>
    console.warn('Could not make the apps/ folder', e),
  )

  // The dashboard password: on install, and on the first start after an
  // update from a version that had no dashboard. Never regenerated once set.
  await dashboardJson.merge(effects, {})
  if (!(await dashboardJson.read((d) => d.password).once())) {
    await dashboardJson.merge(effects, {
      password: utils.getDefaultString({
        charset: 'a-z,A-Z,2-9',
        len: 24,
      }),
    })
  }
})
