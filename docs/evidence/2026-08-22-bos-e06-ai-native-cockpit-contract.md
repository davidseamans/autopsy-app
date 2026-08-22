# BOS-E06 — AI-Native Cockpit and Governed Action Contract

Date: 22 August 2026  
Status: Draft contract evidence; no production action enabled

## Implemented contract

- Every amber or red signal requires consequence, owner, next action and evidence.
- Normal green detail is suppressed by default and remains available by explicit drill-down.
- Tenant and role filters apply before a signal reaches a cockpit.
- AI recommendations require evidence references and preserve declared uncertainty.
- Conversation may prepare an action, but Tenant identity, permission and monetary approval limit decide whether it is ready, approval-required or blocked.
- Routine authorised actions do not require BuildOS staff intervention.
- Tenant maturity can advance only one level at a time when the next level's capabilities are demonstrated; it is not a static subscription label.
- Owner financial position is presented in the approved order: cash flow, gross contribution, indicative net margin.

## Boundary

This is a Core decision contract, not a finished cockpit UI and not an autonomous action executor. It does not give AI authority, invent evidence, bypass role controls, perform accounting, add Cleaning-specific logic or elevate Hudson ahead of the governed workflows.

## Remaining proof

- Bind signals to live BOS-E01–E05 read models and immutable source references.
- Implement the role-specific Owner, manager, accounts and Worker views.
- Prove an end-to-end conversational action requiring no BuildOS staff and an over-limit action requiring Tenant approval.
- Verify the cockpit matures correctly when the Tenant changes level.
