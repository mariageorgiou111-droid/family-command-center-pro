import { build } from './build.mjs';

// Build assets only. No Wrangler command, upload, or deployment is performed.
await build(process.env, { allowUnconfigured: true });
