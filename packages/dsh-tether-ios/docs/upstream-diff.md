# Provenance and adaptation

Pinned phone/protocol source: chinahhy/dsh-tether ios-only
`0c10375d5d1931bd8603f203c494e621dd5040a6` (derived from zexadev/dsh-tether 0.1.18).
Pinned official DSH source: `dsh-v0.2.0-rc.2` / `639ed015397290b3745d163aafe02ffee4aa3f84`.

Reused: iroh 1.0, TLS peer-ID allowlist, 6-digit pairing with TTL/attempt limits,
Wire JSON lines/ALPN, bounded control lines, HTTP/WebSocket proxy, loopback
Origin rewrite, auth cookie injection, private/atomic persistence.

Changed: host-only Rust workspace; required absolute --data-dir; no OS config
fallback or Android resolver; no phone-sim/Id CLI; no automatic pairing window;
stdin EOF/SIGTERM exits endpoint; no raw IPC log text; authenticated proxy only;
control-session closure closes connection; all proxy requests gain an unforgeable
(to the remote client) remote marker; JS refuses remote pairing management.
Host wrapper uses DSH's dshHomePath, real Connection auth, managed disposal,
serialized IPC requests, bounded timeouts and safe missing-callId fallback.
Client uses the verified sidebar slot, with lifecycle-owned styles.

Not copied: Android app/runtime, platform installers, npm optional native-package
selection, external hostBinary override, plaintext settings route, auto-approval,
fragile DOM/CSS injection and global sidebar styling. Mobile approval remains
on the existing iOS protocol. iOS app code is unchanged by this task.

Validation levels are explicit: version-pinned source contracts → synthetic
unit/real-service/native CI → still-pending physical Mac/iPhone acceptance.
No test of network transport implies relay or physical-device validation.
