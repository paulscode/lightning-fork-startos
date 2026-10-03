import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import {
  dashboardHostId,
  dashboardInterfaceId,
  dashboardPort,
} from '../interfaces'
import { sdk } from '../sdk'
import { dashboardEndpoints, dashboardOnionTaskId } from './dashboardEndpoints'

// The companion app reaches the node away from home through an onion address
// on the Dashboard interface, which only the Tor package can add. This asks
// for one with a task that opens Tor's Add Onion Service already filled in:
// this package's Dashboard host, SSL off (Tor authenticates the node, and the
// app speaks plain HTTP to an onion).
//
// Raised once, on install or on the update that brings it, and never again:
// StartOS removes the task when its action runs, writeDashboardEndpoints
// clears it when an onion appears by any route, and a dismissed task stays
// dismissed. The dashboard's Mobile app screen and instructions.md keep the
// steps where they can be found later.
export const torPackageId = 'tor'

export const taskDashboardOnion = sdk.setupOnInit(async (effects, kind) => {
  if (kind !== 'install' && kind !== 'update') return
  if (await storeJson.read((s) => s.dashboardOnionAsked).once()) return

  const { onion } = await sdk.host
    .getOwn(effects, dashboardHostId, dashboardEndpoints)
    .once()
  if (onion.length > 0) {
    await storeJson.merge(effects, { dashboardOnionAsked: true })
    return
  }
  // Without Tor the task would only show as "Not installed"; the dashboard
  // and the instructions say what to do instead. Asked again on a later
  // update, by which time Tor may be there.
  const installed: string[] = await effects
    .getInstalledPackages()
    .catch(() => [])
  if (!installed.includes(torPackageId)) return

  const onionInput = {
    urlPluginMetadata: {
      packageId: 'lightning-fork',
      hostId: dashboardHostId,
      interfaceId: dashboardInterfaceId,
      internalPort: dashboardPort,
    },
    ssl: false,
  }
  // A refused request must never fail the install or update it rides on.
  const raised = await effects.action
    .createTask({
      replayId: dashboardOnionTaskId,
      packageId: torPackageId,
      actionId: 'add-onion-service',
      severity: 'optional',
      reason: i18n(
        'To use the Lightning Fork app away from home, give the Dashboard an onion address. This opens Tor with the Dashboard selected and SSL off; confirm it as it is.',
      ),
      // `set` fills the form; `accept` is what the platform would count as
      // done, were the task conditional (it is not: it ends when run).
      input: { kind: 'partial', accept: [onionInput], set: onionInput },
    })
    .then(() => true)
    .catch((e) => {
      console.warn(`Could not ask for an onion on the Dashboard: ${e}`)
      return false
    })
  if (raised) await storeJson.merge(effects, { dashboardOnionAsked: true })
})
