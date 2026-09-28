import { VersionGraph } from '@start9labs/start-sdk'
import { current } from './current'

// No revision so far has changed the package's data, so every earlier one
// upgrades through `current`'s own no-op migration and needs no vertex here.
export const versionGraph = VersionGraph.of({
  current,
  other: [],
})
