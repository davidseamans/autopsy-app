# QBO Phase 0 Sandbox Foundation

Status: sandbox connection foundation; no company connected

## Delivered boundary

- server-only Intuit configuration;
- runtime rejection of every environment except `sandbox`;
- QuickBooks Online Accounting scope only;
- single-use, ten-minute OAuth state persisted only as a SHA-256 hash;
- tenant-bound connection persistence with AES-256-GCM encrypted access and refresh tokens;
- authenticated connect, status and disconnect endpoints;
- state-bound callback and remote token revocation before local disconnect;
- numeric `realmId` validation;
- read-only allowlists for agreed discovery entities and reports;
- no production QBO connection, Payments scope, accounting write or real data.

## Deliberately not claimed

No QBO company is connected by this change. Token rotation, company reads, webhook handling,
CDC reconciliation, Australian tax mapping and attachment linking remain unproven against the
Intuit sandbox and require separate acceptance evidence.

## Required environment variables

- `QBO_ENVIRONMENT=sandbox`
- `QBO_CLIENT_ID`
- `QBO_CLIENT_SECRET`
- `QBO_REDIRECT_URI`
- `QBO_TOKEN_ENCRYPTION_KEY` (base64-encoded 32-byte key)

All are server-only. None may use the `VITE_` prefix.

## Endpoints

- `POST /api/qbo/connect` — authenticated connection start;
- `GET /api/qbo/callback` — single-use state-bound Intuit callback;
- `GET /api/qbo/status` — authenticated non-secret connection status;
- `POST /api/qbo/disconnect` — authenticated remote revocation followed by local deletion;
- `GET /api/qbo/sandbox-capabilities` — authenticated read-only capability contract.

## Next gate

1. Deploy and verify the authenticated endpoints.
2. Connect only an Intuit sandbox company containing dummy data.
3. Prove token rotation, duplicate protection and read-only company queries.
4. Add webhook verification and CDC only after separate review.
5. Return for the separate Phase 1 decision before any accounting write.
