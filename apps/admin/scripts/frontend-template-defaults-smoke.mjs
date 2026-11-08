import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const adminRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(adminRoot, 'src/routes/sites.$siteId.tsx'), 'utf8');
assert.match(source, /setFrontendTemplateDefaultDraft\(prev\.templatesJson, prev\.frontendDesign, type, templateId\)/, 'The selector must edit the current JSON draft');
assert.match(source, /if \(isFrontendDesignDraftDisabled \|\| !canConfigureSite\) return;/, 'Draft controls must keep permission and busy guards');
assert.match(source, /onClick=\{\(\) => void handleSaveFrontendDesign\(\)\}[\s\S]{0,600}data-testid="site-template-defaults-save"/, 'The selector must use the existing protected design save');
assert.match(source, /group\.options\.map\(\(template\)/, 'All eligible templates must be offered');
assert.doesNotMatch(source, /frontendDesignState\.frontendDesign\.templates\s*\.slice\(0, 8\)/, 'Registry display must not cap choices at eight');
const scratch = mkdtempSync(join(tmpdir(), 'backy-template-default-test-'));
try {
  // Vite aliases core to TS source; Node needs its built ESM entry for named exports.
  const config = join(scratch, 'tsconfig.json');
  writeFileSync(config, JSON.stringify({ extends: join(adminRoot, 'tsconfig.json'), compilerOptions: { paths: {} } }));
  const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), '--tsconfig', config,
    join(adminRoot, 'src/lib/frontendTemplateDefaults.test.ts')], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
