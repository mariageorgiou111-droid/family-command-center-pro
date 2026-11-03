import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createDraft, identity, registry } from '../integration/records.mjs';
import { HouseholdStore } from '../integration/store.mjs';
import { ReadOnlyHouseholdRepository } from '../integration/repository.mjs';
import { recordElement } from '../integration/render.mjs';
import { captureLocalSnapshot } from '../integration/local-snapshot.mjs';

const scope = { userId: 'person-a', householdId: 'home-a', role: 'member' };
const row = (id = 'task-one', extra = {}) => ({ id, household_id: 'home-a', title: 'Original',
  updated_at: '2026-11-03T10:00:00.000Z', ...extra });
const code = expected => error => error.code === expected;
function loadedStore(rows = [row()]) {
  const store = new HouseholdStore(); store.activate(scope);
  store.finishLoad(store.beginLoad('household_tasks'), rows);
  return store;
}

test('registry covers all twelve shared domains plus existing household settings', () => {
  assert.equal(Object.keys(registry).length, 13);
  assert.equal(registry.household_budgets.key, 'category');
  assert.equal(registry.households.tenant, 'id');
  assert.throws(() => identity('profiles', row(), scope), code('UNKNOWN_TABLE'));
});

test('stable IDs retain identity across edits, households and collection order', () => {
  const original = { title: 'Draft' }; let allocations = 0;
  const draft = createDraft(original, () => { allocations++; return 'new-id'; });
  const edited = createDraft({ ...draft, title: 'Changed' }, () => { allocations++; return 'wrong'; });
  assert.equal(edited.id, 'new-id'); assert.equal(allocations, 1);
  assert.equal(original.id, undefined);
  assert.notEqual(identity('household_tasks', row(), scope), identity('household_events', row(), scope));
  assert.throws(() => identity('household_tasks', row('x', { household_id: 'other' }), scope), code('WRONG_HOUSEHOLD'));
  assert.throws(() => createDraft({ id: '' }), code('MISSING_ID'));
});

test('store copies and freezes rows and rejects wrong-household batches atomically', () => {
  const input = row('one', { details: { value: 1 } }); const store = loadedStore([input]);
  input.title = 'Changed outside'; input.details.value = 2;
  assert.equal(store.list('household_tasks')[0].title, 'Original');
  assert.equal(store.list('household_tasks')[0].details.value, 1);
  assert.throws(() => { store.list('household_tasks')[0].title = 'Mutation'; }, TypeError);
  assert.throws(() => store.finishLoad(store.beginLoad('household_tasks'), [row('valid'), row('foreign', { household_id: 'home-b' })]), code('WRONG_HOUSEHOLD'));
  assert.equal(store.list('household_tasks')[0].id, 'one');
  assert.throws(() => store.finishLoad(store.beginLoad('household_tasks'), [row(), row()]), code('DUPLICATE_ID'));
});

test('logout, account switch and out-of-order reads cannot restore old household records', () => {
  const store = loadedStore(); const old = store.beginLoad('household_tasks');
  const newer = store.beginLoad('household_tasks');
  store.finishLoad(newer, [row('new')]);
  assert.throws(() => store.finishLoad(old, [row('old')]), code('STALE_CONTEXT'));
  const pending = store.beginLoad('household_tasks');
  store.clear(); assert.equal(store.scope, null);
  assert.throws(() => store.finishLoad(pending, [row()]), code('STALE_CONTEXT'));
  store.activate({ ...scope, householdId: 'home-b' });
  assert.equal(store.list('household_tasks').length, 0);
});

test('edit targets use IDs even when a collection is reordered', () => {
  const store = loadedStore([row('first'), row('second')]);
  const edit = store.beginEdit('household_tasks', 'first');
  store.finishLoad(store.beginLoad('household_tasks'), [row('second'), row('first')]);
  const intent = store.prepareUpdate(edit, { notes: 'My draft' });
  assert.equal(intent.key, 'first'); assert.equal(intent.executable, false);
  assert.equal(intent.expectedUpdatedAt, row().updated_at);
  assert.equal(store.list('household_tasks')[1].notes, undefined);
});

