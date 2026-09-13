# TODO

- [ ] Verify the `chain-identity` health check against a real refusal on a
      box (a SHA256d node under the `bitcoind` id, e.g. the `#core` flavor
      on a spare server). The check reads the host file with no daemon
      dependency and no grace period, and main deletes the previous run's
      file, but the display has only been exercised with a confirmed node.
- [ ] Add a "waiting" notification when the node is far below block 961640,
      so a fresh install does not look stuck for hours.
- [ ] `dep-icon.png` for packages that depend on Lightning Fork.
- [ ] Translations: descriptions and new strings are English in every
      locale; the LND package's translated strings are kept where unchanged.
- [ ] aarch64 build verified on hardware.
