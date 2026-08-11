# Packet 4 operator-facing application reconciliation

## Pinned sources and isolation

- Application implementation SHA tested in the browser: `ce3de8fadaee93e0d28ab28c5b24ea7be4183299`
- Application baseline: `0c97c761a5a707bad64f56753bfdfc2391b0d585`
- Canonical Core contract: `976cc857c8b804fedde3128e1f80d4536d7d1f11`
- Canonical PR #91 handoff merge: `c7a9901788c287e3bed018129f6e34cf37db3d4a`
- Isolated Supabase development branch: `packet-4-app-reconciliation`
- Isolated project ref: `wldtwiukqjdogsnzwjwp`
- Production data copied: no
- Application preview: local Vite preview `http://127.0.0.1:8080/core`, bound through ignored `.env.local` values to the isolated project URL and branch-specific publishable key
- Vercel preview: not used because branch-specific environment binding could not be configured or proved from the available authenticated tooling
- Parent project, production data, production deployment, Control activation and canonical migrations: not accessed or changed

## Canonical migration reconciliation

The isolated branch began with versions `001`–`004`. The remaining canonical SQL migrations were replayed sequentially from the pinned canonical Git tree.

- Final migration count: `369`
- Final version: `20260811034405`
- Ordered `version:name` ledger SHA-256 in canonical source and isolated database: `112b97a868155c9ea43bdb2da4b7313d05f2fa6ca537a13042f381cb84793566`
- Required relations present: `core_accounts`, `core_contacts`, `core_sites`, `core_leads`, `core_pipeline`, `core_quotes`, `core_jobs`, `core_job_costs`, `revenue_events`
- Required view present: `core_job_margin_summary` with `security_invoker = true`
- Net/GST contract present: non-null `amount_ex_gst`, `gst_amount`, `amount_inc_gst`; non-negative checks; gross equals net plus GST
- Authenticated grants on governed Core tables: `SELECT` only
- Promotion capability: `core_promotion_writer`, `NOLOGIN`, `NOINHERIT`; not available to API roles

## Dummy identities and fixtures

All identifiers and values below are synthetic and exist only in `wldtwiukqjdogsnzwjwp`.

- Member user: `40000000-0000-4000-8000-000000000001` (`authenticated`)
- Non-member isolation user: `40000000-0000-4000-8000-000000000002` (`authenticated`)
- Fixture tenant: `41000000-0000-4000-8000-000000000001`, lifecycle `fixture` (not `active`)
- Member role/status: `owner` / `active`
- Quote: `45000000-0000-4000-8000-000000000001`, `P4-DUMMY-Q-001`, `$1,320.00`
- Job: `46000000-0000-4000-8000-000000000001`, `completed`
- Revenue event: `48000000-0000-4000-8000-000000000001`, `$1,000.00` ex GST + `$100.00` GST = `$1,100.00` inc GST
- Job cost row: `47000000-0000-4000-8000-000000000001`, labour `$400.00`, consumables `$120.00`, travel `$30.00`, other direct `$50.00`

The non-member authenticated user received empty arrays for both `core_accounts` and `core_job_margin_summary`.

## Browser and database-summary reconciliation

Authenticated browser observation at `ce3de8fadaee93e0d28ab28c5b24ea7be4183299`:

| Value | Browser | `core_job_margin_summary` |
|---|---:|---:|
| Quote | `$1,320.00` | `1320.00` |
| Revenue (ex GST) | `$1,000.00` | `1000.00` |
| Direct costs | `$600.00` | `600.00` |
| Gross profit | `$400.00` | `400.00` |
| Gross margin | `40.00%` | `40.00` |

The browser displayed `Promotion unavailable`, stated that browser-direct Core writes are disabled, and produced no console errors. An authenticated REST insert to `core_jobs` returned HTTP `403` with PostgreSQL error `42501`.

## Application scope and validation

- Legacy unprefixed `/leads`, `/accounts`, `/pipeline`, `/quotes` and `/jobs` routes redirect to authenticated `/core`.
- `/core` reads only `core_accounts` and `core_job_margin_summary`; tenant isolation is enforced by the canonical RLS policies.
- Quote, ex-GST revenue, direct costs, gross profit and gross-margin percentage are shown distinctly.
- Legacy browser mutation helpers fail closed and the unrouted revenue action is visibly unavailable.
- Positive promotion, Control activation, real data, production deployment and canonical migration changes remain excluded.

Validation at the implementation SHA:

- `npm ci`: completed; existing Node engine and dependency-audit warnings reported
- `npm run build`: pass
- `npm test`: 27 files, 203 tests passed
- `git diff --check`: pass

## Canonical handoff

For Issue #16 reconciliation, use the final application PR head SHA together with the tested implementation SHA above, this evidence record, canonical contract SHA `976cc857…`, isolated project ref `wldtwiukqjdogsnzwjwp`, and the deterministic fixture identifiers. Packet 4 remains not accepted because the positive controlled-promotion transaction is deliberately absent.
