# Shared integration foundation — first implementation phase

Historical scope for PR #4. The subsequent read-only Dashboard phase activates a
subset of this foundation; see `SHARED_DASHBOARD_PHASE.md` for current branch behavior.

Base: draft PR #3 at `86c24a58acf3ae8f62a8b05ffd9c4f35fe33e286`.
Branch: `codex/shared-integration-foundation`.

## Scope and activation boundary

This phase adds dormant integration primitives and tests for the future single
Family Command Center interface. **Neither application page imports these modules.**
The existing static build does not copy `integration/` into its assets. Existing
pages, auth, local-storage behavior, calculations, themes, and generated production
assets retain their previous behavior. No feature flag can activate shared writes
in this phase, and no new record-entry interface is introduced.

No SQL, database mutation executor, migration, Realtime connection, SDK client
creation, or automatic local-storage access is included. The repository is
read-only, requires an explicitly supplied client, and does nothing until called.
Tests use fake SDK clients and synthetic data; they never connect to Supabase.

Validation completed in this environment: all **29** tests passed (16 new
foundation tests plus the 13 existing tests); the Chromium suite passed, including
the malicious-text/stable-ID fixture; syntax checks and `build:cloudflare` passed.
The build still validates exactly seven existing static assets. No live backend
or server-enforced concurrency claim is made by these results.

## Implemented modules

| Module | Contract |
| --- | --- |
| `integration/records.mjs` | Reuses the reviewed field definitions for all twelve domain tables; adds existing household settings; validates stable identities and household boundaries; creates immutable, in-memory new-record drafts without altering source objects. |
| `integration/store.mjs` | Immutable household collections; atomic response validation; per-table load tickets discard out-of-order results; context generations discard responses after logout/account changes; ID-based edit snapshots and local conflict detection. |
| `integration/repository.mjs` | Explicit read-only adapter: verifies the user with `getUser()`, queries membership by that user, scopes every read to the returned household, and paginates rather than silently stopping at 500 records. Unknown tables and cross-household responses are rejected. |
| `integration/render.mjs` | Builds text-only record elements with DOM APIs. User content cannot become HTML, attributes, URLs or inline event handlers. Edit listeners capture a stable record ID, never an array index. |
| `integration/local-snapshot.mjs` | An explicit caller-provided reader captures raw values from nine known app keys. No parsing, normalization, repair, download, upload or storage writes; Supabase session keys are excluded. |

The single future application will use these modules beneath its **existing**
pages. Shared Household remains unchanged in this phase. Replacing its duplicate
entry forms is a later integration step, after the original pages are connected.

## Security and authorization boundaries

Client membership checks and tenant validation are defense in depth, not a
replacement for RLS. Existing Phase 2A grants, RLS, schemas and invitations are
unchanged. No browser service-role key is introduced.

The adapter privately holds its verified context. It queries the actual signed-in
user, not user-supplied household names or user metadata. Callers must clear the
repository and store on auth/account/membership changes when the auth bridge is
implemented. The generation guards reject old asynchronous responses once that
clear occurs; they do not independently listen to auth or membership events yet.

The original application's unsafe interpolation paths are **not fixed globally**
by this dormant renderer. Safe rendering has been implemented and tested as a
replacement primitive, but each original renderer must adopt it before untrusted
shared records are displayed. No existing renderer was silently rewritten here.

## Stable identity and concurrency contract

An entity key includes household, table, and primary key. Budgets retain their
category key; the household row retains its household ID. Existing record IDs are
preserved. Missing IDs can be allocated in an explicit new-record draft only;
there is no walk over legacy browser data and no migration of stored IDs.

An editor captures the record ID, original row, context generation and server
`updated_at`. Reordering a list cannot redirect an edit. A later changed or deleted
row rejects the attempted update, preserving the caller's draft. The generated
intent allowlists changed columns and excludes identity, tenant and audit fields.
Household settings intents require an owner/admin context.

