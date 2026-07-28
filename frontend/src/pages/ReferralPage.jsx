import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

export default function ReferralPage() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    // This component is rendered directly for any /r/... path (NOT inside a
    // <Route path="/r/:ntCode">), so useParams() would be empty. Extract the
    // referral code straight from the pathname instead: /r/<CODE>
    const raw = location.pathname.replace(/^\/+r\/+/i, '').split(/[/?#]/)[0]
    const cleanNt = decodeURIComponent(raw || '').trim().toUpperCase()

    if (cleanNt) {
      try {
        localStorage.setItem('bjp_referral', JSON.stringify({
          ntCode: cleanNt,
          timestamp: Date.now(),
        }))
      } catch {}
      navigate(`/?ref=${encodeURIComponent(cleanNt)}`, { replace: true })
    } else {
      navigate('/', { replace: true })
    }
  }, [location, navigate])

  return null
}
