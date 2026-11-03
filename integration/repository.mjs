import { definition, identity, immutable, invariant } from './records.mjs';

// Explicitly invoked, read-only SDK adapter. No client creation, subscriptions,
// import, auto-connect, INSERT/UPDATE/DELETE or RPC execution is implemented.
export class ReadOnlyHouseholdRepository {
  #client;
  #generation = 0;
  #scope = null;

  constructor(client) { this.#client = client; }
  get scope() { return this.#scope; }
  clear() { this.#generation++; this.#scope = null; }

  #current(generation) {
    invariant(generation === this.#generation, 'STALE_CONTEXT', 'Account context changed during a request.');
  }

  async connect() {
    this.clear();
    const generation = this.#generation;
    const { data: auth, error: authError } = await this.#client.auth.getUser();
    this.#current(generation);
    invariant(!authError && auth?.user?.id, 'UNAUTHENTICATED', 'Sign in before loading a household.');
    const { data: membership, error } = await this.#client.from('household_memberships')
      .select('household_id,user_id,role').eq('user_id', auth.user.id).maybeSingle();
    this.#current(generation);
    if (error) throw error;
    invariant(membership?.user_id === auth.user.id && typeof membership.household_id === 'string' &&
      membership.household_id.length > 0 && ['owner', 'admin', 'member'].includes(membership.role),
    'NO_MEMBERSHIP', 'An authorized household membership is required.');
    this.#scope = immutable({ userId: auth.user.id, householdId: membership.household_id, role: membership.role });
    return this.#scope;
  }

  async read(table, { pageSize = 200, maxPages = 1000 } = {}) {
    const domain = definition(table);
    invariant(this.#scope, 'NO_MEMBERSHIP', 'Connect a verified account before loading records.');
    invariant(Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 1000 &&
      Number.isInteger(maxPages) && maxPages > 0, 'INVALID_PAGE', 'Invalid pagination limits.');
    const generation = this.#generation;
    const scope = this.#scope;
    const rows = [], seen = new Set();
    for (let page = 0; page < maxPages; page++) {
      const { data, error } = await this.#client.from(table).select('*')
        .eq(domain.tenant, scope.householdId).order(domain.key)
        .range(page * pageSize, (page + 1) * pageSize - 1);
      this.#current(generation);
      if (error) throw error;
      invariant(Array.isArray(data), 'INVALID_ROWS', 'Expected authorized record rows.');
      for (const row of data) {
        const key = identity(table, row, scope);
        // Concurrent pagination changes require a retry, never a silent partial total.
        invariant(!seen.has(key), 'UNSTABLE_PAGE', 'Records changed during pagination. Reload the collection.');
        seen.add(key); rows.push(row);
      }
      if (data.length < pageSize) return immutable(rows);
    }
    invariant(false, 'INCOMPLETE_READ', 'Pagination safety limit reached; no partial result was returned.');
  }
}
