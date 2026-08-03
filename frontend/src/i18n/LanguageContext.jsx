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
    if (lang === 'ta' && schemesTa && schemesTa[scheme.id]) {
      const taData = schemesTa[scheme.id]
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
