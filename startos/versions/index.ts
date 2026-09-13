import { VersionGraph } from '@start9labs/start-sdk'
import { current } from './current'

// A new package id: nothing older than `current` was ever installed, so the
// graph has no other vertices and no migrations.
export const versionGraph = VersionGraph.of({
  current,
  other: [],
})
