import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:3',
  releaseNotes: {
    en_US: `The dashboard signs you in on its own screen: one password, no username, and no browser prompt. The password is the one generated at install; Dashboard Password shows it masked with a copy button, and the new Set Dashboard Password action replaces it with one of your own or a generated one, effective at once. Sessions last twelve hours, Sign out is in the dashboard's menu, and wrong attempts back off from the third.

The node itself is unchanged from 0.21.3-beta:2 (Lightning Fork 0.21.3-beta-blake2b.5).`,
  },
  migrations: {
    up: async () => {},
  },
})
