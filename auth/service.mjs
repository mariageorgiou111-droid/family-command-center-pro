// All authorization is enforced by Supabase RPCs, grants and RLS. UI guards
// prevent accidental requests; they never replace the database boundary.
export class HouseholdService {
  constructor(client) { this.client = client; this.membership = null; this.version = 0; }
  clear() { this.membership = null; this.version++; }
  async loadMembership(userId) {
    this.clear();
    const version = this.version;
    const { data: verified, error: authError } = await this.client.auth.getUser();
    if (authError || verified?.user?.id !== userId) throw new Error('Please sign in again.');
    const { data, error } = await this.client.from('household_memberships')
      .select('household_id,user_id,role').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    if (version !== this.version) return null;
    this.membership = data;
    return data;
  }
  requireMember(admin = false) {
    const member = this.membership;
    if (!member) throw new Error('Household membership required.');
    if (admin && !['owner', 'admin'].includes(member.role)) throw new Error('Owner or admin role required.');
    return member;
  }
  async rpc(name, args) {
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw error;
    return data;
  }
  create(name, currency, dateFormat) {
    if (!name.trim() || name.trim().length > 80) throw new Error('Enter a household name of 1–80 characters.');
    return this.rpc('create_household', { p_name: name.trim(), p_currency: currency, p_date_format: dateFormat });
  }
  accept(token) {
    if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('Enter the complete invitation token.');
    return this.rpc('accept_household_invitation', { p_invitation_token: token });
  }
  invite(email, role = 'member') {
    const member = this.requireMember(true);
    if (!['member', 'admin'].includes(role)) throw new Error('Invalid invitation role.');
    return this.rpc('create_household_invitation', {
      p_household_id: member.household_id, p_invited_email: email.trim(), p_role: role,
      p_expires_in: '7 days'
    });
  }
  invitations() { return this.rpc('list_household_invitations', { p_household_id: this.requireMember(true).household_id }); }
  revoke(id) { this.requireMember(true); return this.rpc('revoke_household_invitation', { p_invitation_id: id }); }
  async household() {
    const member = this.requireMember();
    const { data, error } = await this.client.from('households').select('id,name,currency,date_format')
      .eq('id', member.household_id).single();
    if (error) throw error;
    return data;
  }
  async read(domain) {
    const member = this.requireMember();
    const { data, error } = await this.client.from(domain.table).select('*')
      .eq('household_id', member.household_id).limit(500);
    if (error) throw error;
    return data;
  }
  async write(domain, values, original = null) {
    const member = this.requireMember();
    // Allowlist editable columns: never update household_id, id or audit fields.
    const payload = Object.fromEntries(domain.fields.map(([key]) => [key, values[key]]));
    if (original && domain.key) delete payload[domain.key];
    if (original && domain.table === 'home_care_history') delete payload.home_care_item_id;
    let request;
    if (original) {
      request = this.client.from(domain.table).update(payload)
        .eq('household_id', member.household_id).eq(domain.key || 'id', original[domain.key || 'id']);
    } else {
      request = this.client.from(domain.table).insert({ ...payload,
        ...(domain.key ? {} : { id: crypto.randomUUID() }), household_id: member.household_id });
    }
    const { data, error } = await request.select();
    if (error) throw error;
    if (!data?.length) throw new Error('No record saved. Refresh membership and try again.');
    return data;
  }
  async remove(domain, original) {
    const member = this.requireMember();
    const { data, error } = await this.client.from(domain.table).delete()
      .eq('household_id', member.household_id)
      .eq(domain.key || 'id', original[domain.key || 'id']).select();
    if (error) throw error;
    if (!data?.length) throw new Error('No record removed. Refresh and try again.');
  }
}

export function takeInvitation(location, history) {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const token = fragment.get('invite');
  if (token === null) return '';
  // Keep the bearer token only in this page's memory, never persistent storage.
  history.replaceState(null, '', location.pathname + location.search + '#onboarding');
  return /^[0-9a-f]{64}$/.test(token) ? token : '';
}

export function routeFor(requested, session, member) {
  const publicRoutes = ['login', 'signup', 'forgot'];
  if (!session) return publicRoutes.includes(requested) ? requested : 'login';
  if (requested === 'reset') return 'reset';
  return member ? 'household' : 'onboarding';
}
