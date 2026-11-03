// Generate the authenticated Dashboard from the ORIGINAL page markup/styles.
// Never execute or copy its legacy local-data bootstrap into the shared shell.
export function sharedShell(source) {
  const app = source.indexOf('<div class="app">');
  const body = source.indexOf('<body');
  const scripts = source.indexOf('<script', app);
  if (app < body || body < 0 || scripts < app) throw new Error('Original application structure changed; review shared shell extraction.');
  let head = source.slice(0, body).replace(/<title>[\s\S]*?<\/title>/i, '<title>Family Command Center PRO</title>');
  const policy = "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://*.supabase.co; base-uri 'none'; form-action 'none'; object-src 'none'";
  head = head.replace('</head>', `<meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="${policy}"><link rel="stylesheet" href="integration/dashboard.css"></head>`);
  let markup = source.slice(app, scripts);
  markup = markup.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');
  markup = markup.replace(/<div role="note"[\s\S]*?<\/div>/, '<div id="sharedStatus" role="status" aria-live="polite">Checking your account…</div>');
  // The hidden shell is revealed only after authenticated, complete reads.
  return head + '<body class="shared-loading">' + markup +
    '<script src="auth/config.js"></script><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/dist/umd/supabase.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script><script type="module" src="integration/dashboard-app.mjs"></script></body></html>';
}