test('remote edits, deletes and changed account contexts reject stale edits without altering drafts', () => {
  const store = loadedStore(); const edit = store.beginEdit('household_tasks', 'task-one');
  const draft = { title: 'Keep my work' };
  store.finishLoad(store.beginLoad('household_tasks'), [row('task-one', { title: 'Other person' })]);
  assert.throws(() => store.prepareUpdate(edit, draft), code('EDIT_CONFLICT'));
  assert.deepEqual(draft, { title: 'Keep my work' });
  store.finishLoad(store.beginLoad('household_tasks'), []);
  assert.throws(() => store.prepareUpdate(edit, draft), code('NOT_FOUND'));
  store.activate(scope);
  assert.throws(() => store.prepareUpdate(edit, draft), code('STALE_CONTEXT'));
});

test('update intents reject tenant, identity and audit changes and require revisions', () => {
  const store = loadedStore(); const edit = store.beginEdit('household_tasks', 'task-one');
  for (const field of ['household_id', 'id', 'created_by', 'updated_by', 'updated_at', '__proto__']) {
    assert.throws(() => store.prepareUpdate(edit, { [field]: 'forged' }), code('FORBIDDEN_FIELD'));
  }
  assert.throws(() => store.prepareUpdate(edit, { title: undefined }), code('INVALID_PATCH'));
  const noRevision = loadedStore([row('old', { updated_at: '' })]);
  assert.throws(() => noRevision.beginEdit('household_tasks', 'old'), code('MISSING_REVISION'));
});

test('household settings require admin intent and budget categories cannot be renamed', () => {
  const store = new HouseholdStore(); store.activate(scope);
  store.finishLoad(store.beginLoad('households'), [{ id: 'home-a', name: 'Family', updated_at: row().updated_at }]);
  assert.throws(() => store.prepareUpdate(store.beginEdit('households', 'home-a'), { name: 'Rename' }), code('FORBIDDEN'));
  store.finishLoad(store.beginLoad('household_budgets'), [{ household_id: 'home-a', category: 'Home', amount: 10, updated_at: row().updated_at }]);
  assert.throws(() => store.prepareUpdate(store.beginEdit('household_budgets', 'Home'), { category: 'Other' }), code('FORBIDDEN_FIELD'));
});

function clientFixture(rows = []) {
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: scope.userId } } }) },
    from(table) {
      calls.push(['from', table]); let from = 0, to = 199;
      const query = {
        select(...args) { calls.push(['select', ...args]); return query; },
        eq(...args) { calls.push(['eq', ...args]); return query; },
        order(...args) { calls.push(['order', ...args]); return query; },
        range(start, end) { from = start; to = end; calls.push(['range', start, end]); return query; },
        maybeSingle() { return Promise.resolve({ data: { user_id: scope.userId, household_id: scope.householdId, role: scope.role } }); },
        then(resolve, reject) { return Promise.resolve({ data: rows.slice(from, to + 1) }).then(resolve, reject); }
      };
      return query;
    }
  };
  return { client, calls };
}

test('read-only repository requires verified server membership, paginates beyond 500 and scopes every page', async () => {
  const { client, calls } = clientFixture(Array.from({ length: 603 }, (_, i) => row(`task-${i}`)));
  const repository = new ReadOnlyHouseholdRepository(client);
  assert.equal(calls.length, 0);
  await assert.rejects(repository.read('household_tasks'), code('NO_MEMBERSHIP'));
  await repository.connect();
  const rows = await repository.read('household_tasks');
  assert.equal(rows.length, 603); assert.ok(Object.isFrozen(rows[0]));
  assert.equal(calls.filter(call => call[0] === 'eq' && call[1] === 'household_id' && call[2] === 'home-a').length, 4);
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'person-a'));
  assert.equal(repository.write, undefined); assert.equal(repository.rpc, undefined);
});

test('repository rejects foreign rows, incomplete pagination and unknown tables', async () => {
  const foreign = new ReadOnlyHouseholdRepository(clientFixture([row('x', { household_id: 'other' })]).client);
  await foreign.connect(); await assert.rejects(foreign.read('household_tasks'), code('WRONG_HOUSEHOLD'));
  const repository = new ReadOnlyHouseholdRepository(clientFixture([row('one'), row('two')]).client);
  await repository.connect();
  await assert.rejects(repository.read('household_tasks', { pageSize: 1, maxPages: 1 }), code('INCOMPLETE_READ'));
  await assert.rejects(repository.read('fcc_private.household_invitations'), code('UNKNOWN_TABLE'));
  await assert.rejects(repository.read('household_tasks', { pageSize: 0 }), code('INVALID_PAGE'));
});

