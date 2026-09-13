import { dashboardJson } from '../fileModels/dashboard.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

const MIN_LENGTH = 8
const MAX_LENGTH = 128

export const dashboardPassword = sdk.Action.withInput(
  // id
  'dashboard-password',

  // metadata
  async ({ effects }) => ({
    name: i18n('Dashboard Password'),
    description: i18n(
      'Show the password the Dashboard interface asks for, or replace it.',
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
        'Leave empty to keep the current password and only show it. Otherwise 8 to 128 characters; it takes effect on the next request, no restart needed.',
      ),
      required: false,
      masked: true,
      default: '',
    }),
  }),

  // prefill
  async () => ({}),

  // the execution function
  async ({ effects, input }) => {
    const wanted = input.password ?? ''
    if (wanted.length > 0) {
      if (wanted.length < MIN_LENGTH || wanted.length > MAX_LENGTH) {
        throw new Error(
          i18n('The password must be between ${min} and ${max} characters', {
            min: String(MIN_LENGTH),
            max: String(MAX_LENGTH),
          }),
        )
      }
      await dashboardJson.merge(effects, { password: wanted })
    }
    const password = await dashboardJson.read((d) => d.password).once()
    if (!password) {
      throw new Error(
        i18n(
          'No dashboard password is set yet. Restart the service to have one generated, or enter one here.',
        ),
      )
    }
    return {
      version: '1' as const,
      title: i18n('Dashboard Password'),
      message: i18n(
        'The browser asks for this when you open the Dashboard interface. Any username will do.',
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
