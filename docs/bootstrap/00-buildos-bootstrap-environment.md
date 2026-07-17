# autopsy-app BuildOS Bootstrap Pointer

**Repository:** `davidseamans/autopsy-app`
**Document role:** Engineering startup and authority pointer
**Canonical governance source:** `davidseamans/autopsy-canonical`

## Purpose

This document bootstraps engineering sessions in the canonical Autopsy application implementation repository.

It identifies where constitutional authority is located and defines the minimum load order before implementation begins.

It is intentionally lightweight.

It does not duplicate, replace, amend or reinterpret canonical governance, constitutional doctrine or cross-product architecture.

## Authority Model

This repository contains executable product implementation.

It does not contain constitutional authority.

### Canonical source

GitHub repository:

`davidseamans/autopsy-canonical`

This is the canonical source of version-controlled BuildOS governance, constitutional doctrine and cross-product architecture.

### Canonical publication mirror

Notion contains the approved human-facing publication mirror of canonical governance and constitutional material.

Notion is not equivalent to the GitHub canonical source.

Where publication state, wording or version differs, identify the discrepancy and resolve it through the applicable governance authority before mutation. Do not silently choose whichever source is more convenient.

## Required Load Order

Before repository mutation:

1. Read local `AGENTS.md` and any narrower directory instructions.
2. Load the canonical BuildOS Bootstrap Environment.
3. Load `01 — Canon` as the governance index.
4. Load Canon 69 when authority, persistence, canonisation, doctrine or architectural decision-making is involved.
5. Load BEO-001 — BuildOS Engineering Office Operating Manual.
6. Load AUT-001 — Operator Maturity Engine Canon.
7. Load the relevant canonical architecture, ADR, engineering standard, GitHub issue and current evidence.
8. Inspect the relevant application implementation and tests.
9. Verify the current remote repository baseline.
10. Confirm the current authority envelope and prohibited actions.

Every repository mutation involves an authority decision. Canon 69 must therefore be loaded before mutation.

AUT-001 governs meaning. Implementation governs mechanics. Mechanics must never redefine meaning.

Load current canonical sources. Do not substitute copied excerpts, historical summaries or conversational memory.

## Canonical References

Current canonical references include:

- governance repository: `davidseamans/autopsy-canonical`;
- BEO-001: `docs/standards/BEO-001-buildos-engineering-office-operating-manual.md`;
- AUT-001: `docs/canon/autopsy-canon-v2-operator-maturity-engine.md`;
- Canon 69: `docs/canon/069-designated-authority-executive-memory.md`;
- BuildOS Bootstrap Environment: canonical governance source and approved Notion publication mirror;
- `01 — Canon`: canonical governance index and approved Notion publication mirror.

Paths and versions may change. Verify document identity and current publication state before relying on a path.

Do not copy the canonical corpus into this repository. This file must remain a pointer.

## Repository Qualification

Before creating a branch:

1. Confirm the attached workspace.
2. Confirm the Git remote identifies `davidseamans/autopsy-app`.
3. Confirm the current branch.
4. Inspect tracked, staged and untracked state.
5. Record local `HEAD`, local `main` and locally known `origin/main`.
6. Fetch or independently query GitHub for current remote `main`.
7. Determine the exact ahead, behind and divergence state.
8. Confirm no local commits or user files would be lost.
9. If authorised to refresh, use a clean fast-forward-only update.
10. Reconfirm local `main`, `origin/main`, `HEAD` and working-tree cleanliness.
11. Create a dedicated branch only after the baseline is qualified.

A stale local tracking ref is not proof that the checkout is current.

Dirty state, divergence, ambiguous identity or an inaccessible remote baseline blocks branching until resolved.

Do not rely on conversational memory for repository state.

## Control-Plane Boundaries

Keep these authority boundaries distinct.

### Repository

Authority to inspect or modify files and Git state in the attached local checkout.

### GitHub

Authority to fetch, push, publish a draft pull request, change review state, merge or alter repository settings.

Each GitHub mutation requires authority for that specific action.

### Runtime

Authority to inspect or operate a deployed application, API, workflow or connected service.

Repository access does not grant runtime mutation authority.

### Production

Authority to change live data, schemas, policies, credentials, deployments, workflows, environment variables or customer-visible behavior.

Production mutation requires separate explicit authority for the exact target and effect.

Engineering capability never transfers owner authority.

Permission in one control plane does not transfer to another. Tool availability and authenticated access are capabilities, not authority.

## Engineering Lifecycle

BEO-001 governs the repository lifecycle:

`qualified baseline → dedicated branch → bounded change → validation → focused commit → draft pull request → CI evidence → explicit Ready-for-Review authority → explicit merge authority → post-merge verification`

No authority transition may be inferred from completion of a previous stage.

In particular:

- local validation does not authorise publication;
- draft publication does not authorise Ready-for-Review;
- green CI does not authorise Ready-for-Review;
- Ready-for-Review does not authorise merge; and
- merge does not authorise production mutation.

## Interruption Recovery

After interruption, context compaction or a new session, recover from live evidence.

Re-establish:

1. workspace and repository identity;
2. current branch;
3. `HEAD`, local `main` and `origin/main`;
4. tracked, staged and untracked state;
5. intended file scope and complete diff;
6. commit and remote-branch identity;
7. pull-request identity, exact head SHA and base SHA;
8. CI, review, conflict and merge state;
9. current authority gate;
10. next authority gate; and
11. rollback reference.

Conversational memory may help locate evidence. It does not prove current repository, GitHub, runtime or production state.

## Failure Rule

Missing, inaccessible, ambiguous or contradictory governing material is a blocker.

It is not permission to:

- infer constitutional meaning;
- infer owner authority;
- reconstruct doctrine from memory;
- proceed from a stale copy;
- invent architecture;
- weaken a governance control;
- broaden implementation scope; or
- mutate a runtime or production system.

Stop before mutation. Identify the unavailable or conflicting source and the authority required to resolve it.

## Required Bootstrap Report

Before editing, report:

- workspace and repository identity;
- governing sources loaded;
- relevant architecture and issue;
- current branch and working-tree state;
- verified remote baseline;
- exact bounded objective;
- intended files;
- prohibited actions and systems;
- validation plan;
- publication plan;
- current authority gate; and
- next authority gate.
