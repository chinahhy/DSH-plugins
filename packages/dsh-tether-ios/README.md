# dsh-tether-ios

macOS Apple Silicon companion for the iOS arm64 app at
[chinahhy/dsh-tether ios-only](https://github.com/chinahhy/dsh-tether/tree/ios-only).
Verified with **DSH Desktop 0.2.0-rc.2 only**, Mac mini M4 and an iOS arm64 iPhone.
On 2026-10-05 the maintainer confirmed normal physical-device use and an outdoor
cellular connection to the home DSH. The actual direct/relay path and sleep/wake
recovery were not separately established. See [validation scope](docs/device-validation.json).

## Architecture

Desktop's existing `desktop` profile → owned `tether-host` → iroh → iOS app.
No additional DSH runtime or CLI daemon. ALPN `dsh-tether/0`, Pair/Hello,
Proxy, Approval/ApprovalCancel and field spellings remain compatible.
Approvals are notifications only; decisions stay in DSH's normal web UI.

The sidebar “连接 iPhone” button generates an expiring pairing string on demand.
Only the local authenticated Mac window can manage pairing/revocation. There is
no automatic startup code, console credential output or settings-file export.
A paired phone has full DSH operator access. Keep the phone and Mac trusted.
Pairing: 6 digits, 10 minutes, at most 3 wrong attempts per window. Revocation
closes active connections. The phone app's existing localhost-proxy limitation
still applies; the plugin does not create an iOS background push service.

## Installation

The published `main` package includes the verified `bin/darwin-arm64/tether-host`.
No Rust compiler, installation hooks or separate download are needed. Install the
GitHub subpackage through DSH's plugin manager:

```text
github:chinahhy/DSH-plugins#path:/packages/dsh-tether-ios
```

For manual/offline installation, use the versioned `.tgz` and `SHA256SUMS` from
[GitHub Releases](https://github.com/chinahhy/DSH-plugins/releases).
Use the existing Desktop `desktop` profile. Do not create an extra web profile.
Development branches intentionally omit native binaries; use published `main`
or a complete CI archive. Existing local link/file installs do not automatically
follow GitHub updates and require an explicitly authorized source migration.

The official Desktop profile/package manager owns dependency and bundle changes.
The bundle adds the host plus in-app directory browsing, and disables the exact
0.2.0-rc.2 automatic picker. While enabled, folder selection on the Mac also uses
in-app browsing. Removing the bundle restores the base picker unless overridden
by another user patch. No persistent user patch is directly written by this plugin.

## Files and removal

`<DSH_HOME>` below means the application's `ctx.dshHomePath()` result, normally
`~/.dsh`; no HOME fallback is guessed by this plugin.

| Location | Owner / behavior |
| --- | --- |
| `<DSH_HOME>/profiles/desktop/node_modules/dsh-tether-ios/` | Installed package and `bin/darwin-arm64/tether-host`; package-manager symlinks/store may affect physical location |
| `<DSH_HOME>/profiles/desktop/package.json`, lockfile, bundle inventory | Existing DSH package manager updates these when installing/removing |
| `<DSH_HOME>/data/dsh-tether-ios/identity.key` | Host identity, 0600 |
| `<DSH_HOME>/data/dsh-tether-ios/paired.json` | Device allowlist, 0600; containing plugin directory 0700 |
| `<DSH_HOME>/data/dsh-tether-ios/.identity.key.tmp`, `.paired.json.tmp` | Atomic-write crash remnants, normally absent |
| DSH-owned package cache/store | Package-manager controlled; may retain archive/package after uninstall |
| iOS application's own sandbox | Existing iOS identity and host list; unaffected by Mac uninstall |

Disable/remove the plugin using DSH's plugin manager. The disposer closes routes,
stops renewal, ends sidecar stdin, sends SIGTERM and escalates to SIGKILL after
2 seconds if needed. Parent-pipe EOF also stops the sidecar after a parent crash.
There is no LaunchAgent or login item. Confirm the sidecar has exited.

Uninstall removes the package/bundle through DSH. Pairing data is deliberately
preserved for reinstall; for a full reset, after stopping the plugin, explicitly
delete only `<DSH_HOME>/data/dsh-tether-ios/` and remove the saved computer from
iOS. This destroys that host identity and requires re-pairing. Do not delete the
whole DSH home or shared package cache. No automatic deletion hook runs.

No `/usr/local/bin`, npm global installation, Homebrew, new `~/.xxx`, external
runtime, permanent background service, or real account credentials are needed.
The browser session cookie stays in parent/child memory and is never logged.

## Development / artifacts

`node scripts/build.mjs`; `node --test test/*.test.mjs` require only Node 24.
Rust build/test and official DSH API integration run on the macOS arm64 Actions
runner. `scripts/build-sidecar.mjs` uses Cargo.lock and targets aarch64-apple-darwin.
Actions builds and tests the locked macOS arm64 host, verifies the native checksum
and licenses, then promotes only this package to `main` and creates a versioned
Release. Source installs and tgz installs both include the binary. It has an
ad-hoc linker signature; it is not a notarized distribution. No npm publication
or global installation is involved.

## Remaining validation boundaries

- Full uninstall/reset and all reload paths; normal Desktop quit/restart was verified.
- Exhaustive iPhone UI, reconnect/revocation and folder browsing scenarios.
- Identify direct versus relay transport, force relay fallback, and test sleep/wake and app foreground return. Outdoor cellular use was confirmed by the maintainer.
- Approval notification while connected and approval decision in the real web UI.
- Gatekeeper/quarantine behavior with the actual downloaded binary and signed iOS IPA.
- Narrow-screen usability; this candidate does not copy upstream's fragile CSS selectors.

See [API evidence](docs/api-evidence.json) and [upstream changes](docs/upstream-diff.md).

### Sidebar relay switch

The paired iPhone can read the current host relay selection. Its switch is read-only
and shows that changes must be made in the Mac DSH window. Relay changes, pairing,
and device management remain local-only; phone state reads still require DSH
authentication, the control marker, and the same loopback/origin checks. The state
response contains no relay URLs, device IDs, or pairing material.

A compact left/right switch sits above the quota panel (sidebar slot order 49).
Left selects public n0 relays; right selects only the configured private relays
for the Mac host. A private choice does not silently include public home relays.
IP/QUIC direct transport and public discovery remain enabled; this switch does
not disable discovery or change the phone's own home relay settings.

Configure the existing DSH-owned `data/dsh-tether-ios/relay.json`:

```json
{"version":1,"mode":"private","additionalRelayUrls":["https://relay.example.org:6270/"]}
```

At most four plain HTTPS origins are accepted (no credentials/path/query/fragment).
The private relay must allow the Mac and paired phone identities. Older files
without mode select private when private URLs exist, otherwise public.
The chosen mode survives reload. Switching briefly reconnects the phone but
keeps host identity and pairing. Only the sidecar restarts, not Desktop.

The authenticated local-only control route accepts a mode, never arbitrary URLs.
Private health is checked before stopping the current child. Failed startup or
configuration persistence restores the prior selection where possible; errors
remain visible and never claim successful switching. One switch runs at a time.
Existing pending approval notifications are replayed to the replacement sidecar.
Private HTTPS health alone does not prove actual phone traffic used the relay.

The current iOS app learns the host relay via discovery; actual phone reconnection
and chosen transport need physical-device validation after changes.
