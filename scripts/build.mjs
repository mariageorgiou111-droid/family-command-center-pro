import { mkdir, rm, copyFile, cp, writeFile } from 'node:fs/promises';

export function publicConfig(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY).');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('SUPABASE_URL must be an HTTPS project origin.');
  }
  if (!key.startsWith('sb_publishable_')) {
    let payload;
    try { payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); } catch {}
    if (payload?.role !== 'anon') throw new Error('Only a publishable or anon key may be included in browser assets.');
  }
  return { url: parsed.origin, key };
}

export async function build(env = process.env) {
  const config = publicConfig(env); // Validate before replacing any build output.
  await rm('dist', { recursive: true, force: true });
  await mkdir('dist/auth', { recursive: true });
  // Only the current local workspace and authenticated application are served.
  // Historical HTML snapshots, SQL, tests and environment files are excluded.
  await Promise.all(['index.html', 'shared.html'].map(file => copyFile(file, `dist/${file}`)));
  await cp('auth', 'dist/auth', { recursive: true });
  await writeFile('dist/auth/config.js', `window.FCC_AUTH_CONFIG = ${JSON.stringify(config).replaceAll('<', '\\u003c')};\n`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await build();
