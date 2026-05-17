# Security Backlog — Deferred Findings

Findings from prior cross-source code reviews (Codex multi-run, DeepSeek
thinking-max, Claude subagents) that were assessed as P1 but
intentionally deferred. Each entry documents what the issue is, why
it isn't fixed yet, and what would close it.

## DEF-1 — Mutable GitHub release assets backdoor the immutable package

**Severity** P1 — supply chain
**First reported** v0.6.21 (Codex gpt-5.4, 2026-05-17)
**Status** Deferred. Mitigated downstream.

### What

`scripts/install-from-prebuild.mjs` fetches both the `.node` binary
AND `SHA256SUMS` from the same GitHub release. The release workflow
explicitly `--clobber`s existing assets (cf. `.github/workflows/release.yml`
publish-release job). Any actor with write access on releases for an
already-published tag (admin, compromised PAT/Actions token, GitHub
App with `releases:write`) can:

1. Build a trojanised `.node` locally
2. Recompute its SHA256
3. Re-upload both files atomically on the same tag
4. Every fresh `npm install @klodr/libsession-util-nodejs@<tag>` accepts
   the trojan — no version bump, no semver signal

The download-and-verify scheme inside the binding is therefore not a
supply-chain integrity gate; it's a transport-corruption gate.

### Why deferred

The clean fix is Sigstore / cosign attestation with a trust root
external to the GitHub release page (OIDC identity of the build
workflow, anchored in the Sigstore transparency log). That work is:

- Adds ~3h plumbing in the release workflow
- Adds a real new dependency (cosign client) and a CI permission scope
- Requires a verifier in every consumer install path

It is not blocking any current consumer because the only one
(`klodr/session-messenger`) carries its own in-repo SHA256 digests
since v2.0.4 (cf. `scripts/install-binding.mjs`). Those digests are
signed-in-git on the consumer side, so an attacker has to compromise
TWO repos to corrupt the install.

### Mitigation in place

- `klodr/session-messenger` v2.0.4 + later: `scripts/install-binding.mjs`
  hardcodes the SHA256 for the binding version pinned in its
  `package.json`. Tampered release assets fail the consumer-side
  verification.
- Other consumers that pull `@klodr/libsession-util-nodejs` directly,
  without an analogous in-repo digest, remain vulnerable.

### To close it

1. Generate Sigstore attestation in `release.yml` after building each
   prebuild (`cosign sign-blob --yes --bundle <asset>.sigbundle`)
2. Upload the `.sigbundle` files as release assets
3. Update `scripts/install-from-prebuild.mjs` to verify the bundle
   against the GitHub Actions workflow OIDC identity
   (`https://github.com/klodr/libsession-util-nodejs/.github/workflows/release.yml@refs/tags/<tag>`)
4. Document the verification flow in `BUILDING.md`

## DEF-2 — ThreadSafeFunction is process-global, not per N-API env

**Severity** P1 — concurrency, multi-worker safety
**First reported** v0.6.19 (Codex 3-run); reinforced v0.6.21 (Codex gpt-5.4, 2026-05-17)
**Status** Partially mitigated. Full fix deferred.

### What

`src/addon.cpp` stores `Napi::ThreadSafeFunction tsfn;` as a process-
level global. Each `InitAll(env, exports)` call (one per N-API
environment: main thread, each Worker, each vm context that requires
the addon) reassigns this global to its own env's TSFN. The lambda
captured by `session::add_logger()` references the global.

Race scenarios:

- Worker A loads addon, `tsfn = A.tsfn`
- Worker B loads addon, `tsfn = B.tsfn` (A's handle leaked, but the
  global now points at B's)
- Worker A tears down → its `napi_add_env_cleanup_hook` calls
  `tsfn.Release()` on what is now B's handle
- Background libsession log thread calls `tsfn.BlockingCall(...)`
  racing with `Release()/nullptr` — undefined behaviour, can manifest
  as process abort, stale call into a torn-down env, or silent drop

### Why deferred

The clean fix is per-env storage via `napi_set_instance_data` + a
small struct (TSFN + mutex + sink_id) per env, and capturing the
instance data inside `session::add_logger`'s callback rather than the
global. Estimated ~80 LOC C++ + Worker-based regression tests. The
current consumer (`klodr/session-messenger`) runs a single N-API
environment on a single thread — the race is unreachable in practice.

### Mitigation in place

v0.6.21 added:

- `tsfn.Unref(env)` at init — so a CLI consumer's `require()` doesn't
  hang the process forever waiting on the TSFN
- `napi_add_env_cleanup_hook` that calls `Release()` + sets the global
  to nullptr — so a single-env teardown is safe
- A `if (!tsfn) return` guard inside `add_logger`'s lambda — so a
  log emission after teardown drops silently instead of aborting

These cover the single-env case (which is 100% of current users).

### To close it

1. Define `struct LoggerCtx { Napi::ThreadSafeFunction tsfn; std::mutex
   m; uint64_t sink_id; };`
2. In `InitAll`: `auto* ctx = new LoggerCtx{...}; napi_set_instance_data(env, ctx, [](napi_env, void* data, void*){ ... Release ... delete }, nullptr);`
3. In `add_logger` capture, do `auto* ctx = static_cast<LoggerCtx*>(napi_get_instance_data(env)); std::lock_guard g{ctx->m}; ctx->tsfn.BlockingCall(...);`
4. Replace the global `tsfn` with per-env instance data throughout
5. Add a Worker-based test in `tests/` that exercises multi-env load
   + teardown + concurrent log emission, asserts no abort and no
   stale handle access
