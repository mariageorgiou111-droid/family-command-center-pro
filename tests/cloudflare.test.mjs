import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

test('Cloudflare command builds complete assets, validates output and keeps auth fail-closed', async () => {
  await mkdir('work', { recursive: true });
  const directory = await mkdtemp(path.resolve('work/cloudflare-test-'));
  const env = { ...process.env, SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '', SUPABASE_ANON_KEY: '' };
  // Invoke npm through Node when npm itself launched this test: Windows cannot\n  // reliably spawn the extensionless npm shim with execFileSync.\n  const npmCli = process.env.npm_execpath;\n  const run = (args, overrides = {}) => execFileSync(npmCli ? process.execPath : 'npm', npmCli ? [npmCli, 'run', ...args] : ['run', ...args], {
    cwd: directory, env: { ...env, ...overrides }, stdio: 'pipe', encoding: 'utf8'
  });
  try {
    for (const file of ['package.json', 'index.html', 'shared.html', 'auth', 'scripts', 'wrangler.jsonc']) {
      await cp(file, path.join(directory, file), { recursive: true });
    }
    const config = JSON.parse(await readFile(path.join(directory, 'wrangler.jsonc'), 'utf8'));
    assert.equal(config.assets.directory, './dist');
    assert.match(run(['build:cloudflare']), /Validated 7 Cloudflare static assets; shared authentication disabled/);
    assert.equal(await readFile(path.join(directory, 'dist/auth/config.js'), 'utf8'), 'window.FCC_AUTH_CONFIG = null;\n');
    const original = await readFile(path.join(directory, 'dist/index.html'));
    assert.throws(() => run(['build']), /Command failed/);
    assert.throws(() => run(['build:cloudflare'], { SUPABASE_URL: 'https://test.supabase.co' }), /Command failed/);
    assert.throws(() => run(['build:cloudflare'], { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_secret_forbidden' }), /Command failed/);
    assert.ok(original.equals(await readFile(path.join(directory, 'dist/index.html'))), 'Invalid configuration must leave existing build output intact');
    assert.match(run(['build:cloudflare'], { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }), /shared authentication configured/);
    await writeFile(path.join(directory, 'dist/.env'), 'must not ship');
    assert.throws(() => run(['check:cloudflare']), /Command failed/);
    await rm(path.join(directory, 'dist/.env'));
    await writeFile(path.join(directory, 'dist/auth/app.mjs'), 'corrupted');
    assert.throws(() => run(['check:cloudflare']), /Command failed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