test('repository authorization and in-flight auth verification fail closed', async () => {
  const { client } = clientFixture();
  client.auth.getUser = async () => ({ error: new Error('Expired session') });
  const repository = new ReadOnlyHouseholdRepository(client);
  await assert.rejects(repository.connect(), code('UNAUTHENTICATED')); assert.equal(repository.scope, null);
  let resolve; client.auth.getUser = () => new Promise(done => { resolve = done; });
  const pending = repository.connect(); repository.clear();
  resolve({ data: { user: { id: scope.userId } } });
  await assert.rejects(pending, code('STALE_CONTEXT')); assert.equal(repository.scope, null);
});

test('repository clears in-flight reads on logout and preserves backend errors', async () => {
  const { client } = clientFixture(); const repository = new ReadOnlyHouseholdRepository(client);
  await repository.connect(); let resolve;
  const query = { select() { return query; }, eq() { return query; }, order() { return query; },
    range() { return new Promise(done => { resolve = done; }); } };
  client.from = () => query;
  const pending = repository.read('household_tasks'); repository.clear(); resolve({ data: [row()] });
  await assert.rejects(pending, code('STALE_CONTEXT'));
  const broken = clientFixture(); const failure = new Error('RLS denied');
  const second = new ReadOnlyHouseholdRepository(broken.client); await second.connect();
  broken.client.from = () => {
    const denied = { select() { return denied; }, eq() { return denied; }, order() { return denied; },
      range: async () => ({ error: failure }) };
    return denied;
  };
  await assert.rejects(second.read('household_tasks'), failure);
});

test('safe renderer treats malicious titles and notes as text, with ID-based listeners', () => {
  const document = { createElement(tag) { return { tag, dataset: {}, children: [], listeners: {},
    set innerHTML(_) { throw new Error('Unsafe rendering'); },
    append(...children) { this.children.push(...children); },
    addEventListener(event, fn) { this.listeners[event] = fn; } }; } };
  const attack = '<img src=x onerror="alert(1)"><script>attack()</script>';
  let edited;
  const element = recordElement(document, { id: 'stable-id', title: attack, notes: attack, onEdit: id => { edited = id; } });
  assert.equal(element.children[0].textContent, attack); assert.equal(element.children[1].textContent, attack);
  element.children[2].listeners.click(); assert.equal(edited, 'stable-id');
});

test('raw snapshot preserves malformed bytes and unknown fields without parsing, normalizing or reading auth keys', () => {
  const values = new Map([['fccProDataV7_6_QA', ' {malformed: raw bytes '], ['fccProDataV7', '{"futureField":42}']]);
  const keys = [];
  const snapshot = captureLocalSnapshot(key => { keys.push(key); return values.get(key) ?? null; });
  assert.equal(snapshot.values.fccProDataV7_6_QA, values.get('fccProDataV7_6_QA'));
  assert.equal(snapshot.values.fccProDataV7, '{"futureField":42}');
  assert.equal(values.size, 2); assert.ok(!keys.some(key => /auth|supabase/i.test(key)));
  assert.equal(snapshot.values.fccFamilyName, null); assert.ok(Object.isFrozen(snapshot.values));
});

test('foundation is not imported by active pages and cannot ship in the current static build', async () => {
  for (const file of ['index.html', 'shared.html', 'auth/app.mjs', 'scripts/build.mjs']) {
    assert.doesNotMatch(await readFile(file, 'utf8'), /integration\//);
  }
  for (const file of ['records', 'store', 'repository', 'render', 'local-snapshot']) {
    const source = await readFile(`integration/${file}.mjs`, 'utf8');
    assert.doesNotMatch(source, /localStorage|sessionStorage|\.setItem\(|\.removeItem\(|\.insert\(|\.update\(|\.rpc\(/);
  }
});

test('existing app, auth, build and Phase 2A files retain the approved baseline hashes', async () => {
  // Fixed blob IDs make the scope contract portable without a Git checkout.
  const paths = JSON.parse(await readFile('tests/fixtures/foundation-baseline.json', 'utf8'));
  for (const [file, expected] of Object.entries(paths)) {
    const bytes = await readFile(file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, `${file} changed outside the dormant foundation`);
  }
});
