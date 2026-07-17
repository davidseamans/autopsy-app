# Autopsy Application Repository Instructions

## Repository Identity

This repository, `davidseamans/autopsy-app`, is the canonical implementation repository for the Autopsy application.

It contains executable product implementation, including application code, tests, governed migrations, deployment configuration and implementation documentation.

It does not contain constitutional authority.

Governance, constitutional doctrine and cross-product architecture remain canonical in:

`davidseamans/autopsy-canonical`

The application repository may implement canonical decisions. It must not originate, replace or silently reinterpret them.

## Mandatory Bootstrap

Before any repository mutation:

1. Identify the attached workspace.
2. Confirm the repository is `davidseamans/autopsy-app`.
3. Read this `AGENTS.md` completely.
4. Read `docs/bootstrap/00-buildos-bootstrap-environment.md`.
5. Load the canonical governance required by that bootstrap.
6. Inspect the relevant application implementation, tests and neighbouring conventions.
7. Load the relevant architecture, GitHub issues and current evidence.
8. Verify the current remote baseline and local Git state.
9. Confirm the authority envelope, prohibited actions and next authority gate.
10. Define the smallest bounded change that satisfies the authorised objective.

Do not begin mutation when repository identity, governing material, baseline state or authority is ambiguous.

Do not rely on conversational memory for repository state.

A narrower `AGENTS.md`, if introduced later, may add path-specific controls but must not weaken these repository-level instructions.

## Engineering Authority

BEO-001 — BuildOS Engineering Office Operating Manual governs the engineering lifecycle.

Engineering capability never transfers owner authority.

Tool access, repository permissions, authenticated connectors, green CI and technical mergeability are capabilities or evidence. They are not owner authority.

Every material action must remain inside the authority expressly granted for the current task.

Apply BEO-001 to:

- repository qualification;
- remote-baseline verification;
- branch creation;
- bounded implementation;
- validation;
- staging and commit discipline;
- draft pull-request publication;
- CI inspection;
- Ready-for-Review transition;
- merge authority;
- interruption recovery;
- rollback evidence; and
- post-merge verification and cleanup.

## AUT-001 and Constitutional Meaning

AUT-001 — Operator Maturity Engine Canon governs meaning.

Implementation governs mechanics.

Mechanics must never redefine meaning.

Load and apply AUT-001 before work affecting or interpreting:

- operator maturity;
- maturity evidence or confidence;
- scoring, bands, thresholds or answer values;
- questions, prompts or conversation behavior;
- assessment, diagnosis or verdicts;
- operator trajectory or capability ceilings;
- progression, readiness or capability unlocks;
- Stage 1;
- 5JD;
- Core admission or Core authority;
- Sleeves or Sleeve-specific interpretation;
- reinforcement or operator development; or
- any product surface that may classify, judge, direct or develop an operator.

Application behavior must preserve the constitutional meaning, evidence boundaries, confidence requirements, operator confirmation and operator authority established by AUT-001.

If implementation mechanics conflict with canonical meaning, stop and resolve the conflict through the applicable authority gate. Do not reinterpret the Canon to fit existing code.

## Architecture, Issues and Evidence

Before implementation:

1. Identify the relevant canonical architecture, standard, ADR and GitHub issue.
2. Read the current issue body and relevant comments.
3. Inspect current implementation and test behavior.
4. Retrieve current operational evidence when runtime truth affects the change.
5. Separate observed facts, inference, proposal and unknown state.
6. State the exact bounded objective and intended files.
7. Report adjacent defects without absorbing them into scope unless separately authorised.

Checked-in wording, historical PRs and conversational summaries are not substitutes for current evidence.

When sources conflict, stop before mutation and identify the conflict, precedence question and required authority decision.

## Git and Branch Discipline

- Never write directly to `main`.
- Begin mutation only from a clean, verified and current baseline.
- Verify remote `main` before creating a branch.
- Stop if local state is dirty, divergent or could lose user work.
- Use a dedicated branch for one coherent objective.
- Use the `codex/` branch prefix unless explicitly instructed otherwise.
- Keep scope bounded, inspectable and reversible.
- Preserve unrelated user changes.
- Stage only intended paths.
- Do not use broad staging when unrelated or generated files may be present.
- Do not use destructive Git operations without explicit authority for the exact target and effect.
- Do not mix opportunistic cleanup or unrelated repairs into an authorised change.

## Validation Gates

Validation is a sequence of distinct evidence and authority gates. Passing one gate does not imply passage through another.

### Local Validation

For ordinary repository changes, run:

1. `npm ci`
2. `npm run build`
3. `npm test`
4. `git diff --check`

Also run focused validation required by the changed surface.

Do not claim a command passed unless it was executed successfully. Report unavailable or unexecuted validation plainly.

### Repository Validation

Before committing or publishing:

- inspect `git status`, including untracked files;
- confirm only authorised paths changed;
- inspect the complete diff;
- confirm the change matches the approved objective;
- confirm no secrets or credentials are present;
- confirm `package-lock.json` changes only when dependency changes are authorised;
- confirm `bun.lockb` was not modified merely because it exists;
- run staged and committed diff checks appropriate to the lifecycle stage; and
- preserve exact baseline and rollback evidence.

