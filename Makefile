ARCHES := x86 arm
# overrides to s9pk.mk must precede the include statement
include node_modules/@start9labs/start-sdk/s9pk.mk

# The dashboard image reference in startos/manifest/index.ts must be a real
# tag; a forgotten placeholder would only fail at pack time, deep in start-cli.
.PHONY: check-dashboard-digest
check-dashboard-digest:
	@! grep -q DASHBOARD_IMAGE_DIGEST startos/manifest/index.ts || \
		(echo "startos/manifest/index.ts still carries the dashboard digest placeholder" && exit 1)

javascript/index.js: check-dashboard-digest
