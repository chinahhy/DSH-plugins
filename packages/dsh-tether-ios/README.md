# dsh-tether-ios (candidate)

macOS Apple Silicon companion for the iOS arm64 app at
[chinahhy/dsh-tether ios-only](https://github.com/chinahhy/dsh-tether/tree/ios-only).
Targets **DSH Desktop 0.2.0-rc.2 only**. Source/API and synthetic CI verification
are distinct from Mac mini M4 + iPhone acceptance, which is still pending.
`dshReleases` deliberately makes no `compatible` claim; release is blocked.

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

## Candidate installation (not performed by this task)

Use only the CI-produced `dsh-tether-ios-0.1.0.tgz`, verify SHA256SUMS first.
Do **not** install the GitHub source subdirectory: native binaries are controlled
artifacts, not Git files. In DSH's plugin manager install the local archive into
its existing desktop profile; do not create a web profile or global dsh command.
Do not install until the separate real-device acceptance step is authorized.

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
The CI artifact contains the tgz, checksums, source commit, API evidence,
licenses and test evidence. It is ad-hoc/unsigned development material, not
notarized distribution. No Release, npm publish, market submission or main
promotion is performed. Existing Publish plugin refuses this pending package.

## Real-device acceptance still required

- Install/remove/reload in the native Desktop; confirm no orphan child or extra files.
- iPhone rendering, pairing/reconnect/revocation and folder browsing.
- Wi-Fi/cellular direct path and relay fallback; sleep/wake and app foreground return.
- Approval notification while connected and approval decision in the real web UI.
- Gatekeeper/quarantine behavior with the actual downloaded binary and signed iOS IPA.
- Narrow-screen usability; this candidate does not copy upstream's fragile CSS selectors.

See [API evidence](docs/api-evidence.json) and [upstream changes](docs/upstream-diff.md).
