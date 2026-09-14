# Changelog

All notable changes to `@pixelkit-labs/cli` are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

**Rule:** every change bumps the patch version by 0.0.1 and adds an entry here in the same commit. Set `version` in `package.json`, and the root package's two `version` fields in `package-lock.json` with it. Minor and major bumps are decided by the maintainer, not by agents.

## [1.5.6] - 2026-09-13

### Added
- This changelog, and agent guides — `AGENTS.md`, `CLAUDE.md` and `GEMINI.md`, identical copies — so every agent working here follows the same rules.

### Fixed
- The header comment in `index.ts` named its path as `packages/cli/index.ts`, from when the CLI lived in the SDK monorepo.

## [1.5.5] - 2026-09-08

The first release from this repository, published as `@pixelkit-labs/cli`, and the first version run against a real Pixel 11 Pro.

- `pixelkit doctor` runs six read-only checks — adb and a single connected device, the device's identity, whether the PixelKit development build is installed, whether `@pixelkit-labs/native` and `@pixelkit-labs/mlkit` resolve from the current project, whether AICore is present, and whether `adb reverse tcp:8081` is set — and reports each as `PASS`, `FAIL`, `N/A` or `UNKN`.
- Exit code `0` only when every check passed or did not apply; `1` when any failed or could not be determined.
- No dependencies beyond Node's own `child_process` and `util`.

## Before 1.5.5

`doctor` was first built inside the pixelkit-sdk monorepo as `@pixelkit/cli` (pixelkit-sdk 1.1.15), moved to this repository the release after, and was renamed to `@pixelkit-labs/cli` when the packages moved to the PixelKit-Labs scope. npm also has 1.4.3, 1.5.0 and 1.5.1, which predate this changelog; the CLI's history before this repository is in the pixelkit-sdk changelog.
