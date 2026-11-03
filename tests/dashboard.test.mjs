import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dashboardModel, dashboardTables, displayDate, loadDashboard } from '../integration/dashboard.mjs';
import { sharedShell } from '../scripts/shared-shell.mjs';
import { currencies, dateFormats } from '../auth/options.mjs';

const data = () => Object.fromEntries(dashboardTables.map(table => [table,
  table === 'households' ? [{ id: 'home-a', name: 'Georgiou Family', currency: 'EUR', date_format: 'eu' }] : []]));

test('shared Dashboard calculates existing monthly KPIs with decimal-safe sums and no local data', () => {
  const input = data();
  input.household_transactions = [
    { transaction_date: '2026-11-01', transaction_type: 'Income', amount: '1000.10' },
    { transaction_date: '2026-11-02', transaction_type: 'Expense', amount: '100.20' },
    { transaction_date: '2026-10-01', transaction_type: 'Expense', amount: 9999 }
  ];
  input.household_bills = [{ due_date: '2026-11-05', is_paid: false, amount: '50.30' }, { due_date: '2026-11-05', is_paid: true, amount: 100 }];
  input.household_tasks = [{ id: 'one', title: 'Open', is_done: false }, { id: 'two', is_done: true }];
  const before = structuredClone(input);
  const model = dashboardModel(input, '2026-11-03');
  assert.equal(model.openTaskCount, 1); assert.equal(model.balance, 899.9); assert.equal(model.billsDue, 50.3);
  assert.equal(model.expenses, 100.2); assert.ok(model.savingsRate > 89 && model.savingsRate < 90);
  assert.deepEqual(input, before); assert.ok(Object.isFrozen(model));
});

test('upcoming events, warranty reminders, meals and budgets map to existing Dashboard widgets', () => {
  const input = data();
  input.household_events = [{ title: 'Later', event_date: '2026-11-09' }, { title: 'Today', event_date: '2026-11-03' }, { title: 'Out of range', event_date: '2026-11-10' }];
  input.inventory_items = [{ id: 'w', name: 'Oven', warranty_until: '2026-11-10' }];
  input.household_meals = [{ day_of_week: 'Tue', meal_type: 'Dinner', meal_name: 'Pasta' }, { day_of_week: 'Mon', meal_type: 'Dinner', meal_name: 'Old' }];
  input.household_budgets = [{ category: 'Utilities', amount: 100 }, { category: 'Groceries', amount: 200 }];
  input.household_transactions = [{ transaction_date: '2026-11-01', transaction_type: 'Expense', category: 'Bills & Utilities', amount: 50 }];
  const model = dashboardModel(input, '2026-11-03');
  assert.deepEqual(model.events.map(row => row.title), ['Today', 'Later']);
  assert.ok(model.reminders.some(row => row.title === 'Oven warranty'));
  assert.equal(model.meals[0].meal_name, 'Pasta');
  assert.equal(model.budget[0].category, 'Groceries'); assert.equal(model.budget[1].label, '50%');
});

test('empty data stays empty, invalid values fail closed, and readable options retain internal codes', () => {
  const model = dashboardModel(data(), '2026-11-03');
  assert.equal(model.balance, 0); assert.equal(model.savingsRate, 0); assert.deepEqual(model.meals, []);
  const invalid = data(); invalid.household_transactions = [{ transaction_date: '2026-11-03', transaction_type: 'Income', amount: 'bad' }];
  assert.throws(() => dashboardModel(invalid, '2026-11-03'), error => error.code === 'INVALID_AMOUNT');
  assert.equal(displayDate('2026-11-03', 'eu'), '03/11/2026'); assert.equal(displayDate('2026-11-03', 'us'), '11/03/2026');
  assert.match(currencies.EUR, /Euro/); assert.match(dateFormats.eu, /Day\/Month\/Year/);
});

test('loading requires stable observations and never silently accepts changing household data', async () => {
  const input = data(); let rounds = 0;
  const stable = { async read(table) { if (table === 'households') rounds++; return input[table]; } };
  assert.deepEqual(await loadDashboard(stable), input); assert.equal(rounds, 2);
  let version = 0;
  const changing = { async read(table) { return table === 'households' ? [{ name: String(++version) }] : []; } };
  await assert.rejects(loadDashboard(changing), error => error.code === 'CHANGING_SNAPSHOT');
});

test('authenticated shell reuses original Dashboard styles and markup without running legacy bootstrap or inline handlers', async () => {
  const original = await readFile('index.html', 'utf8'); const html = sharedShell(original);
  assert.ok(html.includes('<div id="dashboard" class="page active">'));
  assert.ok(html.includes('id="budget"')); assert.ok(html.includes('id="mealPreview"'));
  assert.doesNotMatch(html, /onclick=|onchange=|finishOnboarding|fccLoadLocalData|localStorage|persistAndRender/);
  assert.ok(!html.includes('id="onboarding"'));
  assert.match(html, /integration\/dashboard-app.mjs/); assert.match(html, /script-src 'self'/);
});

test('shared account UI has no record editor, registration has no display name, and Dashboard has no write executor', async () => {
  const account = await readFile('auth/app.mjs', 'utf8');
  assert.doesNotMatch(account, /openEditor|renderHousehold|Add record|service\.write|service\.remove|display_name/);
  assert.match(account, /location\.replace\('app.html'\)/);
  const dashboard = await readFile('integration/dashboard-app.mjs', 'utf8');
  assert.doesNotMatch(dashboard, /localStorage|sessionStorage|innerHTML|\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
});
