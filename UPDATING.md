# Updating

## Upstream daemon

The image builds `github.com/paulscode/lightning-fork` at `LIGHTNING_FORK_REF`
in `Dockerfile`. To move to a new daemon release: set the ref to the new commit
(a tag is fine; the builder records the resolved commit), set `version` in
`startos/versions/current.ts`, write release notes, `npm run check`,
`make x86`, install and verify against a running BLAKE2b node, then a
universal build.

### The version

The package version names the daemon release it ships, so the number users
see in the registry is the one the daemon reports:

| Daemon | Package version |
| --- | --- |
| `0.21.3-beta-blake2b.12`, the first package under this scheme | `0.21.3-beta.12:0` |
| `0.21.3-beta-blake2b.13` | `0.21.3-beta.13:0` |
| the same daemon, a package-only fix | `0.21.3-beta.13:1` |
| `0.21.4-beta-blake2b.14` | `0.21.4-beta.14:0` |

That is `<lnd base>-beta.<fork release>:<package revision>`, the revision
starting at 0 for each daemon release. The daemon's own spelling,
`beta-blake2b.13`, is not a valid StartOS version: its pre-release part takes
only dot-separated segments that are all letters or all digits, so neither the
hyphen nor `blake2b` parses. The Umbrel app spells the same release
`0.21.3-beta-blake2b.13.0`.

Up to `0.21.3-beta:9` the part after the colon counted packages rather than
naming the daemon, so `:9` shipped `0.21.3-beta-blake2b.12`, and users referred
to the same release as both "beta 9" and "beta 12". Any `beta.N` sorts above
those, so the switch needs nothing beyond the new number; checked with the SDK,
including the upgrade from `:9` and `:7` through `current`'s migration. Never
publish an upstream release candidate: `beta.rc1` is not a valid version
either.

`lndinit` is pinned separately (`lightninglabs/lndinit:v0.1.37-beta-lnd-v0.21.3-beta`);
move it together with the LND base version the daemon is rebased on.

## Start9's LND package

This package tracks `Start9Labs/lnd-startos` (`upstream` remote). To pull
their changes, merge or rebase `startos-0.4` onto their `master` and re-apply
the intent of `startos/backends.ts`, `startos/dependencies.ts`, the
`chain-identity` health check in `startos/main.ts`, the node selection action,
and the removals listed in `README.md`. Their version files below `current`
must not come back: they migrate their package's data, never this one's, and
every revision of this package upgrades through `current`'s migration, so
whatever it does must be idempotent.

## Dependencies

- `bitcoin-core-startos` (`next/28.x`) and `knots-blake2b-startos` (`main`)
  are npm `github:` dependencies; `startos/backends.ts` imports their host ids
  and ports so a change on their side is a type error here.
- The companion's minimum version (`>=1.0.0:31`) is the revision with the
  official action set (the `autoconfig` action this package drives).
