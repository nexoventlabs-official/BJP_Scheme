import React, { createContext, useContext, useState } from 'react'
import { ta, schemesTa } from './translations'

function interpolate(str, params) {
  if (!params || typeof str !== 'string') return str
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m))
}

const LanguageContext = createContext({
  lang: 'ta',
  setLang: () => {},
  t: (s) => s,
  getSchemeData: (scheme) => scheme
})

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem('bjp_lang') || 'ta'
    } catch {
      return 'ta'
    }
  })

  const setLang = (newLang) => {
    setLangState(newLang)
    try {
      localStorage.setItem('bjp_lang', newLang)
    } catch {}
  }

  const t = (enStr, params) => {
    if (!enStr) return ''
    let translated = enStr
    if (lang === 'ta' && ta && ta[enStr]) {
      translated = ta[enStr]
    }
    return interpolate(translated, params)
  }

  const getSchemeData = (scheme) => {
    if (!scheme) return scheme
    if (lang === 'ta') {
      // Prefer the scheme's own embedded Tamil (from the DB — the source of
      // truth, correctly matched by id). Only fall back to the legacy static
      // Tamil map if a scheme carries no Tamil of its own.
      const taData = scheme._ta || (schemesTa && schemesTa[scheme.id])
      if (taData) {
        return {
          ...scheme,
          category: taData.category || scheme.category,
          title: taData.title || scheme.title,
          overview: taData.overview || scheme.overview,
          eligibility: taData.eligibility || scheme.eligibility,
          highlight: taData.highlight || scheme.highlight,
          tags: taData.tags && taData.tags.length ? taData.tags : scheme.tags,
          documents: taData.documents && taData.documents.length ? taData.documents : scheme.documents,
        }
      }
    }
    return scheme
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, getSchemeData }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLang() {
  return useContext(LanguageContext)
}