npm is the authoritative package manager for this repository.

Current repository conventions are:

- dependency installation: `npm ci`;
- production build: `npm run build`;
- complete test suite: `npm test`;
- patch validation: `git diff --check`;
- primary CI: `.github/workflows/app-ci.yml`;
- focused constitutional CI: `.github/workflows/constitutional-guardrails.yml`.

Inspect current files before relying on these conventions because repository configuration may change.

### CI Validation

After publication:

- inspect actual GitHub workflow triggers and path filters;
- distinguish required, optional, external, skipped and not-applicable checks;
- report checks as passed, failed, pending, skipped or not applicable;
- never report pending CI as green;
- inspect the actual check result rather than infer it from local validation; and
- stop progression when required CI fails or remains unresolved.

Green CI is evidence of tested repository state. It is not Ready-for-Review or merge authority.

### Owner Validation

Owner validation is a governance decision, not an automated check.

The owner controls:

- acceptance of material scope or meaning;
- Ready-for-Review authority;
- merge authority;
- production or external-system mutation authority; and
- acceptance of residual risk.

Ready-for-Review authority shall never be inferred from green CI.

Owner authority does not excuse failed checks, scope drift, conflicts or unresolved review findings.

### Publication Validation

Before publishing a branch or draft pull request:

- confirm publication is authorised;
- confirm branch and commit identity;
- confirm exact file scope;
- confirm local validation evidence;
- confirm baseline and rollback references; and
- confirm the pull request will be created as draft.

After publication:

- verify the remote branch and draft pull request from live GitHub state;
- verify the exact head SHA, base branch and file list;
- inspect CI and review state;
- report the current authority gate; and
- stop unless the next transition is separately authorised.

## Pull Requests and Authority Gates

Repository publication uses draft pull requests.

A draft pull request must report:

- objective and reason;
- exact files changed;
- bounded scope;
- validation commands and results;
- CI expectations and actual results when available;
- deployment and governance risk;
- external configuration impact;
- unresolved uncertainty;
- baseline SHA;
- branch and commit SHA; and
- exact rollback path.

Opening a draft pull request does not grant Ready-for-Review authority.

Marking a draft pull request ready requires separate explicit authority and a fresh inspection of:

- pull-request file scope;
- complete diff;
- CI state;
- review comments and unresolved threads;
- conflicts and mergeability;
- current base state; and
- exact head SHA.

Ready-for-Review authority shall never be inferred from green CI.

Merge requires separate explicit owner authority. Approval capability, technical mergeability and green CI do not grant merge authority.

Never self-merge without explicit owner instruction identifying the pull request and authorised merge action.

## External-System and Production Boundaries

Repository authority does not include authority to mutate external systems or production.

Do not modify any of the following unless the current task grants separate explicit authority for the exact target and effect:

- production applications or data;
- Supabase projects, schemas, data, policies, functions, secrets or settings;
- Vercel projects, deployments, domains or environment variables;
- n8n workflows, credentials, executions or publication state;
- Notion pages, databases or canonical records;
- GitHub settings, branch protection, secrets or credentials;
- local or hosted credentials, tokens or secret material; or
- any other live runtime or external-system configuration.

A repository migration, workflow specification or deployment configuration is implementation source. Committing it does not authorise applying it to a live system.

Do not expose secrets in commands, logs, diffs, commits, pull requests or reports.

## Interruption Recovery

After interruption, context compaction or a new session, recover from live local Git and GitHub state.

Re-establish:

1. workspace identity;
2. repository identity;
3. current branch;
4. `HEAD`, local `main` and `origin/main`;
5. working-tree, staged and untracked state;
6. intended file scope and complete diff;
7. commit and remote-branch identity;
8. pull-request identity, exact head SHA and base SHA;
9. CI, review, conflict and merge state;
10. current authority gate;
11. next authority gate; and
12. rollback reference.

Do not rely on conversational memory for repository state.

Conversational memory may provide historical context or search terms. It is not evidence of current Git, GitHub, CI, runtime or production state.

## Failure Rule

Missing, inaccessible, ambiguous or contradictory governing material is a blocker.

It is not permission to:

- infer authority;
- reconstruct doctrine from memory;
- continue from a stale source;
- invent architecture;
- weaken a control;
- broaden scope; or
- mutate an external system.

Stop before mutation and report the exact missing or conflicting source and the authority required to resolve it.

## Completion Report

Every engineering handoff must report:

- repository and workspace;
- files changed and why;
- commands executed;
- local validation results;
- repository validation results;
- CI results where applicable;
- application, deployment and external-system impact;
- risk and unresolved uncertainty;
- baseline SHA;
- branch and commit identity;
- pull-request identity where applicable;
- rollback evidence;
- current authority gate reached; and
- next authority gate.

Completion must not be claimed until the evidence required by the authorised scope has been verified.
