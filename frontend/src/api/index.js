import axios from 'axios'

const api = axios.create({
  // Support VITE_API_URL env var for pointing at staging/production API.
  // Falls back to same-origin (empty string) when not set — works when
  // frontend and backend are co-served.
  baseURL: import.meta.env.VITE_API_URL || '',
  withCredentials: true,
  timeout: 30000,
})

// ── CSRF token handling for admin mutating requests (FIX-08) ──────
let _csrfToken = null
async function ensureCsrfToken() {
  if (_csrfToken) return _csrfToken
  const base = import.meta.env.VITE_API_URL || ''
  const res = await axios.get(base + '/admin/api/csrf-token', { withCredentials: true })
  _csrfToken = res.data && res.data.csrfToken ? res.data.csrfToken : null
  return _csrfToken
}

api.interceptors.request.use(async (cfg) => {
  const url = cfg.url || ''
  const method = (cfg.method || 'get').toLowerCase()
  const mutating = ['post', 'put', 'patch', 'delete'].includes(method)
  // Admin login endpoints (login/send-otp/verify-otp) run pre-auth and are
  // CSRF-exempt on the server — don't try to attach a token to them.
  const isAdminAuthRoute = url.includes('/admin/api/login') ||
                           url.includes('/admin/api/send-otp') ||
                           url.includes('/admin/api/verify-otp')
  if (mutating && url.startsWith('/admin/api') && !isAdminAuthRoute) {
    try {
      const token = await ensureCsrfToken()
      if (token) {
        cfg.headers = cfg.headers || {}
        cfg.headers['x-csrf-token'] = token
      }
    } catch (_) { /* proceed; server will 403 if token is required */ }
  }
  return cfg
})

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response) {
      // Stale/invalid CSRF token → drop the cache so the next attempt refetches
      if (error.response.status === 403) _csrfToken = null
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

  logout: () =>
    api.post('/api/logout'),
}

export const admin = {
  // OTP-based admin login (restricted to whitelisted mobile numbers)
  sendOtp: (mobile) =>
    api.post('/admin/api/send-otp', { mobile }),

  verifyOtp: (mobile, otp) =>
    api.post('/admin/api/verify-otp', { mobile, otp }),

  logout: () =>
    api.post('/admin/api/logout'),

  // Lightweight session check — use instead of getStats() for auth probe
  getSession: () =>
    api.get('/admin/api/session'),

  getStats: () =>
    api.get('/admin/api/stats'),

  getVoters: (params) =>
    api.get('/admin/api/voters', { params }),

  getVoterDetail: (epicNo) =>
    api.get(`/admin/api/voters/${epicNo}`),

  getReports: (params) =>
    api.get('/admin/api/reports', { params }),
}

export const publicApi = {
  verifyVoter: (epicNo) =>
    api.get(`/api/verify/${epicNo}`),

  getCardData: (id) =>
    api.get(`/api/profile/${id}`),
}
