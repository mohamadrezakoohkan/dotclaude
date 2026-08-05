# 0015 — Support one level of nested frontmatter, and stop failing well-formed files

- Status: Accepted — approved by Reza's `/decide-and-continue` invocation on the reply whose Q1 asked whether to settle this record before merging (2026-07-29). Implementation is a separate task in a fresh session; this record does not authorise the merge.
- Date: 2026-07-29
- Supersedes: — (amends spec §3 *Parsing*; D9/D10 unchanged in principle, see below)

## Context

Adopting spec-kit (`0014`) added 10 skills to a source this app indexes, and all 10 validate **FAIL**. Not on quality — on the structural pre-check, which reports `frontmatter does not parse`. The cause is identical in all 10:

```yaml
metadata:
  author: "github-spec-kit"
  source: "templates/commands/analyze.md"
```

A **nested map** — the exact shape spec §3 *Parsing* rules out:

> Verified at M1 against 946 real frontmatter blocks: this subset **is** sufficient. In the 577 classified artifacts, nested maps, lists-of-maps and flow mappings appear zero times.

That sentence was true when M1 measured it and is false now. The corpus went from **0 parse errors in 581 artifacts to 10 in 591**, all from one upstream author — GitHub's own spec-kit, which ships this frontmatter to every one of its agent integrations. The empirical basis for excluding nested maps was "nobody writes them"; somebody does, and M1's own instruction covers this case: *"If a shape needs support beyond §3's stated subset, that is a spec change: stop and write a record."*

Two things worked exactly as designed and should not be lost in the fix. The artifacts were **indexed anyway** with a parse-error chip and a raw body, per §3's never-dropped rule; and `name` and `description` still resolved, so classification, search and linking are unaffected. The damage is confined to the `metadata` key being unavailable and to the verdict.

The verdict is the real defect. D10 exists so that "a real blocker caught by heuristic shows as WARN, never a wrong FAIL". These files are **well-formed YAML**; the failure is dotclaude's parser reaching its own stated limit. Scoring 0 for that is the app blaming the artifact for the tool — the same class of wrong answer D10 was written to prevent, arriving through a deterministic check instead of a heuristic one. Under the current rules the FAIL is legal, which is what makes it worth a record rather than a bug fix.

## Decision

Teach the frontmatter parser one level of nested mapping, and split the structural check so that "malformed" and "valid YAML beyond the supported subset" are different outcomes — only the first may score 0.

## Trade-off accepted

A slightly larger parser and a second structural outcome to reason about, on a spec that v1 closed — accepted because the alternative leaves 10 permanent FAILs in this repo's own corpus, which makes the FAIL chip noisier exactly where it is looked at first, and because the corrected §3 sentence would have to say "zero times, except the tool we adopted".

## Alternative rejected

**Accept the chips and correct §3's prose** to name spec-kit as the known exception. Cheaper — no code, one sentence — and defensible while the exception is one upstream author. Rejected because it makes the FAIL chip mean two different things, and because §3's subset was justified by measurement rather than by principle: once the measurement changes, the subset should follow it.

## Consequences

- **Spec sections to update:** §3 *Parsing* — replace the "zero times" claim with what is now true, and state that one level of nesting is supported. §6 *Structural pre-checks* — record the split between malformed and beyond-subset. D10's wording is unchanged but its scope widens in practice: no well-formed artifact may score 0 for a parser limitation.
- **Files or areas affected:** the frontmatter parser and the structural check in `src/`, their tests, and the two spec sections above.
- **Verification:** the 10 speckit skills must expose `metadata` and stop failing structurally; the corpus's parse-error count returns to 0; a deliberately malformed file still gets a chip and still scores 0; a file nested two levels deep still degrades gracefully rather than crashing.
- **Follow-up task:** none beyond the implementation — this is a v1 spec amendment, so it wants its own branch and plan rather than riding on `feat/spec-kit-adoption`.
