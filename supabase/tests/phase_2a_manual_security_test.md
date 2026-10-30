# Phase 2A household isolation test

Run this test after applying the migration and after Phase 2B connects the browser
client. Use three separate browser profiles so Supabase sessions do not overlap.

## Accounts

1. **Maria** creates an account and confirms her email.
2. **Christos** creates a different account and confirms his email.
3. **Outsider** creates a third account and confirms their email.

Use disposable test addresses. Never place passwords or access tokens in this
repository, SQL history, screenshots, or bug reports.

## Household and invitation

1. Maria calls `create_household` through the application and becomes `owner`.
2. Maria creates an invitation for Christos with the `member` role.
3. Verify the returned raw token appears only in the copied link.
4. In SQL Editor, verify `fcc_private.household_invitations.token_hash` is populated
   and the raw token is not stored.
5. Christos opens the link while authenticated with the invited, confirmed email.
6. Christos accepts once and sees Maria's household.
7. A second acceptance attempt must fail.

## Shared-data behavior

For Calendar, Tasks, Cleaning, Home Care, Inventory, Finance, Savings, Meals, and
Groceries:

1. Maria creates one record.
2. Christos can read and update it.
3. Christos creates one record.
4. Maria can read and update it.
5. Both sessions show the same household dashboard totals after refresh/realtime
   synchronization is implemented.
6. Christos cannot change any record's `household_id`, `id`, `created_by`, or
   `created_at`; those tenant and audit columns are not update-granted.

## Role separation

1. Maria, as owner, can update household name/currency/date format and create,
   list, or revoke invitations.
2. Christos, as member, can edit ordinary shared records but cannot update the
   household row or create, list, or revoke invitations.
3. Neither Maria nor Christos can insert, update, or delete membership rows
   directly through the Data API.
4. An admin invitation may grant `admin`; no invitation may grant `owner`.

## Unrelated-account denial

With only Outsider's authenticated browser session and the public project URL/key:

1. Selecting Maria's household ID returns zero rows.
2. Selecting every shared table with Maria's `household_id` returns zero rows.
3. Inserting a task with Maria's `household_id` is rejected by RLS.
4. Updating or deleting a known Maria/Christos record affects zero rows or is
   rejected by RLS.
5. Selecting Maria's membership rows returns zero rows.
6. Calling invitation-list/revoke RPCs for Maria's household is rejected.
7. A Realtime subscription receives no Maria/Christos household rows.
8. A valid token issued to Christos is rejected for Outsider because the confirmed
   account email does not match.

## Invitation lifecycle denial

Confirm that each of the following fails without creating a membership:

- malformed token;
- expired token;
- revoked token;
- already accepted token;
- token presented by an account with a different confirmed email;
- invitation attempting to grant `owner`;
- invitation created by a regular `member`.

## Expected membership result

At completion there must be exactly two rows for Maria's household:

| User | Role |
|---|---|
| Maria | owner |
| Christos | member (or admin only after an explicit role change in a later phase) |

Outsider must have no membership and no access to the household's rows.
