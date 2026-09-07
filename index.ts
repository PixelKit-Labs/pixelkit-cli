#!/usr/bin/env node
/**
 * @file packages/cli/index.ts
 * @description `pixelkit doctor`: the first and only command of `@pixelkit/cli`. PixelKit hooks
 * report `source: 'unavailable'` and render an em dash when a reading cannot be taken on real
 * hardware; on the wrong device, without a development build, or without the native packages
 * installed, every hook looks that way at once. `doctor` runs the checks a maintainer would run
 * by hand — adb on PATH, the connected device's identity, the installed development build,
 * whether `@pixelkit/native` and `@pixelkit/mlkit` resolve from the current project, AICore, and
 * the Metro port forward — and reports each as pass, fail, not-applicable, or "could not
 * determine" when the check itself could not be run. No dependency other than Node's
 * `child_process` and `util`; nothing here is guessed.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * `pass` / `fail` / `n/a` are the three outcomes a check can reach. `unknown` is a fourth,
 * deliberate state for when the check itself could not be run (adb missing, device offline,
 * a transient adb error) — the same discipline as a hook's `source: 'unavailable'`: a result
 * that cannot be verified is reported as such, never guessed into a pass.
 */
type Status = 'pass' | 'fail' | 'n/a' | 'unknown';

interface CheckResult {
  name: string;
  status: Status;
  reason: string;
  fix?: string;
}

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
};

const STATUS_LABEL: Record<Status, string> = {
  pass: `${ANSI.green}PASS${ANSI.reset}`,
  fail: `${ANSI.red}FAIL${ANSI.reset}`,
  'n/a': `${ANSI.dim}N/A ${ANSI.reset}`,
  unknown: `${ANSI.yellow}UNKN${ANSI.reset}`,
};

type AdbError = NodeJS.ErrnoException & {
  stdout?: string;
  stderr?: string;
  killed?: boolean;
  signal?: NodeJS.Signals | null;
};

/**
 * Runs `adb <args>` via Node's `child_process.execFile` (promisified with `util.promisify`) and
 * returns its stdout, or a description of why the command could not be run. Never throws: every
 * failure mode (adb absent, device offline, timeout) becomes a value the caller reports.
 */
async function runAdb(
  args: string[],
  timeoutMs = 8000
): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  try {
    const { stdout } = await execFileAsync('adb', args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      windowsHide: true,
    });
    return { ok: true, stdout };
  } catch (err) {
    const e = err as AdbError;
    if (e.code === 'ENOENT') return { ok: false, error: 'adb is not on PATH' };
    if (e.killed || e.signal) {
      return { ok: false, error: `adb ${args.join(' ')} timed out after ${timeoutMs}ms` };
    }
    const stderr = (e.stderr || '').toString().trim();
    return { ok: false, error: stderr || e.message || String(err) };
  }
}

interface DeviceLine {
  serial: string;
  state: string;
}

/** Parses `adb devices` output: a header line, then `<serial>\t<state>` per connected device. */
function parseAdbDevices(stdout: string): DeviceLine[] {
  return stdout
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [serial, state] = l.split(/\s+/);
      return { serial, state };
    });
}

/**
 * Check 1: adb is on PATH and exactly one device is connected (`adb devices`). When a `--serial`
 * flag was given it is used to disambiguate instead of requiring exactly one device.
 */
