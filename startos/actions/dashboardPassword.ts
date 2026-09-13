import { T } from '@start9labs/start-sdk'
import { dashboardJson } from '../fileModels/dashboard.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

// Shows the dashboard's sign-in password: masked, and copyable without
// unmasking, so a wallet-grade secret stays off the screen by default. It is
// generated at install (init/seedFiles.ts) and replaced by Set Dashboard
// Password.
export const dashboardPassword = sdk.Action.withoutInput(
  // id
  'dashboard-password',

  // metadata
  async ({ effects }) => ({
    name: i18n('Dashboard Password'),
    description: i18n('Show the password the Dashboard interface asks for.'),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  // the execution function
  async ({ effects }): Promise<T.ActionResult & { version: '1' }> => {
    const password = await dashboardJson.read((d) => d.password).once()
    if (!password) {
      throw new Error(
        i18n(
          'No dashboard password is set yet. Restart the service to have one generated, or set one with Set Dashboard Password.',
        ),
      )
    }
    return {
      version: '1' as const,
      title: i18n('Dashboard Password'),
      message: i18n(
        'Paste this on the sign-in screen of the Dashboard interface. Treat it like a wallet key: the dashboard can send funds.',
      ),
      result: {
        type: 'single' as const,
        value: password,
        copyable: true,
        qr: false,
        masked: true,
      },
    }
  },
)
