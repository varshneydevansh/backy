# Operator session site grants

Operator policies are additive records in `settings.auth.userSiteGrants`. Each
record contains `userId`, `scope`, `updatedAt`, and `updatedById`. They do not change
user roles, team memberships, service-key grants or the content model. The field
is managed: ordinary `settings.auth` saves reject it and preserve existing records.

Missing policy means historical workspace access through existing role/permission
and team rules. This is a compatibility choice, not evidence that historical
operators were site-isolated. Owners retain workspace authority regardless of a
stored operator policy. The management API refuses to assign a restriction to an
owner. Converting a missing policy to an explicit workspace record requires owner
confirmation; no destructive migration is performed.

An owner reads or updates `/api/admin/users/:userId/site-grants`. GET returns the
scope, revision and status (`legacy-workspace`, `workspace`, `selected-sites`,
`revoked`, `expired`, `invalid` or `owner-workspace`). PATCH requires an active owner
session, `expectedRevision`, the next scope revision, and `confirmWorkspace:true`
for workspace access. API keys and ordinary admins cannot manage policies.

Example PATCH to replace revision zero (a previously unassigned policy):

```json
{
  "expectedRevision": 0,
  "scope": {
    "version": 1,
    "revision": 1,
    "mode": "selected-sites",
    "grants": [
      {"siteId": "site-example", "permissions": ["sites.view", "pages.view", "pages.edit"]}
    ],
    "expiresAt": null
  }
}
```

Site IDs must exist and be canonical IDs; slugs are accepted for ordinary request
routing but cannot be stored as grant identities. Each site has its own known
non-owner site module permission list, shared with the service-key permission
catalog. There are at most 50 sites per policy. Optional expiry must be in the
future when saved. Empty selected-site grants, or grants with no permissions,
explicitly revoke site access while leaving account/login state intact.

Selected policies restrict existing role/ordinary overrides AND existing team
membership. They do not elevate a viewer or add a person to a site's owning team.
An owner must separately adjust the role/team if access needs expanding. Scoped
operators cannot use workspace/global, unclassified module or permissionless
content paths. Their own permission metadata GET remains available to bootstrap
the admin UI. `/api/admin/sites` returns only granted `sites.view` IDs that also
pass team ownership checks, with honest authorized totals. Selected IDs are loaded
directly, so a site beyond the repository's first page remains discoverable.
Owner/workspace inventories traverse repository pages (bounded at 5000); oversized
or nonadvancing inventories fail instead of falsely reporting a complete list.

Shared authorization reads the current policy on every request, including through
the enforced deployment proxy. Changing, narrowing, revoking, expiring or corrupting
a policy affects existing sessions without relogin. Invalid declared policies fail
closed. Owners can repair an invalid user record from revision zero; the handler
never silently repairs an invalid entire policy inventory. UI permission metadata carries the additive policy and disables capabilities that
no granted site supports. UI caches are advisory; backend checks remain fresh. A
workspace API key is a separate credential with workspace authority: do not share
one with restricted operators or embed one in their browser build. Supplying such
a credential deliberately authenticates the key rather than imposing the session's
operator policy. Successful changes emit
`user.site_grants.update` audit events with before/after status, revision and site
IDs. The new user-detail "Operator site access" controls show saved status, site
search, per-site modules, expiry, deliberate workspace confirmation and immediate
revocation.

`expectedRevision` is checked against the request's per-user policy snapshot and
committed with an atomic compare-and-swap of those exact per-user records. The
PostgreSQL settings repository locks `platform_settings` inside a transaction,
compares the current records, and merges the replacement into current auth. Two
owners saving the same revision yield one commit and one 409 conflict. Different
users' updates preserve each other. Invalid/duplicate user records can be repaired
only if their exact snapshot still matches.

Generic settings writers use the same settings row lock and preserve the current
`userSiteGrants` field, so a stale full auth snapshot or unrelated storage edit
cannot roll back a grant commit. The dedicated writer preserves all unrelated
current credentials, sessions, auth policy, integrations and storage. Existing
semantics for updates to other managed auth fields remain unchanged; this does not
claim complete concurrency protection for every credential writer.

The demo writer compares and mutates synchronously, then persists via an atomic
file rename and restores memory on a persistence failure. Its atomic guarantee is
within one process, not across independent demo processes sharing a file. No
schema or destructive data migration is required. Persisted atomic proof targets
PostgreSQL row locks; unsupported transaction/lock adapters do not receive a
non-atomic fallback. Audit recording follows the commit through the existing audit
repository; the grant CAS does not claim a combined atomic audit transaction.

Verification: `npm run test:admin-operator-site-scope` executes actual management,
permission metadata, sites and page-write handlers plus shared authorization in
both storage branches. It also uses the actual session persistence helper to prove
same-token policy narrowing and inactive/revoked session denial. Repository/provider
boundaries remain fixtures. `npm run test:operator-site-grants:postgres` in the DB
workspace separately proves row-lock interleavings using an owned socket-only
PostgreSQL cluster and the actual platform-settings schema declaration; it accepts
no configured database target. The operator command also executes the actual demo
store in an owned scratch directory. These do not certify a production database
or served operator UI behavior. Re-run owner, scoped-key, proxy, site-scope and RBAC regression
commands before a served scratch test. Production verification remains separate.

Standard site OpenAPI advertises the global owner-only user site-grants GET/PATCH
operations and their revision-aware request/response DTOs. The SDK exposes
`adminUserSiteGrants` and `updateAdminUserSiteGrants`; pass an owner session using
`adminSession` or authenticated cookie credentials. A 409 is a reload-and-review
conflict, never an automatic overwrite/retry. Generated DTOs preserve the finite
non-owner site permission catalog. They do not prove access to any site.
