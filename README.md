# @pixelkit-labs/cli

Command-line diagnostics for [PixelKit](https://www.npmjs.com/package/pixelkit). Its only command,
`pixelkit doctor`, answers "why is everything showing —?" before you file an issue.

PixelKit hooks report `source: 'unavailable'` and render an em dash when a reading cannot be taken
on real hardware. That is correct behaviour, but on the wrong device, without a development build,
or without the native packages installed, every hook looks that way at once. `doctor` runs the
checks a maintainer would run by hand.

**Zero third-party dependencies.** It uses only Node's `child_process` and `util`.

```bash
npx @pixelkit-labs/cli doctor
```

or, installed as a dev dependency:

```bash
npm install --save-dev @pixelkit-labs/cli
npx pixelkit doctor
```

## What it checks

1. **adb on PATH and exactly one device connected** (`adb devices`). If several devices are
   connected, they are listed and you are told to pass `--serial`.
2. **The connected device's identity** — manufacturer, model, Android release, SDK int
   (`adb shell getprop`). States plainly whether it is a Pixel, because most hooks report
   `unavailable` otherwise.
3. **Whether a PixelKit-based development build is installed** (`adb shell pm path <package>`),
   keyed off `--package` (default `com.pixelkit.sdk`). Expo Go can never satisfy this: the Kotlin
   Expo Modules (`@pixelkit-labs/native`, `@pixelkit-labs/mlkit`) must be compiled in.
4. **Whether `@pixelkit-labs/native` and `@pixelkit-labs/mlkit` resolve from the current project**
   (`require.resolve` from the working directory), and which hook groups are therefore available.
   A missing `@pixelkit-labs/mlkit` is reported as informational, not a failure — it is the opt-in ML
   Kit package.
5. **Whether AICore is present on the device** (`adb shell pm list packages`, matched for
   "aicore"), which Gemini Nano needs. Not-applicable on a non-Pixel.
6. **Whether `adb reverse tcp:8081 tcp:8081` is set**, so a development client can reach Metro on
   localhost.

Each check is reported as `PASS`, `FAIL`, `N/A`, or `????` ("could not be determined" — the check
itself could not be run, for example because adb is missing or the device went offline).
`doctor` never guesses a result: an inconclusive check is reported as such, the same discipline
PixelKit hooks use for `source: 'unavailable'`.

## Options

```
pixelkit doctor [--package <id>] [--serial <serial>]

  --package <id>   Application id of the installed PixelKit development build
                    (default: com.pixelkit.sdk)
  --serial <id>    adb serial to target when more than one device is connected
  -h, --help        Show help
```

## Exit code

`0` when every check passed or was not applicable. `1` when any check failed, or could not be
determined at all.

MIT
