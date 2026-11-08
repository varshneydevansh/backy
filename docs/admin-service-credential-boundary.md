# Admin credential and deployment proxy boundary

New service keys require an explicit owner-issued scope. `selected-sites` records
use canonical site IDs and the known non-owner site permission allowlist;
`workspace` records require deliberate confirmation. Existing records without a
scope retain explicit legacy workspace behavior. Malformed declared policies do
not become workspace grants. Expiry, revocation and current scope are read on
every request. Listings never expose stored credential hashes or raw issued keys.

`BACKY_REQUIRE_ADMIN_API_KEY=true` retains its deployment configuration gate:
configure a server-only `BACKY_ADMIN_API_KEY` or `BACKY_ADMIN_SECRET_KEY`. Without
either environment primary, protected admin requests return 503 even when a
persisted service credential or session exists. Login/recovery/auth lifecycle
routes and CORS preflight remain available. Do not expose the environment primary
or service credentials in public/custom-frontend browser configuration.

With valid required configuration, the proxy authenticates the same credentials
as the handlers: environment/configured workspace keys, active service keys with
valid unexpired policies, or active persisted admin sessions. The flag's historical
name does not require a workspace key on session-authenticated browser requests.
Authentication grants no route permission: each handler freshly resolves its
credential, checks role/permission and site/team scope, and still requires an owner
session for owner-only actions. The proxy forwards no authorization bypass marker.
A selected-site key can pass authentication and still receive 403 from a workspace,
unknown-module, cross-site or insufficient-capability operation. Usage timestamps
are updated only after the handler's authorization succeeds.

Focused verification:

- `npm run test:admin-owner-boundary` (public workspace): actual owner boundaries.
- `npm run test:admin-service-key-scope`: actual issue/list/content/access handlers.
- `npm run test:admin-proxy-auth`: actual async proxy, shared auth, session store,
  session cookie and issue/list/settings handlers in both repository modes,
  including missing configuration, revocation between proxy and handler, expiry,
  malformed scope, inactive/revoked sessions and primary/legacy compatibility.
- `npm run test:admin-proxy-cache`: private cache headers retained across admin
  preview/download/settings/auth requests; public and hosted policies preserved.

These tests replace repositories and provider boundaries with isolated fixtures.
They do not certify a production deployment, real database persistence, or a
served Next runtime. Served verification must use an isolated scratch store and
synthetic credentials, then prove owner issuance, allowed selected-site access,
cross-site/permission denial and immediate revocation with this flag enabled.

## Compiled selected-site agent acceptance

Start the owned local fixture with `npm run fixture:external-agent --workspace
@backy-cms/admin`. It requires a completed public Webpack build, builds a copied
admin source tree and starts the compiled backend in disposable storage. The
fixture signs in a synthetic Owner and uses the actual Settings operation to
issue a two-minute `selected-sites` key with `sites.view` and `forms.view`.
The printed control-file path contains private credentials; do not paste its
contents into logs or a frontend environment.

Immediately run `npm run test:external-agent-http --workspace @backy-cms/admin --
<control-file> <private-proof-file>`. The checker uses the key alone, with no
session cookie. It exercises authorized Forms/list/history reads, foreign-site
refusal, denied edit/manage/restore/global operations and natural expiry. Every
denial compares all disposable persisted files byte for byte. Authorized reads
may update the key's canonical usage timestamp and enclosing Settings update
timestamp; content and other settings remain unchanged. An empty history proves
route authorization, not recovery of a retained design revision.

Stop the fixture with `stop` on its stdin or SIGTERM to its printed owned PID.
Cleanup checks the canonical data files, generated route tree and public build
identity and removes the disposable runtime. This gate is local compiled-runtime
acceptance; it does not certify hosted accounts, database transport, providers,
or the separate deployment-configuration flag described above.
