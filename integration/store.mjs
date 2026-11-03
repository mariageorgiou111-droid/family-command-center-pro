import { definition, identity, immutable, invariant, requireScope } from './records.mjs';

// Future original-page integration uses one store; this module is not imported
// by index.html or shared.html. It performs no I/O and writes no local keys.
export class HouseholdStore {
  #scope = null;
  #generation = 0;
  #rows = new Map();
  #loads = new Map();

  activate(scope) {
    this.clear();
    this.#scope = immutable(requireScope(scope));
  }

  clear() {
    this.#generation++;
    this.#scope = null;
    this.#rows.clear();
    this.#loads.clear();
  }

  get scope() { return this.#scope; }

  beginLoad(table) {
    definition(table); requireScope(this.#scope);
    // Object identity and a generation reject forged, old, or out-of-order loads.
    const ticket = Object.freeze({ table, generation: this.#generation });
    this.#loads.set(table, ticket);
    return ticket;
  }

  finishLoad(ticket, rows) {
    invariant(this.#scope && ticket?.generation === this.#generation && this.#loads.get(ticket.table) === ticket,
      'STALE_CONTEXT', 'Discarded an outdated household response.');
    invariant(Array.isArray(rows), 'INVALID_ROWS', 'Expected a complete collection.');
    const records = new Map();
    for (const row of rows) {
      const key = identity(ticket.table, row, this.#scope);
      invariant(!records.has(key), 'DUPLICATE_ID', 'Duplicate record identity in response.');
      records.set(key, immutable(row));
    }
    // Validate the entire response before replacing the previous collection.
    this.#rows.set(ticket.table, records);
    this.#loads.delete(ticket.table);
  }

  list(table) {
    definition(table); requireScope(this.#scope);
    return Object.freeze([...(this.#rows.get(table)?.values() || [])]);
  }

  beginEdit(table, recordId) {
    const domain = definition(table);
    const row = this.list(table).find(record => record[domain.key] === recordId);
    invariant(row, 'NOT_FOUND', 'Record no longer exists.');
    invariant(typeof row.updated_at === 'string' && Number.isFinite(Date.parse(row.updated_at)),
      'MISSING_REVISION', 'Server revision timestamp required before editing.');
    return immutable({ table, recordId, generation: this.#generation, base: row });
  }

  prepareUpdate(edit, changes) {
    requireScope(this.#scope);
    invariant(edit?.generation === this.#generation, 'STALE_CONTEXT', 'The account or household has changed.');
    const domain = definition(edit.table);
    invariant(!domain.admin || ['owner', 'admin'].includes(this.#scope.role), 'FORBIDDEN', 'Owner or admin role required.');
    const current = this.list(edit.table).find(row => row[domain.key] === edit.recordId);
    invariant(current, 'NOT_FOUND', 'The record was deleted. Keep the draft and refresh.');
    invariant(JSON.stringify(current) === JSON.stringify(edit.base), 'EDIT_CONFLICT',
      'The record changed while you were editing. Keep the draft and review the latest version.');
    invariant(changes && typeof changes === 'object' && !Array.isArray(changes) && Object.keys(changes).length,
      'INVALID_PATCH', 'At least one changed field is required.');
    for (const key of Object.keys(changes)) {
      invariant(domain.editable.includes(key), 'FORBIDDEN_FIELD', 'Identity, tenant and audit fields cannot be changed.');
      invariant(changes[key] !== undefined, 'INVALID_PATCH', 'Undefined field values cannot be saved.');
    }
    // A reviewable intent, NOT a database command executor. A future executor
    // must re-authorize, validate fields and atomically compare the server revision.
    return immutable({ operation: 'update', table: edit.table, key: edit.recordId,
      userId: this.#scope.userId, householdId: this.#scope.householdId,
      expectedUpdatedAt: current.updated_at, changes, executable: false });
  }
}