async function checkAdbAndDevice(
  explicitSerial: string | undefined
): Promise<{ result: CheckResult; serial: string | null }> {
  const version = await runAdb(['version']);
  if (!version.ok) {
    return {
      result: {
        name: 'adb on PATH',
        status: 'fail',
        reason: version.error,
        fix: 'Install Android platform-tools and add it to PATH: https://developer.android.com/tools/releases/platform-tools',
      },
      serial: null,
    };
  }

  const devicesRes = await runAdb(['devices']);
  if (!devicesRes.ok) {
    return {
      result: {
        name: 'adb device',
        status: 'unknown',
        reason: `adb is on PATH but "adb devices" could not be run: ${devicesRes.error}`,
      },
      serial: null,
    };
  }

  const devices = parseAdbDevices(devicesRes.stdout);
  const ready = devices.filter((d) => d.state === 'device');

  if (explicitSerial) {
    const match = ready.find((d) => d.serial === explicitSerial);
    if (!match) {
      const seen = devices.length ? devices.map((d) => `${d.serial} (${d.state})`).join(', ') : 'none';
      return {
        result: {
          name: 'adb device',
          status: 'fail',
          reason: `--serial ${explicitSerial} is not connected in "device" state. Connected: ${seen}.`,
          fix: 'Run `adb devices` and pass one of the listed serials.',
        },
        serial: null,
      };
    }
    return {
      result: { name: 'adb device', status: 'pass', reason: `targeting ${explicitSerial} (--serial)` },
      serial: explicitSerial,
    };
  }

  if (devices.length === 0) {
    return {
      result: {
        name: 'adb device',
        status: 'fail',
        reason: 'no device connected.',
        fix: 'Connect the Pixel over USB (accept the RSA prompt) or `adb connect <ip>:<port>` for wireless adb, then re-run.',
      },
      serial: null,
    };
  }

  if (ready.length === 0) {
    return {
      result: {
        name: 'adb device',
        status: 'fail',
        reason: `${devices.length} device(s) present, none in "device" state: ${devices
          .map((d) => `${d.serial} (${d.state})`)
          .join(', ')}.`,
        fix: 'unauthorized: accept the USB debugging prompt on the device screen. offline: reconnect the cable or re-run `adb connect`.',
      },
      serial: null,
    };
  }

  if (ready.length > 1) {
    return {
      result: {
        name: 'adb device',
        status: 'fail',
        reason: `${ready.length} devices connected: ${ready.map((d) => d.serial).join(', ')}.`,
        fix: 'Re-run with --serial <serial> to target one of them.',
      },
      serial: null,
    };
  }

  return {
    result: { name: 'adb device', status: 'pass', reason: `${ready[0].serial} connected` },
    serial: ready[0].serial,
  };
}

/**
 * Check 2: the connected device's manufacturer, model, Android release and SDK int, read with
 * `adb shell getprop`. Most PixelKit hooks target Pixel-only APIs, so this states plainly whether
 * the device is a Pixel rather than leaving that to be inferred from a wall of em dashes.
 */
async function checkDeviceIdentity(
  serial: string | null
): Promise<{ result: CheckResult; manufacturer: string | null }> {
  if (!serial) {
    return {
      result: {
        name: 'Device identity',
        status: 'unknown',
        reason: 'skipped: no single adb device selected (see "adb device" above).',
      },
      manufacturer: null,
    };
  }

  const props = [
    'ro.product.manufacturer',
    'ro.product.model',
    'ro.build.version.release',
    'ro.build.version.sdk',
  ];
  const values: Record<string, string> = {};
  for (const prop of props) {
    const res = await runAdb(['-s', serial, 'shell', 'getprop', prop]);
    if (!res.ok) {
      return {
        result: { name: 'Device identity', status: 'unknown', reason: `could not read ${prop}: ${res.error}` },
        manufacturer: null,
      };
    }
    values[prop] = res.stdout.trim();
  }

  const manufacturer = values['ro.product.manufacturer'];
  const model = values['ro.product.model'];
  const release = values['ro.build.version.release'];
  const sdk = values['ro.build.version.sdk'];
  const summary = `${manufacturer} ${model}, Android ${release} (SDK ${sdk})`;
  const isPixel = manufacturer.toLowerCase() === 'google';

  if (!isPixel) {
    return {
      result: {
        name: 'Device identity',
        status: 'fail',
        reason: `${summary} — not a Pixel. Most PixelKit hooks are written against Pixel-only APIs and will report source: "unavailable" here.`,
      },
      manufacturer,
    };
  }

  return { result: { name: 'Device identity', status: 'pass', reason: summary }, manufacturer };
}

/**
 * Check 3: whether a PixelKit-based development build is installed (`adb shell pm path
 * <package>`), keyed off `--package` (default `com.pixelkit.sdk`). Expo Go can never satisfy this
 * check: `@pixelkit/native` and `@pixelkit/mlkit` are Kotlin Expo Modules that must be compiled
 * into a development build, so that limitation is stated regardless of the result.
 */