**An intent is not executable.** No write method sends it anywhere. A future
executor must validate content and membership again and compare a server revision
atomically. Local conflict detection cannot prevent an unobserved server update.
The existing timestamp is recorded for the future contract but is not claimed to
be a complete server concurrency protocol. Monotonic record revisions, idempotent
request receipts and transactional compound operations remain separately reviewed
database work. Client-side intentions must always be treated as untrusted input.

Paginated reads support more than 500 records, stable key ordering, explicit
limits, duplicate detection and rejection of foreign rows. This is **not** a
transactional multi-page snapshot: concurrent insertions/deletions can still change
offset pagination without a detectable duplicate. Live financial/report loading
must not be activated until a snapshot/reconciliation strategy is implemented and
tested. No partial response is returned when the configured page safety limit is
exhausted.

The raw local snapshot helper is a foundation for the migration workflow, not a
complete backup/import feature. It preserves known keys byte-for-byte, including
malformed values and unknown fields within those values. It does not discover all
historical backup keys, certify a downloaded backup, assign migration IDs, detect
duplicates across browsers or import into the Georgiou Family household.

## Verification

Commands:

```sh
npm run test:foundation
npm test
npm run check
npm run test:browser
npm run build:cloudflare
```

The foundation tests cover all domain definitions, stable IDs, immutable rows,
cross-household batches, stale auth/load responses, reorder-safe editing,
concurrent-edit/delete conflicts, column/role guards, verified membership,
603-record loading, errors and safety limits, malicious text, raw snapshots, and
the dormant activation boundary. Fixed SHA-256 hashes in
`tests/fixtures/foundation-baseline.json` verify that existing application, auth,
build and Phase 2A files remain byte-identical to the approved baseline.

The Chromium suite also imports the dormant renderer on a test-only blank page.
It confirms that malicious HTML remains literal text, no injected script or image
element exists, the edit listener returns the stable ID, and seeded local data is
unchanged. The original auth flow suite remains in place. No test creates real
accounts, writes shared data or uses a real backend.

## Pending work and approvals

This phase does not make any original module shared. The next phases still need:

1. An auth bridge and read-only store hydration on the original pages, plus field
   mapping and calculation parity tests. Remove index-based handlers and unsafe
   interpolation as each module is connected.
2. Separately approved additive database changes for monotonic revisions,
   bill/transaction relationships, atomic savings and maintenance operations,
   mutation receipts, shared theme/timezone settings and import provenance.
3. Private household Realtime authorization, notifications and reconnect handling,
   plus complete/snapshot-safe report reads. No publication changes are made here.
4. Explicit backup/preview/approval/import and conflict resolution for each source
   browser, preserving originals and existing shared records.
5. The audited password-policy, auth-link, date-label and currency-selection fixes;
   removal of duplicate shared-record forms after original-page integration.
6. Staging RLS and browser-to-database tests with two members and an outsider.

Production database changes, actual data import, shared-write activation, merging
and production promotion all require separate approval. Nothing in this phase
constitutes approval for those actions.

## Draft PR and preview handling

The existing Git-connected Cloudflare integration generated preview versions on
previous PR branch pushes, and Vercel also reacts to branch changes. A remote push
can therefore create a hosted preview even without running a deploy command.
Do not push this foundation branch without approval for that automatic preview,
given the current instruction to obtain approval before deploying anything.

The work can be committed and validated locally first. With approval, push the
foundation branch and open a **new draft PR stacked on PR #3**, leaving PR #3's
source branch unchanged. The hosted application preview would remain unchanged:
the new foundation is deliberately not shipped. Its behavior is reviewable through
the isolated local Chromium fixture and tests, without inventing another product
interface. No public hosting is needed for these tests.

## Rollback

Since the modules are dormant and production assets are unchanged, reverting this
phase only removes the foundation modules, tests and documentation. No database
rollback, storage clearing or household-data restoration is necessary. Keep the
baseline hash fixture as evidence when reviewing later activation changes.
