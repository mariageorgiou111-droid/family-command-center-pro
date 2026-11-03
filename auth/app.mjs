import { HouseholdService, takeInvitation, routeFor } from './service.mjs';
import { currencies, dateFormats } from './options.mjs';

const root = document.querySelector('#app');
const status = document.querySelector('#status');
const config = window.FCC_AUTH_CONFIG;
let session = null, service, client, epoch = 0, pendingToken = takeInvitation(location, history);
let recovery = new URLSearchParams(location.search).get('flow') === 'recovery';
let ready = false, busy = false;

function node(tag, text, attrs = {}) {
  const el = document.createElement(tag);
  if (text !== null) el.textContent = text;
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}
function message(text = '', error = false) {
  status.textContent = text;
  status.className = error ? 'error' : '';
}
function button(label, action, kind = '') {
  const el = node('button', label, { type: 'button', class: kind });
  el.addEventListener('click', action);
  return el;
}
function link(label, route) { return node('a', label, { href: `#${route}` }); }
function field(form, name, label, type = 'text', required = true, value = '') {
  const wrapper = node('label', label);
  let input;
  if (Array.isArray(type)) {
    input = node('select', null, { name });
    type.forEach(item => input.append(node('option', item, { value: item })));
  } else {
    input = node('input', null, { name, type });
    if (type === 'email') input.autocomplete = 'email';
    if (type === 'password') { input.minLength = 12; input.autocomplete = 'new-password'; }
    if (type === 'number') { input.min = '0'; input.step = '0.01'; }
  }
  input.required = required;
  if (type === 'checkbox') input.checked = Boolean(value);
  else if (value !== null && value !== undefined && value !== '') input.value = value;
  wrapper.append(input); form.append(wrapper);
  return input;
}
function formAction(form, label, action) {
  form.append(node('button', label, { type: 'submit' }));
  form.addEventListener('submit', event => { event.preventDefault(); run(action); });
}
async function run(action) {
  if (busy) return;
  const version = epoch;
  busy = true; message();
  root.querySelectorAll('button').forEach(el => { el.disabled = true; });
  try { await action(); }
  catch (error) {
    // Never log errors/requests: invitations and auth credentials can be sensitive.
    if (version === epoch) message(error?.message || 'Request failed. Please try again.', true);
  } finally {
    busy = false;
    root.querySelectorAll('button').forEach(el => { el.disabled = false; });
  }
}
function go(route) {
  history.replaceState(null, '', location.pathname + location.search + `#${route}`);
  render();
}
function panel(title) {
  const section = node('section'); section.append(node('h1', title)); root.append(section);
  return section;
}
function removePrivateViews() {
  document.querySelectorAll('dialog').forEach(el => el.remove());
  root.replaceChildren();
}
async function refreshSession(next) {
  const version = ++epoch;
  session = next; ready = false; service.clear(); removePrivateViews();
  root.setAttribute('aria-busy', 'true');
  if (!next) {
    ready = true; root.setAttribute('aria-busy', 'false'); message(); render(); return;
  }
  message('Checking household access…');
  try {
    await service.loadMembership(next.user.id);
    if (version !== epoch) return;
    ready = true; root.setAttribute('aria-busy', 'false'); message(); render();
  } catch (error) {
    if (version !== epoch) return;
    message('Unable to verify access. Check your connection and sign in again.', true);
    root.append(button('Retry', () => refreshSession(session)), button('Sign out', logout));
  }
}
async function logout() {
  // Remove data before waiting for the network; never clear application storage.
  const wasSession = session;
  await refreshSession(null);
  pendingToken = ''; recovery = false;
  history.replaceState(null, '', location.pathname + '#login');
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) {
    // Keep the UI locked if SDK logout fails. Do not claim the session was removed.
    session = wasSession; ready = false; removePrivateViews();
    message('Sign out failed. Retry to remove this browser’s session.', true);
    root.append(button('Retry sign out', logout));
  } else render();
}
function render() {
  if (!ready) return;
  removePrivateViews();
  const requested = recovery ? 'reset' : location.hash.slice(1);
  const route = routeFor(requested, session, service.membership);
  if (session) {
    const bar = node('div', null, { class: 'toolbar' });
    bar.append(node('p', `Signed in as ${session.user.email}`), button('Sign out', () => run(logout), 'secondary'));
    root.append(bar);
  }
  if (['login','signup','forgot','reset'].includes(route)) renderAuth(route);
  else if (route === 'onboarding') renderOnboarding();
  else if (location.hash === '#account') renderAccount();
  else location.replace('app.html');
}
function renderAuth(route) {
  const titles = { login:'Sign in', signup:'Create your account', forgot:'Reset your password', reset:'Choose a new password' };
  const section = panel(titles[route]);
  section.append(node('p', 'Each household member needs their own account. Use the email address your invitation was sent to.'));
  const form = node('form'); section.append(form);
  const email = route !== 'reset' ? field(form,'email','Email','email') : null;
  const password = ['login','signup','reset'].includes(route) ? field(form,'password',route === 'login' ? 'Password' : 'Password (at least 12 characters)','password') : null;
  if (route === 'login') { password.autocomplete = 'current-password'; password.minLength = 1; }
  const confirmation = route === 'reset' ? field(form,'confirm','Confirm password','password') : null;
  formAction(form,titles[route], async () => {
    if (confirmation && confirmation.value !== password.value) throw new Error('Passwords do not match.');
    const redirect = new URL(location.pathname, location.origin).href;
    let result;
    if (route === 'login') result = await client.auth.signInWithPassword({ email:email.value.trim(), password:password.value });
    if (route === 'signup') result = await client.auth.signUp({ email:email.value.trim(), password:password.value,
      options:{ emailRedirectTo:redirect } });
    if (route === 'forgot') result = await client.auth.resetPasswordForEmail(email.value.trim(), { redirectTo:`${redirect}?flow=recovery` });
    if (route === 'reset') result = await client.auth.updateUser({ password:password.value });
    if (result.error) throw result.error;
    form.reset();
    if (route === 'forgot') message('If this email can receive a reset link, an email will arrive shortly.');
    else if (route === 'signup' && !result.data.session) message('Check your email to confirm your account, then sign in. Keep your invitation link to open again after confirmation.');
    else if (route === 'reset') {
      recovery = false;
      history.replaceState(null, '', location.pathname + '#household');
      await refreshSession(session);
      message('Password updated.');
    }
  });
  if (route !== 'reset') {
    const nav = node('nav');
    if (route !== 'login') nav.append(link('Sign in','login'));
    if (route !== 'signup') nav.append(link('Create account','signup'));
    if (route !== 'forgot') nav.append(link('Forgot password?','forgot'));
    section.append(nav);
  }
}
function renderOnboarding() {
  const section = panel('Set up your shared household');
  section.append(node('p','Create a new, empty household or accept an invitation. Existing local data stays in the local workspace and is never uploaded automatically.'));
  const create = node('form'); create.append(node('h2','Create a household'));
  const name = field(create,'household','Household name'); name.maxLength = 80;
  const currency = field(create,'currency','Household currency',Object.keys(currencies),true,'EUR');
  for (const option of currency.options) option.textContent = currencies[option.value];
  const date = field(create,'date','Date format',Object.keys(dateFormats));
  for (const option of date.options) option.textContent = dateFormats[option.value];
  formAction(create,'Create empty household', async () => {
    await service.create(name.value,currency.value.toUpperCase(),date.value);
    pendingToken = ''; await refreshSession(session);
  });
  const join = node('form'); join.append(node('h2','Join with an invitation'));
  const token = field(join,'invitation','Invitation token','text',true,pendingToken);
  token.autocomplete = 'off'; token.spellcheck = false;
  join.append(node('small','Confirm your email first. Only the invited email can accept; expired, revoked or used tokens are rejected.'));
  formAction(join,'Accept invitation',async () => {
    await service.accept(token.value.trim()); pendingToken = ''; token.value = '';
    await refreshSession(session);
  });
  if (pendingToken) {
    section.append(node('p','You have an invitation. Join the existing household; its name, currency and date format are already set.'),join);
  } else section.append(create,join);
}
async function renderAccount() {
  const version = epoch;
  const section = panel('Household and account');
  const dashboard = node('a','Open Dashboard',{href:'app.html'}); section.append(dashboard);
  try {
    const household = await service.household();
    if (version !== epoch || !section.isConnected) return;
    section.append(node('p',`${household.name} · ${service.membership.role}`),
      node('p',`${currencies[household.currency] || household.currency} · ${dateFormats[household.date_format] || household.date_format}`),
      node('p','Use the normal application pages for household records. This page manages your account and invitations only.'));
    if (['owner','admin'].includes(service.membership.role)) renderInvitations(section);
    else section.append(node('p','Ask your household owner or admin to manage invitations.'));
  } catch (error) { if (version === epoch) message(error.message,true); }
}
function renderInvitations(parent) {
  const section = node('section'); section.append(node('h2','Invite a household member'));
  const form = node('form'), output = node('output'); output.hidden = true;
  const email = field(form,'invite-email','Their email','email');
  const role = field(form,'role','Role',['member','admin']);
  formAction(form,'Create invitation',async()=>{
    const version = epoch;
    const data = await service.invite(email.value,role.value);
    if (version !== epoch || !output.isConnected) return;
    const invitation = data[0];
    const url = new URL(location.pathname,location.origin); url.hash = `invite=${invitation.invitation_token}`;
    output.hidden = false;
    output.replaceChildren(node('p','Copy this link and send it privately to the invited person. No email is sent automatically. The token is only displayed now.'),node('p',url.href),node('small',`Expires: ${new Date(invitation.expires_at).toLocaleString()}`),button('Hide invitation link',()=>{output.replaceChildren();output.hidden=true;},'secondary'));
    message('Invitation created.');
  });
  const list = node('div');
  section.append(form,output,button('List invitations',()=>run(async()=>{
    const version = epoch; const invitations = await service.invitations();
    if (version !== epoch || !list.isConnected) return;
    list.replaceChildren();
    invitations.forEach(invite=>{
      const row = node('p',`${invite.invited_email} · ${invite.role} · ${invite.status} · expires ${new Date(invite.expires_at).toLocaleString()}`);
      if (invite.status === 'pending') row.append(button('Revoke',()=>run(async()=>{
        const version = epoch; await service.revoke(invite.invitation_id);
        if (version !== epoch) return;
        output.replaceChildren(); output.hidden = true; list.replaceChildren(); message('Invitation revoked.');
      }),'secondary'));
      list.append(row);
    });
    if (!invitations.length) list.append(node('p','No invitations.'));
  }),'secondary'),list); parent.append(section);
}

