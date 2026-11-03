import { ReadOnlyHouseholdRepository } from './repository.mjs';
import { HouseholdStore } from './store.mjs';
import { dashboardModel, loadDashboard, displayDate, automaticTheme } from './dashboard.mjs';

const $ = id => document.getElementById(id);
const store = new HouseholdStore();
let epoch = 0, repository, client, busy = false, timer, stopped = false, queued = false;
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
function clearPrivate() {
  epoch++; repository?.clear(); store.clear(); clearTimeout(timer);
  document.body.classList.add('shared-loading');
  for (const id of ['week', 'reminders', 'budget', 'mealPreview']) $(id)?.replaceChildren();
  for (const id of ['taskCount', 'billTotal', 'balance', 'savingRate', 'homeName', 'dashboardCurrency', 'dashboardDate']) if ($(id)) $(id).textContent = '';
  document.querySelector('.brand')?.replaceChildren();
}
function fail(message) {
  clearPrivate();
  const section = node('section', undefined, 'shared-error');
  section.append(node('h1', 'Shared Dashboard unavailable'), node('p', message));
  const login = node('a', 'Account / sign in'); login.href = 'shared.html'; section.append(login);
  const retry = node('button', 'Retry'); retry.type = 'button'; retry.addEventListener('click', () => location.reload()); section.append(retry);
  document.querySelector('.shared-error')?.remove(); document.body.append(section);
}
function row(title, detail) {
  const element = node('div', undefined, 'row'); element.append(node('span', title), node('span', detail, 'pill')); return element;
}
function render(model) {
  const format = model.settings.date_format;
  const money = value => {
    const symbols = { EUR: '€', USD: '$', GBP: '£', CAD: 'C$', AUD: 'A$', CHF: 'CHF ', JPY: '¥', INR: '₹', NZD: 'NZ$', SGD: 'S$' };
    return (symbols[model.settings.currency] || model.settings.currency + ' ') + Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  $('homeName').textContent = model.settings.name;
  const brand = document.querySelector('.brand'); brand.replaceChildren(node('span', model.settings.name + ' ♥'), node('small', 'FAMILY COMMAND CENTER PRO'));
  $('taskCount').textContent = model.openTaskCount;
  $('billTotal').textContent = money(model.billsDue);
  $('balance').textContent = money(model.balance);
  $('savingRate').textContent = model.savingsRate.toFixed(1) + '%';
  $('dashboardCurrency').textContent = model.settings.currency;
  $('dashboardDate').textContent = displayDate(model.today, format);
  const fill = (id, elements, empty) => $(id).replaceChildren(...(elements.length ? elements : [node('div', empty, 'empty')]));
  fill('week', model.events.map(event => row(event.title, displayDate(event.event_date, format) + ' ' + (event.event_time || '').slice(0, 5))), 'No events in the next 7 days');
  fill('reminders', model.reminders.map(item => row(item.title, item.detail || displayDate(item.date, format))), 'Nothing to remember');
  fill('mealPreview', model.meals.map(meal => row(meal.meal_type, meal.meal_name)), 'No meals planned for today');
  const budgetRows = [];
  for (const item of model.budget) {
    const bar = node('div', undefined, 'bar'), progress = node('i'); progress.style.width = item.percent + '%'; bar.append(progress);
    budgetRows.push(row(item.category, item.label), bar);
  }
  fill('budget', budgetRows, 'No shared budgets set');
  $('sharedStatus').textContent = `Shared Dashboard · read-only integration phase. Last checked ${new Date().toLocaleTimeString()}. Changes are checked automatically every 30 seconds while this page is visible. Editing and other modules are not connected yet.`;
  document.querySelector('.shared-error')?.remove();
  const now = new Date(), theme = automaticTheme(now);
  $('timeGreeting').textContent = now.getHours() < 5 || now.getHours() >= 18 ? 'Good evening ♥' : now.getHours() < 12 ? 'Good morning ♥' : 'Good afternoon ♥';
  const special = ['valentine', 'easter', 'halloween', 'christmas'].includes(theme);
  document.body.className = 'shared-dashboard ' + (special ? 'special-' : 'season-') + theme;
}
async function refresh() {
  if (stopped || document.hidden) return;
  if (busy) { queued = true; return; }
  busy = true; const version = epoch;
  try {
    const scope = await repository.connect();
    if (version !== epoch || stopped) return;
    const data = await loadDashboard(repository);
    if (version !== epoch || stopped) return;
    store.activate(scope);
    for (const [table, rows] of Object.entries(data)) store.finishLoad(store.beginLoad(table), rows);
    const snapshot = Object.fromEntries(Object.keys(data).map(table => [table, store.list(table)]));
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    render(dashboardModel(snapshot, today));
  } catch (error) {
    if (version === epoch && !stopped) {
      if (error.code === 'UNAUTHENTICATED') { clearPrivate(); location.replace('shared.html#login'); }
      else if (error.code === 'NO_MEMBERSHIP') { clearPrivate(); location.replace('shared.html#onboarding'); }
      else fail(error.message || 'Unable to verify household access.');
    }
  } finally {
    busy = false;
    if (!stopped) { clearTimeout(timer); timer = setTimeout(refresh, queued ? 0 : 30000); queued = false; }
  }
}

// Disable the original mutation controls; legacy scripts are absent from this
// generated page. No original input or button can execute local/shared writes.
document.querySelectorAll('button,input,select,textarea').forEach(element => { element.disabled = true; });
const nav = $('nav');
for (const label of ['Dashboard', 'Calendar', 'Tasks', 'Home Care', 'Finance', 'Meals', 'Settings']) {
  const button = node('button', label); button.type = 'button'; button.disabled = label !== 'Dashboard';
  if (label === 'Dashboard') { button.className = 'active'; button.addEventListener('click', () => refresh()); }
  else button.title = 'Shared module integration is pending';
  nav.append(button);
}
const accounts = node('div', undefined, 'shared-account');
const account = node('a', 'Shared Household / account'); account.href = 'shared.html#account';
const refreshButton = node('button', 'Refresh Dashboard'); refreshButton.type = 'button'; refreshButton.addEventListener('click', refresh);
const logout = node('button', 'Sign out'); logout.type = 'button'; logout.addEventListener('click', async () => {
  stopped = true; clearPrivate();
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) fail('Sign out failed. Open account management and retry.');
  else location.replace('shared.html#login');
});
accounts.append(account, refreshButton, logout); $('sharedStatus').after(accounts);
const config = window.FCC_AUTH_CONFIG;
if (!config || !window.supabase) fail('Shared authentication is not configured or its library failed to load. Existing local data is unchanged.');
else {
  client = window.supabase.createClient(config.url, config.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'fcc-supabase-auth-v1' } });
  repository = new ReadOnlyHouseholdRepository(client);
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) { stopped = true; clearPrivate(); location.replace('shared.html#login'); }
    else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') { clearPrivate(); setTimeout(refresh, 0); }
  });
  refresh();
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('pagehide', () => { stopped = true; clearPrivate(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { stopped = false; refresh(); } });
}
