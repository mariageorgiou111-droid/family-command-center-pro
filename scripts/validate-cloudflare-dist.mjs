import assert from 'node:assert/strict';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { publicConfig } from './build.mjs';

const assets = [
  'index.html', 'shared.html', 'auth/app.mjs', 'auth/config.js',
  'auth/domains.mjs', 'auth/service.mjs', 'auth/style.css'
];

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    const stat = await lstat(path);
    assert.ok(!stat.isSymbolicLink(), `Symbolic link is not publishable: ${path}`);
    if (stat.isDirectory()) result.push(...await files(path));
    else { assert.ok(stat.isFile(), `Not a regular asset: ${path}`); result.push(path.slice(5)); }
  }
  return result;
}

assert.deepEqual((await files('dist')).sort(), [...assets].sort(), 'dist must contain exactly the active workspace and auth assets');
for (const path of assets.filter(path => path !== 'auth/config.js')) {
  const [source, output] = await Promise.all([readFile(path), readFile(`dist/${path}`)]);
  assert.ok(output.length > 0, `Empty asset: ${path}`);
  assert.ok(source.equals(output), `Built asset differs from source: ${path}`);
}

const source = await readFile('dist/auth/config.js', 'utf8');
const match = source.match(/^window\.FCC_AUTH_CONFIG = (.+);\n$/);
assert.ok(match, 'Expected generated public auth configuration');
const config = JSON.parse(match[1]);
if (config !== null) {
  assert.deepEqual(config, publicConfig({ SUPABASE_URL: config.url, SUPABASE_PUBLISHABLE_KEY: config.key }));
}
console.log(`Validated ${assets.length} Cloudflare static assets; shared authentication ${config ? 'configured' : 'disabled'}.`);