if (!config?.url || !config?.key || !window.supabase?.createClient) {
  root.setAttribute('aria-busy','false');
  message('Shared household sign-in is not configured or the authentication library could not load. Build with the public Supabase environment variables and check your connection. Your local workspace is still available.',true);
} else {
  client = window.supabase.createClient(config.url,config.key,{
    auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, storageKey:'fcc-supabase-auth-v1' }
  });
  service = new HouseholdService(client);
  // Do not call asynchronous Supabase APIs while its auth callback holds a lock.
  client.auth.onAuthStateChange((event,next)=>{
    if (event === 'PASSWORD_RECOVERY') recovery = true;
    // Clear protected views synchronously, including on another tab's sign-out.
    ++epoch; service.clear(); ready = false; removePrivateViews();
    setTimeout(()=>refreshSession(next),0);
  });
  const initialEpoch = epoch;
  client.auth.getSession().then(({data,error})=>{
    if (initialEpoch !== epoch) return;
    if (error) { message('Unable to restore session. Reload to retry.',true); return; }
    refreshSession(data.session);
  });
  window.addEventListener('hashchange',()=>{
    if (new URLSearchParams(location.hash.slice(1)).has('invite')) pendingToken = takeInvitation(location,history);
    render();
  });
  window.addEventListener('pagehide',()=>{service.clear();removePrivateViews();});
  window.addEventListener('pageshow',event=>{if(event.persisted) refreshSession(session);});
}