async function checkDevBuild(serial: string | null, packageId: string): Promise<CheckResult> {
  if (!serial) {
    return { name: 'PixelKit development build', status: 'unknown', reason: 'skipped: no single adb device selected.' };
  }

  const res = await runAdb(['-s', serial, 'shell', 'pm', 'path', packageId]);
  const installed = res.ok && /^package:/m.test(res.stdout.trim());
  const goNote =
    'Expo Go can never run PixelKit: @pixelkit/native and @pixelkit/mlkit are compiled Kotlin Expo Modules, so a development build is required.';

  if (installed) {
    return {
      name: 'PixelKit development build',
      status: 'pass',
      reason: `${packageId} is installed on ${serial}. ${goNote}`,
    };
  }

  return {
    name: 'PixelKit development build',
    status: 'fail',
    reason: `${packageId} is not installed on ${serial}. ${goNote}`,
    fix: `Build a development client and install it — npx expo run:android (or eas build --profile development), then adb -s ${serial} install -r -g <path-to-apk>. Pass --package <id> if your app id differs.`,
  };
}

/**
 * Check 4: whether `@pixelkit/native` and `@pixelkit/mlkit` resolve from the current project
 * (`require.resolve` from `process.cwd()`, walking the real node_modules chain — nothing is
 * assumed from package.json alone). `@pixelkit/mlkit` is opt-in, so its absence is reported as
 * informational (`n/a`), never a failure.
 */
function resolveFrom(name: string, cwd: string): { ok: true; path: string } | { ok: false; error: string } {
  try {
    const path = require.resolve(name, { paths: [cwd] });
    return { ok: true, path };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function checkNativeModules(cwd: string): CheckResult[] {
  const native = resolveFrom('@pixelkit/native', cwd);
  const mlkit = resolveFrom('@pixelkit/mlkit', cwd);
  const results: CheckResult[] = [];

  if (native.ok) {
    results.push({
      name: '@pixelkit/native resolvable',
      status: 'pass',
      reason: `resolved from ${native.path}. Silicon (SoC, CPU, memory, thermal, GPU), display, torch and haptics hooks are available.`,
    });
  } else {
    results.push({
      name: '@pixelkit/native resolvable',
      status: 'fail',
      reason: `not resolvable from ${cwd}. Silicon, display, torch and haptics hooks will report source: "unavailable".`,
      fix: 'npm install @pixelkit/native (or install `pixelkit`, which depends on it directly).',
    });
  }

  if (mlkit.ok) {
    results.push({
      name: '@pixelkit/mlkit resolvable',
      status: 'pass',
      reason: `resolved from ${mlkit.path}. Gemini Nano / on-device ML Kit hooks are available.`,
    });
  } else {
    results.push({
      name: '@pixelkit/mlkit resolvable',
      status: 'n/a',
      reason: `not resolvable from ${cwd}. This is opt-in, not a failure — Gemini Nano / on-device ML Kit hooks report source: "unavailable" without it.`,
      fix: 'npm install @pixelkit/mlkit to enable on-device ML Kit hooks.',
    });
  }

  return results;
}

/**
 * Check 5: whether AICore is present (`adb shell pm list packages`, matched for "aicore"), which
 * Gemini Nano needs. Not-applicable on a device that Check 2 already found is not a Pixel.
 */
async function checkAiCore(serial: string | null, manufacturer: string | null): Promise<CheckResult> {
  if (manufacturer && manufacturer.toLowerCase() !== 'google') {
    return { name: 'AICore', status: 'n/a', reason: `device manufacturer is ${manufacturer}, not Google; AICore is a Pixel component.` };
  }
  if (!serial) {
    return { name: 'AICore', status: 'unknown', reason: 'skipped: no single adb device selected.' };
  }

  const res = await runAdb(['-s', serial, 'shell', 'pm', 'list', 'packages']);
  if (!res.ok) {
    return { name: 'AICore', status: 'unknown', reason: `could not list packages: ${res.error}` };
  }

  const present = res.stdout.toLowerCase().includes('aicore');
  if (present) {
    return { name: 'AICore', status: 'pass', reason: 'a package matching "aicore" is installed. Gemini Nano can run through @pixelkit/mlkit.' };
  }

  return {
    name: 'AICore',
    status: 'fail',
    reason: 'no package matching "aicore" is installed. useGeminiNano and other on-device Gemini hooks will report source: "unavailable".',
    fix: 'AICore ships through Google Play services on supported Pixels; update Play services and the Play Store, then reboot.',
  };
}

/**
 * Check 6: whether `adb reverse tcp:8081 tcp:8081` is set (`adb reverse --list`), so a
 * development client can reach Metro on localhost.
 */
async function checkAdbReverse(serial: string | null): Promise<CheckResult> {
  if (!serial) {
    return { name: 'adb reverse tcp:8081', status: 'unknown', reason: 'skipped: no single adb device selected.' };
  }

  const res = await runAdb(['-s', serial, 'reverse', '--list']);
  if (!res.ok) {
    return { name: 'adb reverse tcp:8081', status: 'unknown', reason: `could not list adb reverse rules: ${res.error}` };
  }

  const set = res.stdout.split(/\r?\n/).some((l) => /tcp:8081\s+tcp:8081/.test(l));
  if (set) {
    return { name: 'adb reverse tcp:8081', status: 'pass', reason: 'set: the dev client can reach Metro at localhost:8081.' };
  }

  return {
    name: 'adb reverse tcp:8081',
    status: 'fail',
    reason: 'not set. A development build looking for Metro on localhost:8081 will not find it.',
    fix: `adb -s ${serial} reverse tcp:8081 tcp:8081`,
  };
}

interface Flags {
  packageId: string;
  serial?: string;
  help: boolean;
}

function parseArgs(argv: string[]): { command: string | undefined; flags: Flags } {
  const flags: Flags = { packageId: 'com.pixelkit.sdk', help: false };
  let command: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--package') {
      flags.packageId = argv[++i] ?? flags.packageId;
    } else if (arg.startsWith('--package=')) {
      flags.packageId = arg.slice('--package='.length);
    } else if (arg === '--serial') {
      flags.serial = argv[++i];
    } else if (arg.startsWith('--serial=')) {
      flags.serial = arg.slice('--serial='.length);
    } else if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (command === undefined) {
      command = arg;
    }
  }

  return { command, flags };
}

