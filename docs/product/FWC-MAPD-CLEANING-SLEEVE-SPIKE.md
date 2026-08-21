# FWC MAPD — Cleaning Sleeve spike

## Decision

The Fair Work Commission Modern Awards Pay Database API is the authoritative source of calculated MA000022 rate data. It is not an award-interpretation engine.

This integration belongs to the Cleaning Industry Sleeve. Core continues to own roster facts, time entries, payroll-input mappings, exceptions and audit evidence.

## Stage 1 acceptance

- Retrieve the Cleaning Services Award by official API code/source identifier.
- Retain effective dates, version, last-modified time, retrieval time and ETag where supplied.
- Keep the API key server-only.
- Mark every snapshot `interpretationPerformed: false`.
- Preserve the last-known-good snapshot when FWC is unavailable or returns `304 Not Modified`.
- Do not select coverage, classification, penalties or allowances for an employee.
- Do not calculate gross pay or transmit a payroll submission.

## Official contract

- Base URL: `https://api.fwc.gov.au/api/v1`
- Authentication header: `Ocp-Apim-Subscription-Key`
- Initial operation: `GET /awards?name=Cleaning+Services&page=1&limit=100&sort=code+asc`
- API is read-only apart from webhook subscription management.
- FWC recommends local caching and webhooks because availability is not guaranteed and rate data changes infrequently.

## Human gate

Registration requires a verified email, named contact, phone number, organisation, ABN, acceptance of the FWC terms by an authorised person, and MFA. After approval, create a subscription and place its key in the server-only `FWC_MAPD_SUBSCRIPTION_KEY` environment variable.

## Run

```bash
npm run spike:fwc-mapd
```

Passing evidence is a result containing `MA000022`, its fixed identifier and effective-dated source fields. That result authorises expansion to classifications, pay rates, penalties and allowances; it does not authorise interpretation.

## Stage 2 gate

Only after the source-data spike passes:

1. Build a manually verified MA000022 scenario pack.
2. Compare 10–20 representative shifts with KeyPay.
3. Require every difference to be explainable and reproducible.
4. Keep payroll authoritative.
