# Autopsy Stripe Test-Payment Boundary v1

**Status:** implementation draft  
**Canonical authority:** `davidseamans/autopsy-canonical#65`  
**Implementation issue:** `davidseamans/autopsy-app#32`

## Journey

`free conversation → explicit choice → Stripe Checkout → signed webhook → Supabase entitlement → authorised Autopsy`

The free conversation builds trust and answers the candidate's questions. It is
not an assessment and its transcript is not canonical maturity evidence.

The candidate purchases one Autopsy assessment for $49 AUD. Payment does not
guarantee a favourable verdict or admission to First 5 Jobs. A recommendation
not to proceed is a valid, successful diagnostic outcome.

## Authority boundaries

- Stripe processes the payment.
- Supabase owns orders, webhook idempotency and entitlements.
- The signed webhook is the only payment authority.
- The Checkout success redirect is informational.
- The client never supplies the amount, currency or Stripe Price ID.
- This implementation rejects live Stripe secret keys.

## Required test configuration

Create a one-time $49 AUD Price in Stripe test mode, then configure these
server-only Vercel environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY` (`sk_test_…` only)
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_AUTOPSY_PRICE_ID`
- `APP_BASE_URL`

Register the webhook endpoint:

`https://<preview-host>/api/stripe/webhook`

Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

Apply `20260721042338_autopsy_stripe_test_payment_boundary.sql` to an approved
non-production Supabase environment before testing. No migration or environment
mutation is performed merely by merging this repository change.

## Test card

Use Stripe's documented test card `4242 4242 4242 4242`, any future expiry,
any CVC and a valid postal code. Never use real card details in test mode.

## Certification path

1. Start and persist a free conversation.
2. Confirm the transcript rows are non-canonical evidence.
3. Open Checkout and cancel; confirm no entitlement exists.
4. Complete test payment; confirm the redirect alone remains pending.
5. Confirm the signed webhook records one event, marks one order paid and grants one entitlement.
6. Replay the event and confirm no duplicate entitlement is created.
7. Confirm another authenticated user cannot read the conversation, order or entitlement.
8. Confirm a live key and a live webhook event both fail closed.

