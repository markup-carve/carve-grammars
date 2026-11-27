// Every TextMate pattern must compile in PHP mbstring's Oniguruma, the engine
// Phiki (Torchlight, wp-carve) runs. It refuses variable-length lookbehinds
// that vscode-oniguruma accepts, and Phiki then drops the rule silently
// (carve-grammars#979: `*bold*` lost its scope).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const KNOWN = {};

// Prepares each pattern the way Phiki's Support\Regex does before mb_ereg_search_pos().
const php = String.raw`<?php
$grammar = json_decode(file_get_contents($argv[1]), true);
mb_regex_encoding('UTF-8');
$out = ['total' => 0, 'failed' => []];
$walk = function ($node, $path) use (&$walk, &$out) {
    foreach ($node as $key => $value) {
        if (in_array($key, ['match', 'begin', 'end', 'while'], true) && is_string($value)) {
            $out['total']++;
            $pattern = str_replace('\\z', '$(?!\\n)(?<!\\n)', $value);
            $pattern = preg_replace('/\\\\[AG]/', "\u{FFFF}", $pattern);
            $pattern = preg_replace('/\\\\\d+/', '', $pattern);
            $error = null;
            set_error_handler(function ($no, $message) use (&$error) { $error = $message; return true; });
            mb_ereg_search_init('x');
            mb_ereg_search_pos($pattern);
            restore_error_handler();
            if ($error !== null) $out['failed'][] = ['path' => "$path/$key", 'error' => $error];
        } elseif (is_array($value)) {
            $walk($value, "$path/$key");
        }
    }
};
$walk($grammar['repository'], '');
echo json_encode($out);
`;

const probe = spawnSync('php', ['-r', 'echo function_exists("mb_ereg_search_pos") ? MB_ONIGURUMA_VERSION : "";'], { encoding: 'utf8' });
if (probe.status !== 0 || !probe.stdout) {
    if (process.env.CI) assert.fail('PHP with mbstring is required for the Oniguruma compile check');
    console.log('textmate oniguruma compile: skipped (no PHP with mbstring)');
    process.exit(0);
}

const run = spawnSync('php', ['--', resolve('textmate/carve.tmLanguage.json')], { input: php, encoding: 'utf8', maxBuffer: 1 << 26 });
assert.equal(run.status, 0, run.stderr);
const { total, failed } = JSON.parse(run.stdout);
const byRule = {};
for (const { path } of failed) {
    const rule = path.split('/')[1];
    (byRule[rule] ??= []).push(path);
}
const problems = [];
for (const [rule, paths] of Object.entries(byRule)) {
    if (paths.length > (KNOWN[rule] ?? 0)) problems.push(`${rule}: ${paths.length} refused (known ${KNOWN[rule] ?? 0}): ${paths.join(', ')}`);
}
for (const [rule, count] of Object.entries(KNOWN)) {
    const now = byRule[rule]?.length ?? 0;
    if (now < count) problems.push(`${rule}: ${now} refused, lower KNOWN from ${count}`);
}
assert.deepEqual(problems, [], `Oniguruma ${probe.stdout} (PHP mbstring) refuses patterns:\n${problems.join('\n')}`);
console.log(`textmate oniguruma compile: ${total} patterns, ${failed.length} known refusals, Oniguruma ${probe.stdout}`);
