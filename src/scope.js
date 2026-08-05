// Folder scope (record 0017, specs/002-folder-scope). Scope is a VIEW filter: it narrows
// Browse and search and never reaches the indexer, so §4 orphans, §5 clusters and §6
// validator 1 keep seeing the whole corpus.
//
// Pure functions only — no DOM, no storage, no fetch. That is what lets `test/run.mjs`
// import this file; the browser gets it from `/scope.js`, the same way it gets `/search.js`.
// DOM and storage access live in `public/app.js`.
//
// The unit of scope is a source `name` (§2), never a path: paths are absolute and
// machine-specific, and 0006 treats them as private.

import { parseQuery } from './search.js'

const lower = (v) => String(v ?? '').toLowerCase()

/**
 * The scope currently expressed by the query. The query is authoritative (FR-004) — the
 * checkboxes render from this, never from a variable of their own, so a hand-edited query
 * needs no reconciliation.
 * @returns {string[]} lower-cased source names, in query order, deduplicated
 */
export function activeFromQuery(query) {
  return [...new Set(parseQuery(query).facets.source)]
}

/** Case-insensitive membership. `parseQuery` lower-cases facet values; source names keep their case. */
export function isActive(sourceName, active) {
  return active.some((a) => lower(a) === lower(sourceName))
}

/**
 * Is a filter actually in force? False when nothing is ticked AND false when everything is,
 * because both show the whole library — presenting either as a filter would be a lie
 * (spec Edge Cases).
 */
export function isScoped(active, sourceNames) {
  if (!active.length) return false
  const known = knownOnly(active, sourceNames)
  if (!known.length) return false
  return known.length < sourceNames.length
}

/**
 * Drop names that no longer match a registered source (FR-010) — a source renamed or removed
 * from the config leaves a stale name behind, and it must not block the rest.
 */
export function knownOnly(active, sourceNames) {
  return active.filter((a) => sourceNames.some((n) => lower(n) === lower(a)))
}

/** FR-013: the stored shape, with `scopes` reserved for named scopes a later feature adds. */
export function serializeStored(active) {
  return JSON.stringify({ scopes: {}, active: [...active] })
}

/**
 * Read the stored shape back. Every failure degrades to "no scope" and never throws — the
 * same never-dropped, never-crashes posture §3 takes for artifacts. Covers: absent, empty,
 * unparseable, valid JSON of the wrong shape, and a missing or unrecognised `scopes`.
 * @returns {{scopes: Record<string, unknown>, active: string[]}}
 */
export function parseStored(raw) {
  const empty = { scopes: {}, active: [] }
  if (typeof raw !== 'string' || !raw.trim()) return empty

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return empty
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return empty

  // `active` is the only field that matters. A missing, malformed or unrecognised `scopes`
  // is tolerated rather than a reason to discard a good scope (FR-013).
  const active = Array.isArray(parsed.active)
    ? parsed.active.filter((v) => typeof v === 'string' && v.trim())
    : []
  const scopes = parsed.scopes && typeof parsed.scopes === 'object' && !Array.isArray(parsed.scopes)
    ? parsed.scopes
    : {}

  return { scopes, active }
}

/**
 * Does this artifact's source sit outside the current scope? Drives the "outside scope" chip
 * (FR-007). False whenever no filter is in force — otherwise every artifact would wear the
 * chip at once, which makes it noise rather than information.
 */
export function isOutsideScope(artifactSource, active, sourceNames) {
  if (!isScoped(active, sourceNames)) return false
  return !isActive(artifactSource, active)
}

/**
 * Which scope wins on load. The hash comes first: a shared or bookmarked link must show what
 * its sender saw (SC-006), and a remembered scope silently overriding it would be exactly the
 * "scope changes behind your back" failure FR-008 rules out.
 */
export function resolveActive(query, storedRaw, sourceNames) {
  const fromQuery = activeFromQuery(query)
  if (fromQuery.length) return knownOnly(fromQuery, sourceNames)
  return knownOnly(parseStored(storedRaw).active, sourceNames)
}
