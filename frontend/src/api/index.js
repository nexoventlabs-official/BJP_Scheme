import axios from 'axios'

const api = axios.create({
  // Support VITE_API_URL env var for pointing at staging/production API.
  // Falls back to same-origin (empty string) when not set — works when
  // frontend and backend are co-served.
  baseURL: import.meta.env.VITE_API_URL || '',
  withCredentials: true,
  timeout: 30000,
})

api.interceptors.request.use((cfg) => {
  // Attach the logged-in member's JWT so protected endpoints (profile,
  // my-members, member-status, register-schemes) can authenticate the user.
  try {
    const userToken = localStorage.getItem('bjp_user_token')
    if (userToken) {
      if (typeof cfg.headers?.set === 'function') {
        cfg.headers.set('Authorization', `Bearer ${userToken}`)
      } else {
        cfg.headers = cfg.headers || {}
        cfg.headers.Authorization = `Bearer ${userToken}`
      }
    }
  } catch (_) { /* ignore storage errors */ }
  return cfg
})

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response) {
      // ONLY trigger session revocation when backend explicitly signals SESSION_REVOKED
      // (e.g. user logged in on another device). Do NOT clear storage on standard 401s or missing tokens on page load.
      const isSessionRevoked = error.response.data?.code === 'SESSION_REVOKED'
      if (isSessionRevoked) {
        try {
          const reqAuth = error.config?.headers?.['Authorization'] || error.config?.headers?.['authorization'] || ''
          const failedToken = String(reqAuth).replace(/^Bearer\s+/i, '').trim()
          const currentToken = String(localStorage.getItem('bjp_user_token') || '').trim()

          // Only clear localStorage if the failed token is STILL the current token.
          // If a new login occurred and updated localStorage with a fresh token, preserve it!
          if (!failedToken || !currentToken || failedToken === currentToken) {
            localStorage.removeItem('bjp_user_token')
            localStorage.removeItem('bjp_card_cache')
            localStorage.removeItem('bjp_user_card')
            localStorage.removeItem('bjp_user_epic')
            localStorage.removeItem('bjp_user_mobile')
            localStorage.removeItem('bjp_user_profile')
            localStorage.removeItem('bjp_app_cache_v2')
            sessionStorage.clear()
          }
        } catch (_) {}
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('bjp_session_revoked', { detail: error.response.data }))
        }
      }
      return Promise.reject(error.response.data || { message: 'Server error' })
    }
    if (error.code === 'ECONNABORTED') {
      return Promise.reject({ message: 'Request timed out. Please try again.' })
    }
    return Promise.reject({ message: 'Network error. Please check your connection.' })
  }
)

export const chat = {
  sendOtp: (mobile) =>
    api.post('/api/send-otp', { mobile }),

  verifyOtp: (mobile, otp) =>
    api.post('/api/verify-otp', { mobile, otp }),

  checkMobile: (mobile) =>
    api.post('/api/check-mobile', { mobile }),

  validateEpic: (epicNo, mobile) =>
    api.post('/api/validate-epic', { epic_no: epicNo, mobile }),

  profile: (epicNo, mobile) =>
    api.get(`/api/profile/${epicNo}`, { params: { mobile } }),

  getReferralLink: (ntCode) =>
    api.get(`/api/referral-link/${ntCode}`),

  getMyMembers: (ntCode) =>
    api.get(`/api/my-members/${ntCode}`),

  getMyReferrals: (ntCode) =>
    api.get(`/api/my-members/${ntCode}`),

  getMemberStatus: (ntCode) =>
    api.get(`/api/member-status/${ntCode}`),

  registerSchemes: (data) =>
    api.post('/api/register-schemes', data),

  applyBoothPresident: (data) =>
    api.post('/api/booth-president/apply', data),

  getMyBoothPresidentStatus: () =>
    api.get('/api/booth-president/my-status'),

  getPublicJurisdictions: () =>
    api.get('/api/booth-president/jurisdictions'),
}
