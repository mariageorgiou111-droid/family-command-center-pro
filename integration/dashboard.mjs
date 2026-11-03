import { immutable, invariant } from './records.mjs';

export const dashboardTables = Object.freeze(['households', 'household_tasks', 'household_bills',
  'household_transactions', 'household_budgets', 'household_events', 'household_meals', 'home_care_items', 'inventory_items']);

function cents(value) {
  const amount = Number(value);
  invariant(Number.isFinite(amount) && amount >= 0, 'INVALID_AMOUNT', 'A shared record contains an invalid amount.');
  const result = Math.round(amount * 100);
  invariant(Number.isSafeInteger(result), 'INVALID_AMOUNT', 'Amount exceeds safe calculation limits.');
  return result;
}
function sum(rows, field = 'amount') {
  const result = rows.reduce((total, row) => total + cents(row[field]), 0);
  invariant(Number.isSafeInteger(result), 'INVALID_AMOUNT', 'Total exceeds safe calculation limits.');
  return result / 100;
}
const isoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function automaticTheme(date) {
  const month = date.getMonth() + 1, day = date.getDate();
  if (month === 2 && day >= 7 && day <= 16) return 'valentine';
  if ((month === 3 && day >= 20) || month === 4) return 'easter';
  if (month === 10 && day >= 20) return 'halloween';
  if (month === 12) return 'christmas';
  return [3, 4, 5].includes(month) ? 'spring' : [6, 7, 8].includes(month) ? 'summer' : [9, 10, 11].includes(month) ? 'autumn' : 'winter';
}

export function dashboardModel(collections, today) {
  invariant(isoDate(today), 'INVALID_DATE', 'A valid current date is required.');
  const household = collections.households;
  invariant(household?.length === 1, 'NO_HOUSEHOLD', 'The household could not be verified.');
  const settings = household[0];
  invariant(['eu', 'us', 'iso'].includes(settings.date_format), 'INVALID_SETTINGS', 'Invalid household date format.');
  const month = today.slice(0, 7);
  const tx = collections.household_transactions.filter(row => row.transaction_date?.startsWith(month));
  const income = sum(tx.filter(row => row.transaction_type === 'Income'));
  const expenses = sum(tx.filter(row => row.transaction_type === 'Expense'));
  const balance = Math.round((income - expenses) * 100) / 100;
  const openTasks = collections.household_tasks.filter(row => !row.is_done);
  const unpaid = collections.household_bills.filter(row => !row.is_paid);
  const end = new Date(today + 'T12:00:00Z'); end.setUTCDate(end.getUTCDate() + 6);
  const endISO = end.toISOString().slice(0, 10);
  const events = [...collections.household_events].filter(row => isoDate(row.event_date) && row.event_date >= today && row.event_date <= endISO)
    .sort((a, b) => (a.event_date + (a.event_time || '')).localeCompare(b.event_date + (b.event_time || ''))).slice(0, 5);
  const priority = [...openTasks].sort((a, b) => (a.priority === 'High' ? 0 : 1) - (b.priority === 'High' ? 0 : 1)).slice(0, 2);
  const in30 = new Date(today + 'T12:00:00Z'); in30.setUTCDate(in30.getUTCDate() + 30);
  const in30ISO = in30.toISOString().slice(0, 10);
  const reminders = [
    ...priority.map(row => ({ id: row.id, title: row.title, detail: row.priority + (row.due_date ? ' · ' + row.due_date : '') })),
    ...unpaid.slice(0, 1).map(row => ({ id: row.id, title: row.name, date: row.due_date })),
    ...[...collections.home_care_items.filter(row => row.status !== 'Done').map(row => ({ id: row.id, title: row.title, date: row.due_date })),
      ...collections.inventory_items.filter(row => row.warranty_until >= today && row.warranty_until <= in30ISO)
        .map(row => ({ id: row.id, title: row.name + ' warranty', date: row.warranty_until }))]
      .filter(row => isoDate(row.date)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3)
  ];
  const aliases = { 'Bills & Utilities': 'Utilities', 'Transport & car': 'Transport', 'Family & personal': 'Family & Personal',
    'School & activities': 'School & Kids', 'Groceries & household': 'Groceries', 'Utilities & insurance': 'Utilities' };
  const budgets = collections.household_budgets;
  const categories = new Set(budgets.map(row => row.category));
  const spent = Object.create(null);
  for (const row of tx.filter(row => row.transaction_type === 'Expense')) {
    let category = Object.hasOwn(aliases, row.category) ? aliases[row.category] : row.category;
    if (!categories.has(category)) category = 'Other';
    spent[category] = (spent[category] || 0) + cents(row.amount);
  }
  const order = ['Groceries', 'Utilities', 'Transport', 'School & Kids', 'Home', 'Family & Personal', 'Other'];
  const budget = [...budgets].sort((a, b) => {
    const rank = value => order.includes(value) ? order.indexOf(value) : order.length;
    return rank(a.category) - rank(b.category) || a.category.localeCompare(b.category);
  }).slice(0, 4).map(row => {
    const limit = cents(row.amount), used = spent[row.category] || 0;
    return { category: row.category, percent: limit ? Math.min(100, used / limit * 100) : used > 0 ? 100 : 0,
      label: limit ? Math.min(100, used / limit * 100).toFixed(0) + '%' : used > 0 ? 'Over' : 'Not set' };
  });
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(today + 'T12:00:00Z').getUTCDay()];
  const types = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
  const meals = collections.household_meals.filter(row => row.day_of_week === day)
    .sort((a, b) => types.indexOf(a.meal_type) - types.indexOf(b.meal_type));
  return immutable({ settings, today, openTaskCount: openTasks.length, income, expenses, balance,
    savingsRate: income ? Math.max(0, balance / income * 100) : 0,
    billsDue: sum(unpaid.filter(row => row.due_date?.startsWith(month))), events, reminders, budget, meals });
}

// Two stable observations reduce ordinary multi-request loading races. This is
// not a transactionally consistent database snapshot and must not power reports.
export async function loadDashboard(repository) {
  const read = async () => Object.fromEntries(await Promise.all(dashboardTables.map(async table => [table, await repository.read(table)])));
  let first = await read();
  for (let attempt = 0; attempt < 2; attempt++) {
    const next = await read();
    if (JSON.stringify(first) === JSON.stringify(next)) return next;
    first = next;
  }
  invariant(false, 'CHANGING_SNAPSHOT', 'Household records are changing. Please refresh again.');
}

export function displayDate(value, format) {
  if (!isoDate(value)) return 'No due date';
  const [year, month, day] = value.split('-');
  return format === 'eu' ? `${day}/${month}/${year}` : format === 'us' ? `${month}/${day}/${year}` : value;
}
