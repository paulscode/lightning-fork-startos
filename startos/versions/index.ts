import { VersionGraph } from '@start9labs/start-sdk'
import { current } from './current'

// Every earlier revision upgrades through `current`'s own migration and needs
// no vertex here. That migration must be idempotent, and carried into the
// next `current` when a release rewrites it (see UPDATING.md).
export const versionGraph = VersionGraph.of({
  current,
  other: [],
})
