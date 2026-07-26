import { createContext, useContext } from 'react'

function interpolate(str, params) {
  if (!params) return str
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m))
}

const LanguageContext = createContext({
  lang: 'en',
  setLang: () => {},
  t: (s) => s,
})

export function LanguageProvider({ children }) {
  const t = (en, params) => interpolate(en, params)

  return (
    <LanguageContext.Provider value={{ lang: 'en', setLang: () => {}, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLang() {
  return useContext(LanguageContext)
}
