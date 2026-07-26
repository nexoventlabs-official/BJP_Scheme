import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

export default function ReferralPage() {
  const { ntCode } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    if (ntCode) {
      const cleanNt = ntCode.trim().toUpperCase()
      try {
        localStorage.setItem('bjp_referral', JSON.stringify({
          ntCode: cleanNt,
          timestamp: Date.now(),
        }))
      } catch {}
      navigate(`/?ref=${cleanNt}`, { replace: true })
    } else {
      navigate('/', { replace: true })
    }
  }, [ntCode, navigate])

  return null
}
