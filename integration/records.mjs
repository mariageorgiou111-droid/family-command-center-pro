import { domains } from '../auth/domains.mjs';

export class FoundationError extends Error {
  constructor(code, message) { super(message); this.name = 'FoundationError'; this.code = code; }
}

export function invariant(condition, code, message) {
  if (!condition) throw new FoundationError(code, message);
}

export function immutable(value) {
  const copy = structuredClone(value);
  const freeze = object => {
    if (object && typeof object === 'object') {
      Object.values(object).forEach(freeze);
      Object.freeze(object);
    }
    return object;
  };
  return freeze(copy);
}

// Reuse the reviewed Phase 2A field allowlist. No SDK, storage or network setup.
const definitions = Object.fromEntries(domains.map(domain => [domain.table, {
  key: domain.key || 'id',
  tenant: 'household_id',
  editable: domain.fields.map(([field]) => field).filter(field => field !== domain.key &&
    !(domain.table === 'home_care_history' && field === 'home_care_item_id'))
}]));
definitions.households = { key: 'id', tenant: 'id', editable: ['name', 'currency', 'date_format'], admin: true };
export const registry = immutable(definitions);

export function definition(table) {
  invariant(Object.hasOwn(registry, table), 'UNKNOWN_TABLE', 'Unrecognized household collection.');
  return registry[table];
}

export function requireScope(scope) {
  invariant(scope && typeof scope.userId === 'string' && scope.userId.length > 0 &&
    typeof scope.householdId === 'string' && scope.householdId.length > 0 &&
    ['owner', 'admin', 'member'].includes(scope.role), 'NO_MEMBERSHIP', 'Verified household context required.');
  return scope;
}

export function identity(table, row, scope) {
  const domain = definition(table);
  requireScope(scope);
  invariant(row && row[domain.tenant] === scope.householdId, 'WRONG_HOUSEHOLD', 'Record belongs to another household.');
  const id = row[domain.key];
  invariant(typeof id === 'string' && id.trim().length > 0, 'MISSING_ID', 'A stable record ID is required.');
  // Composite encoding prevents collisions between households, tables and IDs.
  return JSON.stringify([scope.householdId, table, id]);
}

export function createDraft(values, idFactory = () => crypto.randomUUID()) {
  invariant(values && typeof values === 'object' && !Array.isArray(values), 'INVALID_DRAFT', 'Record values required.');
  const id = values.id ?? idFactory();
  invariant(typeof id === 'string' && id.trim().length > 0, 'MISSING_ID', 'A stable record ID is required.');
  // This is an in-memory draft only. Never normalize or persist an old dataset.
  return immutable({ ...values, id });
}
