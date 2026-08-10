# QBO Phase 0 Sandbox Foundation

Status: implementation foundation; not connected

## Delivered boundary

- server-only Intuit configuration;
- runtime rejection of every environment except `sandbox`;
- QuickBooks Online Accounting scope only;
- AES-256-GCM helpers for later token persistence;
- numeric `realmId` validation;
- read-only allowlists for agreed discovery entities and reports;
- authenticated capability endpoint at `/api/qbo/sandbox-capabilities`;
- no UI navigation, production connection, write operation or real data.

## Deliberately not claimed

This foundation does not claim that OAuth, token rotation, company reads, webhook handling,
CDC reconciliation, Australian tax mapping or attachment linking have been proven against an
Intuit sandbox. Those tests require an Intuit developer app and development credentials.

Connection persistence is also not installed in this change. The required Supabase migration
must be created with the approved migration tooling and separately reviewed before an OAuth
callback can store encrypted tokens.

## Required environment variables

- `QBO_ENVIRONMENT=sandbox`
- `QBO_CLIENT_ID`
- `QBO_CLIENT_SECRET`
- `QBO_REDIRECT_URI`
- `QBO_TOKEN_ENCRYPTION_KEY` (base64-encoded 32-byte key)

All are server-only. None may use the `VITE_` prefix.

## Next gate

1. Create an Intuit developer app and QBO sandbox.
2. Confirm its development redirect URI.
3. Install the reviewed tenant-bound connection-state migration.
4. Add connect, callback, status and disconnect endpoints.
5. Prove dummy-data reads, token rotation, duplicate protection, webhook verification and CDC.
6. Return for the separate Phase 1 decision.