function printUsage(): void {
  console.log(`${ANSI.bold}pixelkit doctor${ANSI.reset} - diagnose why PixelKit hooks might report source: "unavailable"

Usage:
  pixelkit doctor [--package <id>] [--serial <serial>]

Options:
  --package <id>   Application id of the installed PixelKit development build (default: com.pixelkit.sdk)
  --serial <id>    adb serial to target when more than one device is connected
  -h, --help       Show this help
`);
}

function printResult(r: CheckResult): void {
  console.log(`[${STATUS_LABEL[r.status]}] ${ANSI.bold}${r.name}${ANSI.reset} - ${r.reason}`);
  if (r.fix) console.log(`${ANSI.dim}         fix: ${r.fix}${ANSI.reset}`);
}

/**
 * Runs all six checks in order and prints them. Returns the process exit code: 0 only when every
 * check passed or was not applicable; 1 when any check failed or — per the "never fabricate a
 * result" rule — could not be determined at all.
 */
async function doctor(flags: Flags): Promise<number> {
  console.log(`${ANSI.bold}PixelKit doctor${ANSI.reset}\n`);

  const results: CheckResult[] = [];

  const step1 = await checkAdbAndDevice(flags.serial);
  results.push(step1.result);
  const serial = step1.serial;

  const step2 = await checkDeviceIdentity(serial);
  results.push(step2.result);
  const manufacturer = step2.manufacturer;

  results.push(await checkDevBuild(serial, flags.packageId));
  results.push(...checkNativeModules(process.cwd()));
  results.push(await checkAiCore(serial, manufacturer));
  results.push(await checkAdbReverse(serial));

  for (const r of results) printResult(r);

  const failed = results.filter((r) => r.status === 'fail');
  const unresolved = results.filter((r) => r.status === 'unknown');
  const passed = results.filter((r) => r.status === 'pass');
  const notApplicable = results.filter((r) => r.status === 'n/a');

  console.log(
    `\n${passed.length} passed, ${failed.length} failed, ${unresolved.length} could not be determined, ${notApplicable.length} not applicable.`
  );

  return failed.length > 0 || unresolved.length > 0 ? 1 : 0;
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (flags.help) {
    printUsage();
    process.exitCode = 0;
    return;
  }

  if (!command) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (command !== 'doctor') {
    console.error(`Unknown command "${command}". The only command is "doctor".\n`);
    printUsage();
    process.exitCode = 1;
    return;
  }

  process.exitCode = await doctor(flags);
}

main().catch((err) => {
  console.error(`pixelkit doctor crashed: ${(err as Error).stack || String(err)}`);
  process.exitCode = 1;
});
