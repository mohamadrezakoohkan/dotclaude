# Specification Quality Checklist: Folder scope for Browse and search

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-03
**Last re-run**: 2026-08-03, after implementation and after `/speckit-analyze`
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.

### The one open item — now closed

**"No [NEEDS CLARIFICATION] markers remain" — passed on the second iteration.** FR-013 carried exactly one marker, presented as Q1 in the spec. Record `0017` explicitly deferred that question here, and it could not be resolved by informed guess: the options differ in what gets persisted, and the stored shape cannot be migrated once written to browser storage and encoded in bookmarked URLs. It went to Reza rather than into an Assumptions bullet, and he chose **option C** on 2026-08-03 — store `{ scopes: {}, active: [...] }`, ship only the checkbox UI. Encoded as FR-013 and the new FR-014, which puts named scopes explicitly out of scope so a later reader does not mistake the stored shape for missing UI.

**All 16 items now pass**, in two iterations, well inside the command's limit of three.

### Third re-run, 2026-08-03 — after implementation and `/speckit-analyze`

This checklist was first marked 16/16 **before** four amendments landed, and was not re-run. `/speckit-analyze` caught that as finding C1, and it was right: one tick had become false.

- **"Requirements are testable and unambiguous" had silently regressed.** `SC-007` read *"at most two interactions (tick none, then tick the folders wanted)"*. When `FR-001` lost its "none" button, the parenthetical named a control that no longer existed **and** the claim became arithmetically false — an N-folder scope costs N ticks. Restated as one interaction per folder to narrow, exactly one to widen, which is measurable and true.
- **Two contract inconsistencies were also fixed** in `contracts/scope.md` (findings I1, I2): the bulk-actions row still promised "all" and "none", and the header row omitted the `Folders all` unfiltered wording. A contract describing a button that does not exist is worse than no contract.
- **Re-checked, still passing**: no `[NEEDS CLARIFICATION]` markers; scope bounded; assumptions identified; every acceptance scenario defined; no implementation detail leaked beyond the two boundary constraints `0017` fixed (documented as a deliberate exception above).

**16/16 again, and this time verified against shipped behaviour rather than against intent.** The lesson worth carrying: a quality checklist signed before implementation is a statement about the plan, not about the product.

### Judgement calls worth recording

- **"No implementation details" — passes, with one deliberate exception.** FR-004 names `source:` terms and the URL hash, and FR-006 names browser storage. Both are boundary constraints fixed by accepted record `0017`, not implementation choices this spec is free to make; stating them as requirements is what keeps a later plan from re-deciding them. They are cited to §7/§8 and to `0017` rather than re-specified here.
- **Sections not used**: the template's third user story slot and its example FR-006/FR-007 clarification placeholders were removed rather than left as "N/A", per the command's section rules. Three user stories are present, and they are the real three.
- **This spec restates no design-spec section**, per the constitution's Technical Constraints and `0014` answer 2. §7, §8, §2, §4, §5, §6 and §10 are cited by number and relied upon; none is paraphrased. Verified by reading the Extends line against each section.
- **Terminology** follows constitution Principle V: artifact, source, cluster, effective, chip. "outside scope" is a new **chip**, never a badge, and "scope" is the one name for this concept throughout — the spec does not also call it a filter, a workspace, or a selection.
