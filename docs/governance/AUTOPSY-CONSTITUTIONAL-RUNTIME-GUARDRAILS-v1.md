# Autopsy Constitutional Runtime Guardrails v1

**Status:** Active production control  
**Authority:** Designated Authority — FULL  
**Effective:** 16 July 2026  
**Kernel version:** `autopsy-kernel-2026-07-16-v1`  
**Turn contract:** `autopsy-turn-contract-v1`  
**Policy gate:** `autopsy-policy-gate-v1`

## Purpose

Prevent conversational drift at production scale without requiring manual review of every interaction.

Autopsy must remain an Operator Maturity Engine. It identifies the level and trajectory of operator maturity demonstrated for a specific commercial challenge. It must not become generic business coaching, passive companionship, identity judgement, a visible questionnaire, or a system that chooses the operator's destination.

## Runtime architecture

Every turn passes through five governed stages:

1. **Constitutional kernel** — immutable purpose, authority boundaries, evidence rules and prohibited drift.
2. **Structured turn contract** — the model must declare operator intent, commercial challenge, conversation mode, guidance permission, evidence target, confidence, confirmation state and proposed reply.
3. **Deterministic policy gate** — code rejects known drift patterns before the reply reaches the operator.
4. **Controlled regeneration** — one retry receives the exact policy violations and must produce a corrected complete contract.
5. **Fail closed** — a second failure is withheld rather than shown.

## Required turn contract

```json
{
  "operator_intent": "brief description",
  "commercial_challenge": "specific challenge or null",
  "mode": "orientation | evidence_discovery | interpretation_confirmation | explicit_guidance | reassessment | protective_intervention | pause_or_close",
  "guidance_permission": false,
  "evidence_target": "behavioural maturity evidence or null",
  "evidence_confidence": 0.0,
  "maturity_interpretation": null,
  "requires_confirmation": false,
  "reply": "operator-visible text"
}
```

Only `reply` is shown to the operator. The remaining fields provide observability and policy enforcement.

## Blocking conditions

The deterministic gate rejects:

- empty or excessively long replies;
- more than one question in a spoken turn;
- exposed question numbers, scores, dimensions, coverage or hidden signals;
- identity judgements about readiness, capability or maturity;
- unsolicited prescriptions such as “you should”, “you must” or “you need to” where guidance permission is absent;
- explicit-guidance mode without permission;
- maturity interpretations presented without confirmation;
- unsupported maturity, trajectory or ceiling verdicts.

## Evidence discipline

The canonical sequence remains:

`Transcript → Interpretation → Confidence → Operator Confirmation → Canonical Evidence`

No transcript or model interpretation is independently canonical. Maturity findings, trajectory updates and ceiling assessments must remain provisional until the evidence state permits otherwise.

## Change procedure

Any change to the prompt, model, canonical questions, maturity ontology, policy gate or conversation modes must follow this procedure:

1. Retrieve the current constitutional canons from Notion.
2. State the intended behavioural change and identify which canon authorises it.
3. Update the kernel or contract under a new version when meaning changes.
4. Add or update regression tests representing both acceptable and prohibited behaviour.
5. Run the complete automated test suite.
6. Deploy to preview and inspect build/runtime logs.
7. Test adversarial conversations: vague request for help, direct request for advice, contradiction, refusal, change of direction, insufficient evidence and explicit assessment request.
8. Promote only the verified commit to production.
9. Record kernel, contract, policy, model and commit versions.
10. Roll back immediately if unsolicited coaching, passive abdication, visible assessment machinery or unsupported certainty appears.

## Release gate

A conversational change is not releasable unless:

- the Constitution has been loaded and cited in the change record;
- regression tests pass;
- policy failures fail closed;
- production metadata identifies all runtime versions;
- a rollback commit is known;
- no secret is present in source control;
- the operator-visible reply remains subordinate to the operator while still serving Autopsy's maturity purpose.

## Monitoring

Production should track structured, content-minimised metrics:

- policy rejection rate;
- regeneration rate;
- fail-closed rate;
- unsolicited-direction violations;
- hidden-architecture violations;
- unsupported-interpretation violations;
- mode distribution;
- guidance-permission rate;
- operator correction and abandonment rates when available.

Raw transcripts are not required for routine drift monitoring.

## Incident response

When drift is reported:

1. Stop prompt tuning.
2. Retrieve the exact production kernel, contract, gate and deployment commit.
3. Reproduce the operator turn.
4. Classify the breach against a canon and policy rule.
5. Add the case to the regression suite before changing production.
6. Correct the narrowest responsible layer.
7. Deploy, verify and document the incident.

Do not solve constitutional drift with informal prompt wording alone.
