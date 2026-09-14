# pixelkit-cli: Agent Guide

This file is the single source of truth for any coding agent (Claude, Gemini, Antigravity, Codex, Delta) working in this repository. `CLAUDE.md`, `AGENTS.md` and `GEMINI.md` are identical copies; keep all three in sync — `sha256sum AGENTS.md CLAUDE.md GEMINI.md` must print one hash.

## Project

`@pixelkit-labs/cli` has one command, `pixelkit doctor`. It answers "why is every PixelKit hook showing —?" by running six read-only checks: adb and a single connected device, the device's identity, whether the development build is installed, whether `@pixelkit-labs/native` and `@pixelkit-labs/mlkit` resolve from the current directory, whether AICore is present, and whether `adb reverse tcp:8081` is set. The whole CLI is `index.ts`, compiled by `tsc` to `build/`. It needs Node 18 or later, and is published on its own version line, separately from the SDK.

It is one of several PixelKit-Labs repositories. The SDK is at https://github.com/PixelKit-Labs/pixelkit-sdk, the demo app at https://github.com/PixelKit-Labs/pixelkit-template, and the documentation — including this CLI's pages under `docs/cli/` — at https://github.com/PixelKit-Labs/pixelkit-docs.

## Rules

1. **Changelog on every change.** Every change bumps the patch version by 0.0.1 and adds an entry to `CHANGELOG.md` in the same commit: `version` in `package.json`, and the root package's two `version` fields in `package-lock.json`. Minor and major bumps are decided by the maintainer. If a change shipped without an entry, record it under the next version in a `### Recorded late` table giving the commit and the release it first shipped in; never rewrite an entry that has been published.
2. **Zero dependencies.** Only Node's own `child_process` and `util`. Do not add a package, including a development convenience that ends up in the published tarball.
3. **Never guess.** A check that cannot run reports `UNKN`, never a pass. The exit code is `1` when any check fails or cannot be determined, and `0` only when every check passed or did not apply. This is the same discipline as a hook reporting `source: 'unavailable'` rather than inventing a reading.
4. **Read-only.** Every check inspects the device and the project; none installs anything, changes a setting or writes to the phone. Keep it that way: a diagnostic that changes what it is diagnosing cannot be trusted.
5. **Keep every surface current.** A change to a check, an option or an exit code changes, in the same commit or its pair: `README.md` here, and `docs/cli/doctor.md` and `docs/cli/checks.md` in pixelkit-docs. The default `--package` is the template's app id, `com.pixelkit.sdk`; if the template's id changes, change the default with it. Nothing checks either of these automatically.
6. **Coordinate with other agents.** Run `git status` and `git log --oneline -5` before editing and `git pull --rebase` before pushing; another agent may have committed.
7. **Publishing.** Pushing a `v*` tag publishes to npm through `release.yml`, so do it only when the maintainer asks.

## Validation

- `npm ci && npm run build` must succeed.
- `node build/index.js doctor` must run with no device and no PixelKit project present and exit `1` without throwing. CI does exactly this.
- `npm pack --dry-run` shows what would be published.

## Map

```
index.ts                     the whole CLI: argument parsing, the six checks, the report
build/                       compiled output, what is published
.github/workflows/build.yml  build, run doctor with no device, pack
.github/workflows/release.yml  publishes on a v* tag, with provenance
```
