# @pixelkit-labs/cli

Command-line diagnostics and autonomous hardware triage agents for [PixelKit](https://www.npmjs.com/package/@pixelkit-labs/sdk).

- **`pixelkit doctor`**: Validates device connectivity, ADB authorization, development build installation, and AICore readiness.
- **`pixelkit agent`**: Runs autonomous on-device hardware telemetry triage (CPU clusters, battery health, thermal throttling headroom, AICore) and queries Google Gen AI hardware triage agents.

**Zero third-party dependencies.** Built entirely on Node.js native `child_process`, `util`, and `fetch`.

---

## Quickstart

```bash
# Verify your device and development environment
npx @pixelkit-labs/cli doctor

# Run autonomous hardware diagnostic triage on the connected device
npx @pixelkit-labs/cli agent --diagnose

# Query the hardware agent with a specific question or instruction
npx @pixelkit-labs/cli agent --query "Analyze battery health and thermal headroom under heavy load"
```

---

## Commands

### `pixelkit doctor`

Performs end-to-end environment and device health checks:

1. **ADB Connectivity**: Verifies ADB is in `PATH` and identifies connected devices (`adb devices`).
2. **Device Hardware Identity**: Inspects manufacturer, model, Android release, and SDK API level via `getprop`. Verifies Google Pixel hardware features.
3. **Development Build Verification**: Confirms a development build containing the Kotlin native modules is installed (`adb shell pm path <package>`).
4. **Native Module Resolution**: Checks whether `@pixelkit-labs/native` and `@pixelkit-labs/mlkit` resolve in the active project.
5. **AICore & TPU Readiness**: Inspects whether the Google AICore system service is present on-device for Gemini Nano edge execution.
6. **Port Reverse Setup**: Verifies `adb reverse tcp:8081 tcp:8081` is configured for Metro bundler communication.

```bash
pixelkit doctor [--package <id>] [--serial <serial>]
```

#### Options:
- `--package <id>`: Application ID of the installed development build (default: `com.pixelkit.sdk`).
- `--serial <id>`: Target a specific device serial when multiple devices/emulators are connected.

---

### `pixelkit agent`

Interacts with the Google Gen AI hardware intelligence agent to inspect and diagnose device telemetry:

```bash
# Full automated hardware diagnosis
npx @pixelkit-labs/cli agent --diagnose

# Interactive query targeting a specific subsystem
npx @pixelkit-labs/cli agent --query "Check Wi-Fi 7 MLO and thermal status"

# Select model (defaults to gemini-2.5-flash)
npx @pixelkit-labs/cli agent --diagnose --model gemini-2.5-pro
```

#### Options:
- `--diagnose`: Collects real-time CPU, thermal, battery, and AICore telemetry and generates a structured verdict (`healthy`, `warning`, `critical`) with actionable recommendations.
- `--query <text>`: Asks the hardware diagnostic agent a custom question or gives it a specific analysis task.
- `--model <name>`: Specifies the Gemini model (default: `gemini-2.5-flash`).
- `--serial <id>`: Target device serial.

---

## Documentation

For full details on the PixelKit SDK, native modules, and hooks:
[https://pixelkit-labs.github.io/pixelkit-docs/](https://pixelkit-labs.github.io/pixelkit-docs/)

---

## License

MIT © PixelKit Labs
