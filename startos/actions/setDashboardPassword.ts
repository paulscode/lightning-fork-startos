import { dashboardJson } from '../fileModels/dashboard.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

const MIN_LENGTH = 8
const MAX_LENGTH = 128

// Replaces the dashboard's sign-in password. The field offers a generated
// one; typing over it sets a chosen one. The dashboard reads the file on
// every attempt, so the change is immediate and needs no restart; open
// sessions stay open until they expire or sign out.
export const setDashboardPassword = sdk.Action.withInput(
  // id
  'set-dashboard-password',

  // metadata
  async ({ effects }) => ({
    name: i18n('Set Dashboard Password'),
    description: i18n(
      'Replace the password the Dashboard interface asks for, with one of your own or a generated one.',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  // form
  sdk.InputSpec.of({
    password: sdk.Value.text({
      name: i18n('New Password'),
      description: i18n(
        '8 to 128 characters. Takes effect at once; use Dashboard Password to copy it afterwards.',
      ),
      required: true,
      masked: true,
      default: { charset: 'a-z,A-Z,2-9', len: 24 },
      generate: { charset: 'a-z,A-Z,2-9', len: 24 },
    }),
  }),

  // prefill
  async () => ({}),

  // the execution function
  async ({ effects, input }) => {
    const wanted = input.password ?? ''
    if (wanted.length < MIN_LENGTH || wanted.length > MAX_LENGTH) {
      throw new Error(
        i18n('The password must be between ${min} and ${max} characters', {
          min: String(MIN_LENGTH),
          max: String(MAX_LENGTH),
        }),
      )
    }
    await dashboardJson.merge(effects, { password: wanted })
    return {
      version: '1' as const,
      title: i18n('Dashboard Password'),
      message: i18n(
        'The new password is in effect. Dashboard Password shows it whenever you need it again.',
      ),
      result: {
        type: 'single' as const,
        value: wanted,
        copyable: true,
        qr: false,
        masked: true,
      },
    }
  },
)
