# Updating

## Upstream daemon

The image builds `github.com/paulscode/lightning-fork` at `LIGHTNING_FORK_REF`
in `Dockerfile`. To move to a new daemon release: set the ref to the new commit
(a tag is fine; the builder records the resolved commit), bump `version` in
`startos/versions/current.ts` (`<lnd base>-beta:<downstream>`, e.g.
`0.21.3-beta:1`), write release notes, `npm run check`, `make x86`, install
and verify against a running BLAKE2b node, then a universal build.

`lndinit` is pinned separately (`lightninglabs/lndinit:v0.1.37-beta-lnd-v0.21.3-beta`);
move it together with the LND base version the daemon is rebased on.

## Start9's LND package

This package tracks `Start9Labs/lnd-startos` (`upstream` remote). To pull
their changes, merge or rebase `startos-0.4` onto their `master` and re-apply
the intent of `startos/backends.ts`, `startos/dependencies.ts`, the
`chain-identity` health check in `startos/main.ts`, the node selection action,
and the removals listed in `README.md`. Their version files below `current`
must not come back: nothing older was ever installed under this id.

## Dependencies

- `bitcoin-core-startos` (`next/28.x`) and `knots-blake2b-startos` (`main`)
  are npm `github:` dependencies; `startos/backends.ts` imports their host ids
  and ports so a change on their side is a type error here.
- The companion's minimum version (`>=1.0.0:31`) is the revision with the
  official action set (the `autoconfig` action this package drives).
