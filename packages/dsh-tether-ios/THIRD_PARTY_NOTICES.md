# Third-party notices

Host and shared protocol derive from zexadev/dsh-tether (MIT), via
chinahhy/dsh-tether ios-only commit 0c10375d5d1931bd8603f203c494e621dd5040a6.
The full upstream MIT notice is preserved in LICENSE. Adaptations copyright
2026 Hoya, distributed under the same MIT license.

Vendored: native/host and native/tether-core. See docs/upstream-diff.md.
No Tauri application, Android local runtime, Windows/Linux host installer,
DeepSeek Harness runtime, or React copy is bundled.

Rust dependencies are pinned in native/Cargo.lock; their complete license
texts and package identities are collected from Cargo metadata into
bin/darwin-arm64/THIRD_PARTY_LICENSES.txt by CI. This file is required for a
candidate artifact. Host DSH/React/Cordis APIs are provided by DSH itself.
