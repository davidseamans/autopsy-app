# Autopsy / BuildOS Application

**Status:** Current application repository overview  
**Governing standard:** DS-001 — BuildOS Engineering Standards v1.0  
**Last reviewed:** 2026-07-15

This repository contains the approved customer-facing Autopsy and BuildOS application surfaces.

## Active Architecture

- **Vercel** hosts and delivers the approved application.
- **Supabase** owns operational business truth, validation, and governed data integrity.
- **GitHub** owns canonical source, version history, deployment artefacts, and rollback evidence.
- **n8n** performs deterministic orchestration, reconciliation, and recovery routing; it does not own business truth.
- **Notion** provides internal operational governance and human-control surfaces; it is not a customer runtime or competing source of truth.
- **OpenAI** provides bounded intelligence under explicit authority, validation, and evidence rules.

## Engineering Rules

1. No business-critical rule may exist only in a UI component.
2. Material mutations must cross an authorised, validated boundary and retain evidence.
3. Environment-specific configuration and secrets must remain outside source control.
4. Deployment success is not business-outcome proof; expected application behaviour must be independently verified.
5. Industry-specific logic belongs in Sleeves and must not contaminate universal Core semantics.

## Historical Tooling

The codebase originated from an earlier Lovable-generated project and may retain implementation dependencies, generated artefacts, or dated documents that identify that origin. Lovable, Bubble, and Make are not part of the active canonical BuildOS stack. Historical artefacts are retained only where needed for provenance and must not be treated as current architecture or authority.