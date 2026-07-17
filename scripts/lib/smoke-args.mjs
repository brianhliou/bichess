// Declarative CLI arg parsing for the prod smoke scripts.
//
// Each smoke declares its flags once; parsing, validation, `--help` output,
// and the unknown-argument error stay identical across scripts instead of
// drifting as N hand-rolled loops.

export function requiredValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

export function parsePositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

// spec: {
//   usage: 'npm run prod:smoke:dxq -- [options]',
//   description?: 'paragraph printed between usage and options',
//   flags: {
//     '--base': { key: 'baseUrl', placeholder: '<url>', help: '...' },
//     '--timeout-ms': { key: 'timeoutMs', placeholder: '<ms>', kind: 'positive-int', help: '...' },
//     '--engine': { key: 'engineIds', placeholder: '<id>', repeatable: true, help: '...' },
//   },
// }
// Returns { [key]: value } with null (or [] for repeatable) defaults. `--help`
// and `-h` print help and exit 0; unknown arguments throw.
export function parseSmokeArgs(args, spec, { exit = (code) => process.exit(code) } = {}) {
  const result = {};
  for (const flagSpec of Object.values(spec.flags)) {
    result[flagSpec.key] = flagSpec.repeatable ? [] : null;
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      console.log(formatHelp(spec));
      exit(0);
      return result;
    }
    const flagSpec = spec.flags[arg];
    if (!flagSpec) throw new Error(`unknown argument: ${arg}`);
    let value = requiredValue(args, ++index, arg);
    if (flagSpec.kind === 'positive-int') value = parsePositiveInteger(value, arg);
    if (flagSpec.repeatable) result[flagSpec.key].push(value);
    else result[flagSpec.key] = value;
  }
  return result;
}

export function formatHelp(spec) {
  const entries = Object.entries(spec.flags).map(([flag, flagSpec]) => ({
    label: `${flag} ${flagSpec.placeholder ?? '<value>'}`,
    help: flagSpec.help ?? '',
  }));
  const width = Math.max(...entries.map((entry) => entry.label.length));
  const lines = entries.map((entry) => `  ${entry.label.padEnd(width)}  ${entry.help}`);
  return [
    `Usage: ${spec.usage}`,
    '',
    ...(spec.description ? [spec.description, ''] : []),
    'Options:',
    ...lines,
    '',
  ].join('\n');
}
