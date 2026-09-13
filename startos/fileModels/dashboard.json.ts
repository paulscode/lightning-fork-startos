import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

// The dashboard's door key. The dashboard reads this file on every request
// (DASHBOARD_PASSWORD_FILE), so Dashboard Password takes effect at once and
// main never has to watch it. Seeded at install, and at the first start after
// an update from a version without a dashboard.
export const dashboardShape = z.object({
  password: z.string().nullable().catch(null),
})

export const dashboardJson = FileHelper.json(
  { base: sdk.volumes.dashboard, subpath: '/dashboard.json' },
  dashboardShape,
)
