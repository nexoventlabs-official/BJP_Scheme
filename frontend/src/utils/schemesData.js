import { useSyncExternalStore, useMemo } from 'react'
import { chat } from '../api'
import { BJP_SCHEMES as STATIC_BJP_SCHEMES } from './constants'

// ── Runtime store for dynamic schemes (fetched from /api/schemes/list) ──
// Existing consumers keep their static 23-scheme arrays as a base; the DB list
// is layered on top by id (override + additions), so the UI works instantly and
// then upgrades to the dynamic catalog + Cloudinary images once loaded.

let schemes = []          // raw scheme docs from the API
let loaded = false
let loading = false
const listeners = new Set()

const imgById = new Map()
const imgByName = new Map()
const nameById = new Map()

function emit() {
  listeners.forEach((l) => {
    try { l() } catch (_) { /* ignore */ }
  })
}

function rebuildImageMaps() {
  imgById.clear()
  imgByName.clear()
  nameById.clear()
  for (const s of schemes) {
    if (!s) continue
    if (s.id != null && s.name) nameById.set(Number(s.id), s.name)
    if (!s.backgroundImage) continue
    if (s.id != null) imgById.set(Number(s.id), s.backgroundImage)
    if (s.name) imgByName.set(String(s.name).toLowerCase().trim(), s.backgroundImage)
    if (s.fullName) imgByName.set(String(s.fullName).toLowerCase().trim(), s.backgroundImage)
  }
}

export async function loadSchemes(force = false) {
  if (loading) return
  if (loaded && !force) return
  loading = true
  try {
    const res = await chat.getSchemes()
    const list = res && Array.isArray(res.schemes) ? res.schemes : (Array.isArray(res) ? res : [])
    if (Array.isArray(list) && list.length) {
      schemes = list
      loaded = true
      rebuildImageMaps()
      emit()
    }
  } catch (_) {
    // keep static fallback on failure
  } finally {
    loading = false
  }
}

// Kick off the fetch as soon as this module is imported anywhere.
loadSchemes()

function subscribe(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
function getSnapshot() {
  return schemes
}

/** Returns the raw dynamic scheme docs (empty array until loaded). */
export function useSchemes() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function getDynamicSchemeImageById(id) {
  if (id == null) return null
  return imgById.get(Number(id)) || null
}

export function getDynamicSchemeImageByName(name) {
  if (!name) return null
  const lower = String(name).toLowerCase().trim()
  if (imgByName.has(lower)) return imgByName.get(lower)
  for (const [k, v] of imgByName) {
    if (lower.includes(k) || k.includes(lower)) return v
  }
  return null
}

/** Resolve a scheme's display name from its numeric id (dynamic catalog). */
export function getDynamicSchemeNameById(id) {
  if (id == null) return null
  return nameById.get(Number(id)) || null
}

// ── Tamil sub-object (only when the scheme carries any Tamil content) ──
function buildTa(s) {
  const ta = {
    category: s.cluster_ta || '',
    title: s.fullName_ta || s.name_ta || '',
    overview: s.overview_ta || '',
    eligibility: s.eligibility_ta || '',
    highlight: s.highlight_ta || '',
    tags: Array.isArray(s.tags_ta) ? s.tags_ta : [],
    documents: Array.isArray(s.documents_ta) ? s.documents_ta : [],
  }
  const hasAny = ta.category || ta.title || ta.overview || ta.eligibility || ta.highlight || ta.tags.length || ta.documents.length
  return hasAny ? ta : undefined
}

// ── Shape adapters (DB doc -> each consumer's expected shape) ──
export function adaptToConstantsShape(s) {
  return {
    id: s.id,
    order: s.order != null ? s.order : s.id,
    name: s.name,
    fullTitle: s.fullName || s.name,
    fullName: s.fullName || s.name,
    cluster: s.cluster || '',
    clusterShort: s.clusterShort || '',
    benefit: s.benefit || '',
    icon: s.icon || '',
    description: s.overview || s.benefit || '',
  }
}

export function adaptToNtShape(s) {
  return {
    id: s.id,
    order: s.order != null ? s.order : s.id,
    cluster: s.clusterShort || s.cluster || '',
    icon: s.icon || '',
    name_en: s.fullName || s.name || '',
    benefit_en: s.benefit || '',
    overview: s.overview || '',
    eligibility: s.eligibility || '',
    how_to_apply: s.howToApply || '',
    link: s.link || '',
    _ta: buildTa(s),
  }
}

export function adaptToSchemesShape(s) {
  return {
    id: s.id,
    order: s.order != null ? s.order : s.id,
    category: s.cluster || '',
    title: s.fullName || s.name || '',
    highlight: s.highlight || '',
    link: s.link || '',
    overview: s.overview || '',
    tags: Array.isArray(s.tags) ? s.tags : [],
    eligibility: s.eligibility || '',
    documents: Array.isArray(s.documents) ? s.documents : [],
    steps: Array.isArray(s.steps) ? s.steps : [],
    _ta: buildTa(s),
  }
}

function stripEmpty(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    if (typeof v === 'string' && v.trim() === '') continue
    if (Array.isArray(v) && v.length === 0) continue
    out[k] = v
  }
  return out
}

function mergeById(staticArr, dynAdaptedArr) {
  const map = new Map()
  for (const s of staticArr || []) map.set(Number(s.id), { ...s })
  for (const d of dynAdaptedArr || []) {
    const id = Number(d.id)
    const prev = map.get(id) || {}
    map.set(id, { ...prev, ...stripEmpty(d) })
  }
  return [...map.values()].sort((a, b) => {
    const oa = a.order != null ? a.order : (a.id != null ? a.id : 0)
    const ob = b.order != null ? b.order : (b.id != null ? b.id : 0)
    return oa - ob
  })
}

/**
 * Merge a consumer's static base with the dynamic catalog (adapted to the
 * consumer's shape), keyed by id. Falls back to the static base until loaded.
 */
export function useMergedSchemes(staticBase, adapter) {
  const raw = useSchemes()
  return useMemo(() => {
    if (!raw || !raw.length) return staticBase
    return mergeById(staticBase, raw.map(adapter))
  }, [raw, staticBase, adapter])
}

/** Constants-shaped scheme list (static base + dynamic overrides/additions). */
export function useBjpSchemes() {
  return useMergedSchemes(STATIC_BJP_SCHEMES, adaptToConstantsShape)
}

/**
 * Merge the full scheme catalog with server-side application counts
 * (schemePopularity). Returns one card per scheme — including newly added
 * schemes and those with zero applications — sorted by count (desc).
 * Application counts are keyed by scheme name OR numeric id (the chatbot stores
 * schemeName as the numeric id string), so we match on both.
 */
export function buildSchemeCards(schemes, schemePopularity) {
  const popMap = {}
  ;(schemePopularity || []).forEach((p) => {
    if (!p) return
    const key = String(p._id == null ? '' : p._id).toLowerCase().trim()
    if (key) popMap[key] = (popMap[key] || 0) + Number(p.count || 0)
  })
  return (schemes || [])
    .map((s) => {
      const byName = popMap[String(s.name || '').toLowerCase().trim()] || 0
      const byId = popMap[String(s.id)] || 0
      return { _id: s.name, count: byName + byId, cluster: s.cluster, scheme: s }
    })
    .sort((a, b) => b.count - a.count)
}
