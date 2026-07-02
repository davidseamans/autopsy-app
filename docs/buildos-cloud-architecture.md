# BuildOS Cloud Architecture Doctrine

Status: Locked baseline for construction

## Core Decision

BuildOS is a cloud product.

Customers log into BuildOS. They do not use, see, administer, or depend on our development tools.

Customer-facing entry point:

```text
app.buildos.com
```

Production spine:

```text
Customer
  ↓
Vercel App
  ↓
Supabase Core
  ↓
QBO Interface
```

Supporting interfaces such as AI, email, document storage, and workflow automation sit behind BuildOS and must never become separate customer-facing systems.

## Platform Roles

### Vercel

Vercel owns the product experience.

It delivers:

- Morning Orientation / Daily Briefing
- Owner Cockpit
- Staff Cockpit
- Client Cockpit
- Operations, Finance, Sales, People, and Strategy Cockpits
- Public/product pages where required
- Application routing and authenticated user experience

Vercel does not own business truth.

### Supabase Core

Supabase owns the operational truth layer.

It stores:

- Accounts
- Contacts
- Addresses
- Actors
- Engagements
- Quotes
- Jobs
- Scope Areas
- Work Items
- Tasks
- Evidence
- Annotations
- Readiness Gates
- Exception Events
- Audit Events
- Invoice Requests
- Payroll Inputs
- Business Memory

Supabase is the system of record for BuildOS Core.

### QBO Interface

QBO is the first accounting and payroll compliance engine.

QBO owns:

- Accounting ledger
- GST/BAS treatment
- Debtors and payments
- Bank reconciliation
- Payroll calculation
- PAYG, super, STP, payslips, and payroll compliance where QBO Payroll is used

BuildOS owns:

- Invoice intent
- Payroll input approval
- Operational evidence
- Readiness and exception control
- Business consequence of QBO status

Doctrine:

```text
Core prepares clean business intent.
QBO executes accounting/payroll compliance.
Core receives confirmation and status.
BuildOS guides operational action.
```

## Internal Tools

The following are internal tools, not customer runtime products:

- Notion: design doctrine, documentation, internal operating manuals, architecture notes
- GitHub: source control and implementation record
- n8n: automation and integration orchestration
- Vercel dashboard: deployment management
- Supabase dashboard: database administration

Customers must not be placed inside our Notion workspace, n8n workflows, Supabase dashboard, Vercel dashboard, or GitHub repositories.

## Knowledge Domains

BuildOS separates three kinds of knowledge.

### 1. Operational Truth

Live facts about a client business.

Owned by the client. Stored in Supabase Core.

Examples:

- Jobs
- Quotes
- Staff
- Evidence
- Customer preferences
- Payroll inputs
- Invoice requests

### 2. Client Business Memory

What a specific client business has learned through its own evidence.

Owned by that client. Stored in Supabase Core. Used to guide that client only.

Examples:

- Mrs Smith's ensuite takes 24 minutes
- Mary performs strongly in aged-care sites
- ABC Office prefers Friday afternoon cleans

### 3. BuildOS Product Knowledge

Generalised and/or authored product intelligence.

Owned by BuildOS. May be developed in Notion, but production guidance should be delivered through BuildOS.

Examples:

- Industry sleeve templates
- Default benchmarks
- Readiness gate definitions
- Guidance rules
- Constitutional principles
- Aggregated anonymised patterns

Customer operational knowledge must never be exposed to another customer. Aggregated learning must be anonymised and generalised before becoming BuildOS Product Knowledge.

## Architecture Rules

1. BuildOS is the customer-facing product.
2. Vercel owns experience, not truth.
3. Supabase owns Core truth.
4. QBO owns accounting/payroll compliance.
5. Notion is internal documentation, not client runtime.
6. n8n is internal orchestration, not client runtime.
7. Customers drive the car; they do not enter the factory.
8. BuildOS controls the support experience; internal tools must not create customer-facing “not my department” failure points.
9. Integrations are interfaces, not product dependencies from the client’s perspective.
10. Any tool can be replaced behind the wall if the BuildOS product experience remains intact.

## Immediate Construction Target

Build first:

1. Morning Orientation / Daily Briefing shell
2. Owner Cockpit shell
3. Staff Cockpit proof of concept
4. Supabase-backed Core data models
5. QBO interface for one loop: invoice request or payroll input

Do not build:

- Customer-facing Notion workspaces
- Generic unrestricted AI
- Multi-accounting-package support
- Full rostering app
- Payroll compliance engine
- Bespoke client variations before Core is proven
