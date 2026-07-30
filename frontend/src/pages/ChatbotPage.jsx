import React, { useState, useEffect, useRef, useCallback } from 'react'
import QRCode from 'qrcode'
import { useNavigate } from 'react-router-dom'
import { chat } from '../api'
import '../styles/chatbot.css'
import { useLang } from '../i18n/LanguageContext'
import { getSchemeBgImage } from '../components/MemberProfileTimelineView'

// ── Scheme application status → colour + icon metadata (tracking timeline) ──
const SCHEME_STATUS_META = {
  Pending:       { fg: '#e0a106', border: 'rgba(224,161,6,0.4)',  tint: 'rgba(224,161,6,0.05)',  icon: 'bi-hourglass-split' },
  Submitted:     { fg: '#e0a106', border: 'rgba(224,161,6,0.4)',  tint: 'rgba(224,161,6,0.05)',  icon: 'bi-inbox-fill' },
  Processing:    { fg: '#2b6cb0', border: 'rgba(43,108,176,0.4)', tint: 'rgba(43,108,176,0.05)', icon: 'bi-gear-fill' },
  'In Progress': { fg: '#2b6cb0', border: 'rgba(43,108,176,0.4)', tint: 'rgba(43,108,176,0.05)', icon: 'bi-gear-fill' },
  Called:        { fg: '#2b6cb0', border: 'rgba(43,108,176,0.4)', tint: 'rgba(43,108,176,0.05)', icon: 'bi-telephone-fill' },
  Verified:      { fg: '#8e44ad', border: 'rgba(142,68,173,0.4)', tint: 'rgba(142,68,173,0.05)', icon: 'bi-patch-check-fill' },
  Approved:      { fg: '#27ae60', border: 'rgba(39,174,96,0.4)',  tint: 'rgba(39,174,96,0.05)',  icon: 'bi-check-circle-fill' },
  Completed:     { fg: '#27ae60', border: 'rgba(39,174,96,0.4)',  tint: 'rgba(39,174,96,0.05)',  icon: 'bi-trophy-fill' },
  Rejected:      { fg: '#e53935', border: 'rgba(229,57,53,0.4)',  tint: 'rgba(229,57,53,0.05)',  icon: 'bi-x-circle-fill' },
}
const statusColor = (s) => SCHEME_STATUS_META[s] || SCHEME_STATUS_META.Submitted
const fmtDateTime = (d) => {
  if (!d) return ''
  try {
    return new Date(d).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    })
  } catch { return '' }
}

// ── Always produce a frontend referral link (never the backend origin) ──
const toFrontendReferralLink = (rawLink, bjpCode) => {
  let code = bjpCode;
  if (!code && rawLink && typeof rawLink === 'string') {
    const match = rawLink.match(/\/r\/([^\/\?#]+)/);
    if (match) code = match[1];
  }
  if (code) return `${window.location.origin}/r/${code}`;
  return rawLink || '';
};

// ── Read referral params from landing URL (?ref=NT-XXXX)
const getReferralParams = () => {
  try {
    const p = new URLSearchParams(window.location.search)
    const ref = (p.get('ref') || '').trim().toUpperCase()
    if (/^(?:NT-[0-9A-Z]{4,16}|BJP-[0-9A-Z]+-[0-9A-Z]+)$/.test(ref)) {
      return { ref }
    }
    // localStorage fallback — valid for 24 hours
    const stored = localStorage.getItem('bjp_referral')
    if (stored) {
      const data = JSON.parse(stored)
      if (data && Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
        const storedRef = (data.ntCode || '').trim().toUpperCase()
        if (/^(?:NT-[0-9A-Z]{4,16}|BJP-[0-9A-Z]+-[0-9A-Z]+)$/.test(storedRef)) {
          return { ref: storedRef }
        }
      }
    }
  } catch { /* ignore */ }
  return { ref: '' }
}

// ── True only when a valid NT referral is present in the CURRENT URL.
// (No localStorage fallback — prevents false "already a member" warning on plain revisits.)
const hasReferralInUrl = () => {
  try {
    const p = new URLSearchParams(window.location.search)
    const ref = (p.get('ref') || '').trim().toUpperCase()
    return /^(?:NT-[0-9A-Z]{4,16}|BJP-[0-9A-Z]+-[0-9A-Z]+)$/.test(ref)
  } catch {
    return false
  }
}

// ── Constants ──────────────────────────────────────────────
const S = {
  WELCOME:        'WELCOME',
  AWAIT_MOBILE:   'AWAIT_MOBILE',
  AWAIT_OTP:      'AWAIT_OTP',
  AWAIT_EPIC:     'AWAIT_EPIC',
  CONFIRM:        'CONFIRM',
  SELECT_SCHEMES: 'SELECT_SCHEMES',
  DONE:           'DONE',
}

const CACHE_KEY = 'bjp_card_cache'
// Rolling 30-minute session: the cached login is valid for 30 min from the LAST
// activity. Every user action refreshes `timestamp` (see touchCache), so an
// active member stays logged in; 30 min of inactivity expires it (auto-logout).
const CACHE_TTL = 30 * 60 * 1000   // 30 minutes

const getCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (Date.now() - data.timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY)
      return null
    }
    return data
  } catch { return null }
}

const saveCache = (card, profile) =>
  localStorage.setItem(CACHE_KEY, JSON.stringify({ card, profile, timestamp: Date.now() }))

// Refresh the last-active timestamp (sliding expiry) without touching the data.
const touchCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    data.timestamp = Date.now()
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch { /* ignore */ }
}

const clearCache = () => {
  localStorage.removeItem(CACHE_KEY)
  localStorage.removeItem('bjp_user_token')
}

const maskMobile = (m) => m ? m.slice(0, 5) + 'XXXXX' : ''

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const fmtTime = (d) =>
  d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''

const getActiveStep = (chatState) => {
  switch (chatState) {
    case 'WELCOME':
    case 'AWAIT_MOBILE':
      return 1
    case 'AWAIT_EPIC':
    case 'CONFIRM':
      return 2
    case 'SELECT_SCHEMES':
      return 3
    case 'DONE':
      return 4
    default:
      return 1
  }
}

// ── Message renderers ───────────────────────────────────────
function WelcomeBannerMsg({ onStart }) {
  const { t } = useLang()
  return (
    <div className="welcome-banner">
      <img src="/banner.png" alt="BJP Tamil Nadu" className="banner-img"
        loading="lazy"
        onError={(e) => { e.target.style.display = 'none' }} />
      <div className="banner-content">
        <h2>{t("World's Largest. India's Biggest. Soon to be Tamil Nadu's No. 1.")}</h2>
        <p>{t("You are joining the world's leading political organization. Click below to register for Central Government welfare schemes.")}</p>
        <button className="btn-start" onClick={onStart}>
          <i className="bi bi-play-circle-fill" /> {t('Start')}
        </button>
      </div>
    </div>
  )
}

function VoterCardMsg({ voter, isLatest, chatState, onConfirm, onRetry, disabled }) {
  const { t } = useLang()
  const v = voter || {}
  const rows = [
    { label: 'Name',         value: v.name || v.Name || v.voter_name },
    { label: "Father's Name", value: v.father_name || v.FatherName || v.RelationName },
    { label: 'EPIC No',       value: v.epic_no || v.EpicNo || v.EPIC_NO },
    { label: 'Age / Gender',  value: [v.age || v.Age, v.gender || v.Gender].filter(Boolean).join(' / ') || undefined },
    { label: 'Assembly',      value: v.assembly || v.AssemblyName || v.assembly_name },
    { label: 'District',      value: v.district || v.DistrictName || v.district_name },
    { label: 'Part No',       value: v.part_no || v.PartNo },
    { label: 'Serial No',     value: v.serial_no || v.SlNo },
  ].filter((r) => r.value)

  const showButtons = isLatest && chatState === 'CONFIRM'

  return (
    <div className="voter-details-card">
      <div className="vdc-header">
        <i className="bi bi-person-badge" /> {t('Voter Details')}
      </div>
      <div className="vdc-body">
        {rows.map((r) => (
          <div className="vdc-row" key={r.label}>
            <span className="vdc-label">{t(r.label)}</span>
            <span className="vdc-value">{r.value}</span>
          </div>
        ))}
      </div>
      {showButtons && (
        <div className="interactive-buttons">
          <button className="interactive-btn" onClick={onConfirm} disabled={disabled}>
            <i className="bi bi-check-circle-fill" /> {t('Confirm Details')}
          </button>
          <button className="interactive-btn" onClick={onRetry} disabled={disabled} style={{ color: '#d32f2f' }}>
            <i className="bi bi-arrow-counterclockwise" /> {t('Re-enter ID')}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Referral Link Message ────────────────────────────────────
function FullReferralPanel({ link, onBack }) {
  const { t } = useLang()
  const canvasRef = useRef(null)
  const [copied, setCopied] = useState(false)
  const [qrReady, setQrReady] = useState(false)

  useEffect(() => {
    if (!link || !canvasRef.current) return
    const canvas = canvasRef.current
    const size = 280
    QRCode.toCanvas(canvas, link, {
      width: size,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'H'
    }, (err) => {
      if (err) return
      // Overlay BJP logo in center
      const ctx = canvas.getContext('2d')
      const img = new Image()
      img.src = '/bjp_logo.svg'
      img.onload = () => {
        const logoSize = size * 0.22
        const logoX = (size - logoSize) / 2
        const logoY = (size - logoSize) / 2
        // White background circle
        ctx.save()
        ctx.beginPath()
        ctx.arc(size / 2, size / 2, logoSize * 0.62, 0, Math.PI * 2)
        ctx.fillStyle = '#ffffff'
        ctx.fill()
        ctx.restore()
        ctx.drawImage(img, logoX, logoY, logoSize, logoSize)
        setQrReady(true)
      }
      img.onerror = () => setQrReady(true)
    })
  }, [link])

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(link).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleShareWhatsApp = () => {
    if (!link || !canvasRef.current) return
    // WhatsApp bold markdown: *text*
    const shareText = `${t('*🪷 Join BJP Tamil Nadu!*')}\n\n${t('*Generate your free Digital Member ID Card here:*')}\n${link}`
    // Try Web Share API (mobile) — sends QR image + text as a single share
    if (navigator.canShare && canvasRef.current) {
      canvasRef.current.toBlob((blob) => {
        const file = new File([blob], 'bjp-referral-qr.png', { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          navigator.share({
            title: t('🪷 Join BJP Tamil Nadu!'),
            text: shareText,
            files: [file]
          }).catch(() => {
            // Fallback: open WhatsApp text-only
            window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank')
          })
          return
        }
        // Device supports share but not file share — text only
        window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank')
      }, 'image/png', 1.0)
    } else {
      // Desktop fallback — open WhatsApp with text+link
      window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank')
    }
  }

  const handleDownloadQR = () => {
    if (!canvasRef.current) return
    const filename = 'bjp-referral-qr.png'
    canvasRef.current.toBlob((blob) => {
      if (!blob) return
      const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      if (isIOS) {
        // WebKit ignores <a download> — share (Save to Photos) or open for long-press save
        const file = new File([blob], filename, { type: 'image/png' })
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: 'BJP Referral QR' }).catch((e) => {
            if (e && e.name === 'AbortError') return
            const u = URL.createObjectURL(blob)
            window.open(u, '_blank')
            setTimeout(() => URL.revokeObjectURL(u), 15000)
          })
          return
        }
        const u = URL.createObjectURL(blob)
        window.open(u, '_blank')
        setTimeout(() => URL.revokeObjectURL(u), 15000)
        return
      }
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'image/png', 1.0)
  }

  return (
    <div className="chatbot-container brochure-panel">
      <header className="brochure-header">
        <div className="brochure-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', color: 'var(--color-ash)', cursor: 'pointer', padding: '4px 8px 4px 0', fontSize: '18px', display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-chalk)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-ash)'}
            aria-label="Back"
          >
            <i className="bi bi-chevron-left" />
          </button>
          <i className="bi bi-link-45deg brochure-title-orange" />
          <span>{t('Referral Link')}</span>
        </div>
      </header>

      <div className="brochure-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '24px 20px', gap: 20 }}>
        {link ? (
          <>
            {/* QR Code Canvas */}
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <div style={{
                background: '#fff',
                borderRadius: 16,
                padding: 12,
                boxShadow: '0 4px 24px rgba(0,0,0,0.13)',
                display: 'inline-block'
              }}>
                <canvas ref={canvasRef} style={{ display: 'block', borderRadius: 8 }} />
              </div>
              {!qrReady && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 28, height: 28, border: '3px solid rgba(242,101,34,0.2)', borderTopColor: '#f26522', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                </div>
              )}
            </div>

            {/* Caption */}
            <p style={{ fontSize: 13, color: 'var(--color-ash)', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
              <i className="bi bi-qr-code me-1" style={{ color: '#f26522' }} />
              {t('Scan this QR to join BJP Tamil Nadu')}
            </p>

            {/* Link Box */}
            <div style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 12,
              color: 'var(--color-chalk)',
              wordBreak: 'break-all',
              width: '100%',
              maxWidth: 320,
              textAlign: 'center'
            }}>
              {link}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 320 }}>
              <button
                onClick={handleCopyLink}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: copied ? 'rgba(46,204,113,0.15)' : 'rgba(255,255,255,0.07)', color: copied ? '#2ecc71' : 'var(--color-chalk)', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
              >
                <i className={`bi bi-${copied ? 'check-lg' : 'clipboard'}`} />
                {copied ? t('Copied!') : t('Copy Link')}
              </button>
              <button
                onClick={handleShareWhatsApp}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 10, border: 'none', background: '#25d366', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                <i className="bi bi-whatsapp" /> {t('Share on WhatsApp')}
              </button>
              <button
                onClick={handleDownloadQR}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 10, border: '1px solid rgba(242,101,34,0.4)', background: 'rgba(242,101,34,0.08)', color: '#f26522', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                <i className="bi bi-download" /> {t('Download QR Code')}
              </button>
            </div>

            <p style={{ fontSize: 12, color: 'var(--color-ash)', textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
              <i className="bi bi-people-fill" style={{ color: '#f26522', marginRight: 4 }} />
              <span dangerouslySetInnerHTML={{ __html: t('Everyone who joins via your link or QR appears in your *My Members* list.').replace(/\*(.*?)\*/g, '<strong style="color: var(--color-chalk)">$1</strong>') }} />
            </p>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-ash)', fontSize: 13 }}>
            <i className="bi bi-exclamation-circle me-2" /> {t('No referral link available.')}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 23 Central Government Schemes (Nalam Thittam) ──────────
const NT_SCHEMES = [
  {
    id: 1, cluster: 'Insurance', icon: '🛡️',
    name_en: 'PMSBY — Suraksha Bima Yojana',
    benefit_en: '₹2 lakh accident insurance at ₹20/year',
    overview: 'Accidental death and disability cover of ₹2 lakh at a premium of just ₹20/year, auto-debited from your savings account every June.',
    eligibility: 'Indian citizens aged 18–70 with an active savings bank account linked to Aadhaar.',
    how_to_apply: 'Visit your bank branch or enable via net banking / banking app. Annual premium of ₹20 is auto-debited.',
    link: 'https://jansuraksha.gov.in',
  },
  {
    id: 2, cluster: 'Insurance', icon: '❤️',
    name_en: 'PMJJBY — Jeevan Jyoti Bima',
    benefit_en: '₹2 lakh life insurance at ₹436/year',
    overview: 'Life insurance of ₹2 lakh on death from any cause at ₹436/year premium, auto-debited from your bank account. Renewable annually.',
    eligibility: 'Indian citizens aged 18–50 with an active savings bank account. Cover continues until age 55.',
    how_to_apply: 'Enroll at your bank branch or banking app. Premium is auto-debited each June. Nomination can be updated anytime.',
    link: 'https://jansuraksha.gov.in',
  },
  {
    id: 3, cluster: 'Insurance', icon: '👴',
    name_en: 'APY — Atal Pension Yojana',
    benefit_en: 'Pension ₹1,000–₹5,000/month after age 60',
    overview: 'Guaranteed monthly pension of ₹1,000 to ₹5,000 after age 60. The government co-contributes 50% (up to ₹1,000/year) for eligible subscribers.',
    eligibility: 'Indian citizens aged 18–40 with a savings bank account. Not already covered under statutory pension schemes.',
    how_to_apply: 'Open an APY account at your bank. Choose your desired monthly pension and the system calculates your contribution automatically.',
    link: 'https://npscra.nsdl.co.in/scheme-details.php',
  },
  {
    id: 4, cluster: 'Credit', icon: '🛒',
    name_en: 'PM SVANidhi — Street Vendor Loan',
    benefit_en: 'Collateral-free loan ₹10,000–₹50,000',
    overview: 'Collateral-free working capital loans for street vendors — ₹10,000 initially, scaling up to ₹50,000 on timely repayment. 7% interest subsidy available.',
    eligibility: 'Street vendors operating in urban areas with a Vending Certificate or letter of recommendation from the Urban Local Body (ULB).',
    how_to_apply: 'Apply at pmsvanidhi.mohua.gov.in or visit any bank / MFI branch. Vending certificate or ULB recommendation required.',
    link: 'https://pmsvanidhi.mohua.gov.in',
  },
  {
    id: 5, cluster: 'Credit', icon: '💼',
    name_en: 'PM Mudra Shishu',
    benefit_en: 'Business loan up to ₹50,000',
    overview: 'Micro-business loans up to ₹50,000 for non-farm small enterprises — no collateral required. Covers manufacturing, trading, and service sectors.',
    eligibility: 'Non-corporate, non-farm small or micro-enterprises. Open to new and existing businesses seeking startup or expansion capital.',
    how_to_apply: 'Apply at any bank, MFI, or NBFC with a simple business plan and identity/address proof. Loans typically processed within 7–10 days.',
    link: 'https://www.mudra.org.in',
  },
  {
    id: 6, cluster: 'Credit', icon: '📈',
    name_en: 'PM Mudra Kishor',
    benefit_en: 'Business loan ₹50,000–₹5 lakh',
    overview: 'Business expansion loans from ₹50,000 to ₹5 lakh for small enterprises with a proven track record. No collateral required.',
    eligibility: 'Existing micro-enterprise owners with proof of at least 1 year of business activity. Any sector — manufacturing, trading, services.',
    how_to_apply: 'Apply at your nearest bank or NBFC with last 6 months bank statements and existing business proof.',
    link: 'https://www.mudra.org.in',
  },
  {
    id: 7, cluster: 'Credit', icon: '🏭',
    name_en: 'Udyam Registration',
    benefit_en: 'Free MSME registration — all govt benefits',
    overview: 'Free online MSME registration that unlocks government subsidies, priority loans, tax benefits, and preferential treatment in government tenders.',
    eligibility: 'Any business with annual turnover below ₹250 crore — manufacturing or service sector, sole proprietor to private limited.',
    how_to_apply: 'Register free at udyamregistration.gov.in using Aadhaar and PAN. Certificate issued instantly. No documents to upload.',
    link: 'https://udyamregistration.gov.in',
  },
  {
    id: 8, cluster: 'Credit', icon: '💪',
    name_en: 'Stand Up India',
    benefit_en: '₹10 lakh–₹1 crore loan for SC/ST & women',
    overview: 'Bank loans from ₹10 lakh to ₹1 crore to help SC/ST individuals and women entrepreneurs set up greenfield enterprises.',
    eligibility: 'SC/ST individuals or women borrowers above 18 years setting up their first enterprise in manufacturing, services, or trading sectors.',
    how_to_apply: 'Apply online at standupmitra.in or visit the nearest bank branch with a business plan and KYC documents.',
    link: 'https://www.standupmitra.in',
  },
  {
    id: 9, cluster: 'Credit', icon: '🚀',
    name_en: 'Startup India Seed Fund',
    benefit_en: 'Seed funding for registered startups',
    overview: 'Seed funding up to ₹20 lakh for proof-of-concept and up to ₹50 lakh for prototype development — disbursed through DPIIT-recognized incubators.',
    eligibility: 'DPIIT-recognized startups incorporated in India for less than 2 years with a scalable, innovative business model.',
    how_to_apply: 'Obtain DPIIT recognition first at startupindia.gov.in, then apply to empanelled incubators through the Seed Fund portal.',
    link: 'https://seedfund.startupindia.gov.in',
  },
  {
    id: 10, cluster: 'Farmers', icon: '🌾',
    name_en: 'PM Kisan Samman Nidhi',
    benefit_en: '₹6,000/year in 3 instalments to farmers',
    overview: 'Direct income support of ₹6,000/year paid in 3 installments of ₹2,000 directly into farmers\' Aadhaar-linked bank accounts — no middlemen.',
    eligibility: 'All landholding farmer families. Excludes income tax payers, institutional landholders, and certain government employees.',
    how_to_apply: 'Self-register at pmkisan.gov.in or visit the nearest Common Service Centre (CSC) with Aadhaar and land records.',
    link: 'https://pmkisan.gov.in',
  },
  {
    id: 11, cluster: 'Farmers', icon: '🌱',
    name_en: 'PM Fasal Bima Yojana',
    benefit_en: 'Crop insurance — natural calamities & pests',
    overview: 'Subsidized crop insurance protecting farmers from losses due to drought, floods, pests, and disease. Premium is just 1.5%–5% of sum insured.',
    eligibility: 'All farmers — loanee and non-loanee — growing notified crops in notified areas. Enroll before the cut-off date each season.',
    how_to_apply: 'Enroll through your bank (if loanee), nearest CSC, or an insurance company agent before the seasonal cut-off date.',
    link: 'https://pmfby.gov.in',
  },
  {
    id: 12, cluster: 'Farmers', icon: '🚜',
    name_en: 'PM Kisan Maan Dhan Yojana',
    benefit_en: 'Monthly pension for small farmers after age 60',
    overview: 'Voluntary pension scheme giving small and marginal farmers a guaranteed monthly pension of ₹3,000 after age 60. Government matches your contribution.',
    eligibility: 'Small and marginal farmers aged 18–40 with landholding up to 2 hectares. Must not already receive other statutory pensions.',
    how_to_apply: 'Enroll at the nearest CSC or Krishi Bhawan with Aadhaar, bank passbook, and land records. Monthly contribution is small and income-matched.',
    link: 'https://pmkmy.gov.in',
  },
  {
    id: 13, cluster: 'Health', icon: '🏥',
    name_en: 'Ayushman Bharat PMJAY',
    benefit_en: '₹5 lakh/year cashless hospitalisation',
    overview: '₹5 lakh per family per year cashless health cover for secondary and tertiary hospitalisation at over 25,000 empanelled hospitals nationwide — completely free.',
    eligibility: 'Families listed in SECC 2011 database. Check your eligibility at pmjay.gov.in using your Aadhaar or ration card number.',
    how_to_apply: 'Visit any empanelled hospital with your Aadhaar or beneficiary ID. Ayushman card is issued free at the hospital or CSC.',
    link: 'https://pmjay.gov.in',
  },
  {
    id: 14, cluster: 'Health', icon: '🪪',
    name_en: 'ABHA — Unified Health ID',
    benefit_en: 'Free digital health ID — gateway to all health schemes',
    overview: 'A 14-digit digital health ID that stores all your health records, prescriptions, lab reports, and diagnoses in one secure, shareable place.',
    eligibility: 'All Indian citizens. Completely free. Created using Aadhaar or driving licence — takes under 2 minutes.',
    how_to_apply: 'Create instantly at abha.abdm.gov.in or the Aarogya Setu app using your Aadhaar OTP. No documents needed.',
    link: 'https://abha.abdm.gov.in',
  },
  {
    id: 15, cluster: 'Women', icon: '🔥',
    name_en: 'PM Ujjwala Yojana',
    benefit_en: 'Free LPG connection for BPL families',
    overview: 'Free LPG gas connection to women from Below Poverty Line households — includes a free cylinder, pressure regulator, and connecting pipe.',
    eligibility: 'Women from BPL/SECC households, SC/ST families, Antyodaya Anna Yojana beneficiaries without an existing LPG connection.',
    how_to_apply: 'Apply at the nearest LPG distributor with Aadhaar, BPL ration card or Antyodaya card, and bank account details.',
    link: 'https://www.pmuy.gov.in',
  },
  {
    id: 16, cluster: 'Women', icon: '🤱',
    name_en: 'PM Matru Vandana Yojana',
    benefit_en: '₹5,000 cash assistance for first pregnancy',
    overview: 'Cash incentive of ₹5,000 paid in 3 installments to pregnant and lactating mothers for their first live birth — to compensate for wage loss and improve nutrition.',
    eligibility: 'Pregnant and lactating women aged 19+ registering their first live birth. Excludes those already receiving similar benefits under other schemes.',
    how_to_apply: 'Register at the nearest Anganwadi Centre (AWC) or health facility within 150 days of pregnancy with your mother-child protection card.',
    link: 'https://wcd.nic.in/schemes/pradhan-mantri-matru-vandana-yojana',
  },
  {
    id: 17, cluster: 'Women', icon: '👧',
    name_en: 'Sukanya Samridhi Yojana',
    benefit_en: 'High-interest savings for girl child education',
    overview: 'Government-backed savings scheme at 8.2% p.a. (tax-free) for a girl child\'s future education and marriage. Matures when she turns 21.',
    eligibility: 'Parents or guardians of girl children below 10 years. One account per girl, maximum 2 accounts per family. Minimum deposit ₹250/year.',
    how_to_apply: 'Open an account at any post office or authorised bank with the girl\'s birth certificate and parent/guardian KYC documents.',
    link: 'https://www.nsiindia.gov.in',
  },
  {
    id: 18, cluster: 'Housing', icon: '🏠',
    name_en: 'PM Awas Yojana (PMAY)',
    benefit_en: '₹1.2–₹1.3 lakh to build or upgrade home',
    overview: 'Financial assistance of ₹1.2–₹1.3 lakh to construct a pucca house or upgrade a kutcha/dilapidated house — paid directly into the beneficiary\'s bank account.',
    eligibility: 'Houseless families or those in kutcha/dilapidated houses as per SECC 2011 data (rural) or ULB priority list (urban). Must not own a pucca house.',
    how_to_apply: 'Apply through your Gram Panchayat (rural) or Urban Local Body office (urban). Beneficiaries are selected from the SECC priority list.',
    link: 'https://pmayg.nic.in',
  },
  {
    id: 19, cluster: 'Youth', icon: '🎓',
    name_en: 'PMKVY — Kaushal Vikas Yojana',
    benefit_en: 'Free skill training in 300+ trades',
    overview: 'Free short-term skill training in 300+ job roles across IT, construction, healthcare, hospitality, electronics, and more — with placement support and a government certificate.',
    eligibility: 'Any Indian citizen above 15 years. School/college dropouts and unemployed youth are priority beneficiaries.',
    how_to_apply: 'Enroll at a nearby PMKVY training centre or register at skillindiadigital.gov.in. Training is completely free. Stipend provided during training.',
    link: 'https://www.pmkvyofficial.org',
  },
  {
    id: 20, cluster: 'Youth', icon: '📚',
    name_en: 'NSP — National Scholarship Portal',
    benefit_en: 'Govt scholarships for Class 1 to PhD students',
    overview: 'Single portal for all central government scholarships — covering minority, OBC, SC/ST, merit, and disability categories from Class 1 through PhD.',
    eligibility: 'Students from Class 1 to PhD. Eligibility varies by scheme — based on community, family income, and academic performance.',
    how_to_apply: 'Register at scholarships.gov.in with Aadhaar, bank account, and academic documents. Apply before the annual deadline (typically Oct–Nov).',
    link: 'https://scholarships.gov.in',
  },
  {
    id: 21, cluster: 'Youth', icon: '🔨',
    name_en: 'PM Vishwakarma Yojana',
    benefit_en: 'Training & credit for traditional artisans',
    overview: 'End-to-end support for 18 traditional crafts — free skill training, toolkit grant up to ₹15,000, and collateral-free credit up to ₹3 lakh at 5% interest.',
    eligibility: '18 designated trades including carpenter, blacksmith, goldsmith, potter, tailor, cobbler, mason, and more. Self-employed artisans working with hand tools.',
    how_to_apply: 'Register through your nearest Common Service Centre (CSC) or Gram Panchayat with Aadhaar and a trade declaration form.',
    link: 'https://pmvishwakarma.gov.in',
  },
  {
    id: 22, cluster: 'Foundation', icon: '🏦',
    name_en: 'Jan Dhan Yojana',
    benefit_en: 'Zero-balance bank account — DBT gateway',
    overview: 'Zero-balance savings account with a free RuPay debit card, ₹2 lakh accident insurance cover, and ₹10,000 overdraft facility after 6 months.',
    eligibility: 'Any Indian citizen without an existing bank account. Can be opened at any bank branch or Business Correspondent kiosk with minimal KYC.',
    how_to_apply: 'Visit the nearest bank branch or Business Correspondent kiosk with Aadhaar or voter ID. Account is opened on the spot.',
    link: 'https://pmjdy.gov.in',
  },
  {
    id: 23, cluster: 'Foundation', icon: '👷',
    name_en: 'e-Shram Card',
    benefit_en: 'Unorganised worker registration + PMSBY cover',
    overview: 'National database card for unorganised workers — provides access to all social security schemes and automatic ₹2 lakh accident insurance under PMSBY.',
    eligibility: 'All unorganised sector workers aged 16–59 who are not EPFO/ESIC members — daily wage, gig, domestic, construction, street vendor workers.',
    how_to_apply: 'Self-register at eshram.gov.in or visit the nearest CSC with Aadhaar and a bank account. UAN card is issued within minutes.',
    link: 'https://eshram.gov.in',
  },
]

// ── Scheme Info Modal ─────────────────────────────────────────
function SchemeInfoModal({ scheme, onClose }) {
  if (!scheme) return null
  const name = scheme.name_en.replace(/^[A-Z]+\s*—\s*/, '')

  // Close on overlay click
  const handleOverlay = (e) => { if (e.target === e.currentTarget) onClose() }

  return (
    <div
      onClick={handleOverlay}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0 0 0 0',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 560,
        background: 'var(--color-surface, #1a1a2e)',
        borderRadius: '18px 18px 0 0',
        padding: '0 0 env(safe-area-inset-bottom,0) 0',
        maxHeight: '88vh', overflowY: 'auto',
        boxShadow: '0 -4px 32px rgba(0,0,0,0.4)',
        animation: 'slideUp 0.22s ease-out',
      }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 20px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <span style={{ fontSize: 28 }}>{scheme.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.93)', lineHeight: 1.3 }}>
              {name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-signal-mint, #2ecc71)', marginTop: 2, fontWeight: 600 }}>
              {scheme.cluster}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)', border: 'none',
              color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
              width: 30, height: 30, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, flexShrink: 0,
            }}
            aria-label="Close"
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>

        {/* Benefit pill */}
        <div style={{ padding: '12px 20px 0' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(46,204,113,0.12)',
            border: '1px solid rgba(46,204,113,0.3)',
            borderRadius: 20, padding: '5px 12px',
            fontSize: 12, color: 'var(--color-signal-mint, #2ecc71)', fontWeight: 600,
          }}>
            <i className="bi bi-star-fill" style={{ fontSize: 10 }} />
            {scheme.benefit_en}
          </div>
        </div>

        {/* Body sections */}
        <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* What is it */}
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.45)',
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
            }}>
              What is it?
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>
              {scheme.overview}
            </div>
          </div>

          {/* Who can apply */}
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.45)',
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
            }}>
              Who can apply?
            </div>
            <div style={{
              fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6,
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 8, borderLeft: '3px solid var(--color-signal-mint, #2ecc71)',
            }}>
              {scheme.eligibility}
            </div>
          </div>

          {/* How to apply */}
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.45)',
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
            }}>
              How to apply
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>
              {scheme.how_to_apply}
            </div>
          </div>
        </div>

        {/* Footer CTA */}
        {scheme.link && (
          <div style={{ padding: '0 20px 24px' }}>
            <a
              href={scheme.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '12px',
                background: 'var(--color-signal-mint, #2ecc71)',
                color: '#fff', fontWeight: 700, fontSize: 13,
                borderRadius: 10, textDecoration: 'none',
                boxSizing: 'border-box',
              }}
            >
              <i className="bi bi-box-arrow-up-right" />
              Visit Official Website
            </a>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ── Scheme Selection Message ─────────────────────────────────
function SchemeSelectionMsg({ isLatest, onSubmit, disabled }) {
  const { t } = useLang()
  const [selected, setSelected] = useState(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [infoScheme, setInfoScheme] = useState(null)

  const clusters = [...new Set(NT_SCHEMES.map(s => s.cluster))]

  const toggle = (id) => {
    if (submitted || !isLatest) return
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleSubmit = () => {
    if (selected.size === 0 || submitted || !isLatest) return
    setSubmitted(true)
    onSubmit([...selected])
  }

  return (
    <div style={{ width: '100%' }}>
      {infoScheme && <SchemeInfoModal scheme={infoScheme} onClose={() => setInfoScheme(null)} />}
      {/* Header counter */}
      <div style={{
        fontSize: 12, color: 'var(--color-ash)', marginBottom: 10,
        display: 'flex', alignItems: 'center', gap: 6
      }}>
        <i className="bi bi-check2-square" style={{ color: 'var(--color-signal-mint)' }} />
        {selected.size > 0
          ? <span style={{ color: 'var(--color-signal-mint)', fontWeight: 600 }}>{selected.size} {t('scheme(s) selected')}</span>
          : t('Select one or more schemes you are interested in')}
      </div>

      {clusters.map(cluster => (
        <div key={cluster} style={{ marginBottom: 14 }}>
          {/* Cluster heading — English only */}
          <div style={{
            fontSize: 10, fontWeight: 700, color: 'var(--color-ash)',
            textTransform: 'uppercase', letterSpacing: '0.07em',
            marginBottom: 6, paddingLeft: 7,
            borderLeft: '3px solid var(--color-signal-mint)'
          }}>
            {cluster}
          </div>

          {/* 3-column grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 5
          }}>
            {NT_SCHEMES.filter(s => s.cluster === cluster).map(scheme => {
              const isSelected = selected.has(scheme.id);
              const bgImg = getSchemeBgImage(scheme.name_en);
              return (
                <div
                  key={scheme.id}
                  onClick={() => toggle(scheme.id)}
                  style={{
                    padding: '8px 8px',
                    background: bgImg
                      ? `url("${encodeURI(bgImg)}") center / 100% 100% no-repeat`
                      : (isSelected ? 'rgba(250,93,0,0.08)' : 'var(--color-carbon)'),
                    border: `2px solid ${isSelected ? '#FF9933' : '#e5e5ea'}`,
                    borderRadius: 10,
                    cursor: submitted || !isLatest ? 'default' : 'pointer',
                    transition: 'all 0.18s ease',
                    opacity: submitted && !isSelected ? 0.4 : 1,
                    display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'space-between',
                    minHeight: 90,
                    height: 90,
                    position: 'relative',
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                    boxShadow: isSelected ? '0 4px 12px rgba(255,153,51,0.35)' : '0 2px 6px rgba(0,0,0,0.06)'
                  }}
                >
                  {/* Icon + checkbox row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', zIndex: 2 }}>
                    <span style={{ fontSize: 16, lineHeight: 1, filter: 'drop-shadow(0 1px 2px rgba(255,255,255,0.8))' }}>{scheme.icon}</span>
                    <div style={{
                      width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                      background: isSelected ? '#FF9933' : 'rgba(255, 255, 255, 0.95)',
                      border: `1.5px solid ${isSelected ? '#FF9933' : '#c2c2c7'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                    }}>
                      {isSelected && <i className="bi bi-check-lg" style={{ fontSize: 9, color: '#fff', fontWeight: 800, lineHeight: 1 }} />}
                    </div>
                  </div>
                  {/* Scheme name & Benefit row */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', width: '100%', gap: 2, zIndex: 2 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 10, fontWeight: 700,
                        color: '#1d1d1f',
                        lineHeight: 1.2,
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
                      }}>
                        {scheme.name_en.replace(/^[A-Z0-9\s]+—\s*/, '')}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setInfoScheme(scheme) }}
                      style={{
                        flexShrink: 0, background: 'rgba(255,255,255,0.92)', border: '1px solid #d2d2d7',
                        borderRadius: '50%', width: 18, height: 18,
                        color: '#1d1d1f', cursor: 'pointer',
                        fontSize: 10, lineHeight: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                      }}
                      title="Learn more"
                      aria-label={`Info: ${scheme.name_en}`}
                    >
                      <i className="bi bi-info-circle" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {isLatest && !submitted && (
        <button
          onClick={handleSubmit}
          disabled={selected.size === 0 || disabled}
          style={{
            width: '100%', padding: '13px 20px', marginTop: 6,
            background: selected.size === 0 ? 'rgba(250,93,0,0.25)' : 'var(--color-signal-mint)',
            color: '#fff', border: 'none', borderRadius: 12,
            fontSize: 14, fontWeight: 700,
            cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.2s'
          }}
        >
          <i className="bi bi-check2-circle" />
          {t('Register & Get My Referral Link')}
        </button>
      )}
      {submitted && (
        <div style={{
          textAlign: 'center', color: 'var(--color-ash)',
          fontSize: 12, padding: '10px 0',
          display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center'
        }}>
          <div style={{
            width: 14, height: 14,
            border: '2px solid var(--color-graphite)',
            borderTopColor: 'var(--color-signal-mint)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }} />
          {t('Registering your schemes...')}
        </div>
      )}
    </div>
  )
}

// ── My Schemes Dashboard Panel ──────────────────────────────
function MySchemePanel({ epicNo, mobile, onBack }) {
  const { t } = useLang()
  const [applyStatus, setApplyStatus] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [selectedSchemeForModal, setSelectedSchemeForModal] = useState(null);
  const [isAgreed, setIsAgreed] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notificationToast, setNotificationToast] = useState(null);
  const [appliedAppsMap, setAppliedAppsMap] = useState({}); // schemeId -> application doc (with statusHistory)
  const [trackingScheme, setTrackingScheme] = useState(null); // { scheme, app } when viewing tracking detail

  useEffect(() => {
    const activeEpic = epicNo || localStorage.getItem('bjp_user_epic') || '';
    const activeMobile = mobile || localStorage.getItem('bjp_user_mobile') || '';
    const userKey = activeEpic || activeMobile || 'user';
    const storageKey = `bjp_applied_schemes_${userKey}`;

    let localAppliedMap = {};
    const loadFromStorage = (key) => {
      try {
        const saved = localStorage.getItem(key);
        if (saved) {
          const arr = JSON.parse(saved);
          arr.forEach(item => {
            const s = SCHEMES.find(sch => sch.id === item || sch.title === item);
            if (s) localAppliedMap[s.id] = 'applied';
          });
        }
      } catch (e) {}
    };

    loadFromStorage(storageKey);
    loadFromStorage('bjp_applied_schemes_global');
    setApplyStatus({ ...localAppliedMap });

    if (activeEpic || activeMobile) {
      chat.profile(activeEpic || 'user', activeMobile)
        .then(data => {
          const apps = data.applications || [];
          const updatedMap = { ...localAppliedMap };
          const appsMap = {};
          const titlesList = [];

          apps.forEach(app => {
            const sName = app.schemeName || app.schemeId;
            const match = SCHEMES.find(sch => sch.title === sName || sch.id === Number(sName) || sch.title?.includes(sName));
            if (match) {
              updatedMap[match.id] = 'applied';
              appsMap[match.id] = app;
              titlesList.push(match.title);
            }
          });

          setApplyStatus(updatedMap);
          setAppliedAppsMap(appsMap);
          try {
            localStorage.setItem(storageKey, JSON.stringify(titlesList));
            localStorage.setItem('bjp_applied_schemes_global', JSON.stringify(titlesList));
          } catch(e) {}
        })
        .catch(() => {});
    }
  }, [epicNo, mobile]);

  const handleOpenApplyModal = (scheme) => {
    setSelectedSchemeForModal(scheme);
    setIsAgreed(true);
  };

  const openTracking = (scheme) => {
    setTrackingScheme({ scheme, app: appliedAppsMap[scheme.id] || null });
  };

  const handleConfirmSubmit = async () => {
    if (!selectedSchemeForModal) return;
    const scheme = selectedSchemeForModal;
    setIsSubmitting(true);

    const activeEpic = epicNo || localStorage.getItem('bjp_user_epic') || '';
    const activeMobile = mobile || localStorage.getItem('bjp_user_mobile') || '';

    try {
      const reg = await chat.registerSchemes({
        mobile: activeMobile,
        epicNo: activeEpic,
        voterName: userObj.voter_name || userObj.voterName || 'BJP Member',
        district: userObj.district || 'TAMIL NADU',
        assemblyName: userObj.assembly_name || userObj.assemblyName || 'Assembly',
        boothNo: userObj.part_no || userObj.boothNo || '1',
        schemeIds: [scheme.title]
      });
      // Store the JWT issued on registration so later protected calls work.
      if (reg?.token) localStorage.setItem('bjp_user_token', reg.token)
    } catch (err) {
      console.log('Scheme registration note:', err);
    } finally {
      setIsSubmitting(false);
      setApplyStatus((prev) => ({ ...prev, [scheme.id]: 'applied' }));

      const userKey = activeEpic || activeMobile || 'user';
      const storageKey = `bjp_applied_schemes_${userKey}`;
      try {
        const raw = localStorage.getItem(storageKey);
        let list = raw ? JSON.parse(raw) : [];
        if (!list.includes(scheme.title)) list.push(scheme.title);
        localStorage.setItem(storageKey, JSON.stringify(list));
        localStorage.setItem('bjp_applied_schemes_global', JSON.stringify(list));
      } catch (e) {}

      setSelectedSchemeForModal(null);

      // Trigger top-right notification toast
      setNotificationToast({
        title: t('Application Submitted!'),
        subText: t('Applied for {title}', { title: scheme.title })
      });

      setTimeout(() => {
        setNotificationToast(null);
      }, 5000);
    }
  };

  const appliedSchemes = SCHEMES.filter(s => applyStatus[s.id] === 'applied');
  const notAppliedSchemes = SCHEMES.filter(s => applyStatus[s.id] !== 'applied');

  // ── Application Tracking detail view (timeline of admin status updates) ──
  if (trackingScheme) {
    const { scheme, app } = trackingScheme;
    const history = (app?.statusHistory || []).slice().sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
    const current = app?.status || 'Submitted';
    const cs = statusColor(current);
    return (
      <div className="chatbot-container brochure-panel">
        <header className="brochure-header">
          <div className="brochure-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => setTrackingScheme(null)}
              style={{ background: 'none', border: 'none', color: 'var(--color-ash)', cursor: 'pointer', padding: '4px 8px 4px 0', fontSize: '18px', display: 'flex', alignItems: 'center' }}
              aria-label={t('Back')}
            >
              <i className="bi bi-chevron-left" />
            </button>
            <i className="bi bi-clipboard-check brochure-title-orange" />
            <span>{t('Application Tracking')}</span>
          </div>
        </header>

        <div className="brochure-content">
          <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Scheme summary + current status */}
            <div style={{ background: 'var(--color-carbon)', border: `1px solid ${cs.border}`, borderRadius: 14, padding: '16px 18px' }}>
              <div className="scheme-meta-cat" style={{ color: '#2ecc71' }}>{t(scheme.category)}</div>
              <h3 className="scheme-title" style={{ marginTop: 2 }}>{scheme.id}. {scheme.title}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: cs.fg, color: '#fff', padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 800 }}>
                  <i className={`bi ${cs.icon}`} /> {t(current)}
                </span>
                {app?.appliedAt && (
                  <span style={{ fontSize: 12, color: 'var(--color-ash)' }}>
                    {t('Applied on')}: {fmtDateTime(app.appliedAt)}
                  </span>
                )}
              </div>
              {app?.adminRemarks && (
                <p style={{ fontSize: 12.5, color: 'var(--color-chalk)', marginTop: 12, marginBottom: 0, lineHeight: 1.5 }}>
                  <i className="bi bi-chat-left-quote-fill" style={{ color: 'var(--color-ash)', marginRight: 6 }} />
                  {app.adminRemarks}
                </p>
              )}
            </div>

            {/* Status timeline */}
            <div>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-chalk)', display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 14px' }}>
                <i className="bi bi-clock-history brochure-title-orange" /> {t('Status Timeline')}
              </h4>

              {!app ? (
                <div style={{ fontSize: 13, color: 'var(--color-ash)', background: 'var(--color-carbon)', borderRadius: 10, padding: 14, border: '1px dashed var(--color-graphite)' }}>
                  {t('This application is being synced. Please check back shortly.')}
                </div>
              ) : history.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--color-ash)', background: 'var(--color-carbon)', borderRadius: 10, padding: 14, border: '1px dashed var(--color-graphite)' }}>
                  {t('No updates yet. Your application is being reviewed.')}
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  {history.map((h, idx) => {
                    const hs = statusColor(h.status);
                    const isLast = idx === history.length - 1;
                    return (
                      <div key={idx} style={{ display: 'flex', gap: 14 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: hs.fg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0, boxShadow: isLast ? `0 0 0 4px ${hs.tint}` : 'none' }}>
                            <i className={`bi ${hs.icon}`} />
                          </div>
                          {!isLast && <div style={{ width: 2, flex: 1, minHeight: 28, background: 'var(--color-graphite)' }} />}
                        </div>
                        <div style={{ paddingBottom: isLast ? 0 : 20, flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: hs.fg }}>{t(h.status)}</div>
                          {h.remarks && (
                            <div style={{ fontSize: 12.5, color: 'var(--color-chalk)', marginTop: 2, lineHeight: 1.45 }}>{h.remarks}</div>
                          )}
                          <div style={{ fontSize: 11, color: 'var(--color-ash)', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            <span><i className="bi bi-clock" /> {fmtDateTime(h.updatedAt)}</span>
                            {h.updatedBy && <span><i className="bi bi-person-badge" /> {h.updatedBy}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chatbot-container brochure-panel">
      {/* TOP RIGHT NOTIFICATION TOAST */}
      {notificationToast && (
        <div className="card-notification-toast">
          <div className="toast-notification-card">
            <svg className="toast-wave" style={{ width: 80, height: 32, position: 'absolute', left: -31, top: 32, transform: 'rotate(90deg)', fill: '#04e4003a', pointerEvents: 'none' }} viewBox="0 0 1440 320" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M0,256L11.4,240C22.9,224,46,192,69,192C91.4,192,114,224,137,234.7C160,245,183,235,206,213.3C228.6,192,251,160,274,149.3C297.1,139,320,149,343,181.3C365.7,213,389,267,411,282.7C434.3,299,457,277,480,250.7C502.9,224,526,192,549,181.3C571.4,171,594,181,617,208C640,235,663,277,686,256C708.6,235,731,149,754,122.7C777.1,96,800,128,823,165.3C845.7,203,869,245,891,224C914.3,203,937,117,960,112C982.9,107,1006,181,1029,197.3C1051.4,213,1074,171,1097,144C1120,117,1143,107,1166,133.3C1188.6,160,1211,224,1234,218.7C1257.1,213,1280,139,1303,133.3C1325.7,128,1349,192,1371,192C1394.3,192,1417,128,1429,96L1440,64L1440,320L1428.6,320C1417.1,320,1394,320,1371,320C1348.6,320,1326,320,1303,320C1280,320,1257,320,1234,320C1211.4,320,1189,320,1166,320C1142.9,320,1120,320,1097,320C1074.3,320,1051,320,1029,320C1005.7,320,983,320,960,320C937.1,320,914,320,891,320C868.6,320,846,320,823,320C800,320,777,320,754,320C731.4,320,709,320,686,320C662.9,320,640,320,617,320C594.3,320,571,320,549,320C525.7,320,503,320,480,320C457.1,320,434,320,411,320C388.6,320,366,320,343,320C320,320,297,320,274,320C251.4,320,229,320,206,320C182.9,320,160,320,137,320C114.3,320,91,320,69,320C45.7,320,23,320,11,320L0,320Z"
                fillOpacity="1"
              ></path>
            </svg>

            <div className="toast-icon-container" style={{ width: 42, height: 42, minWidth: 42, minHeight: 42, borderRadius: '50%', backgroundColor: '#04e40048', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 10, flexShrink: 0 }}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 512 512"
                strokeWidth="0"
                fill="currentColor"
                stroke="currentColor"
                className="toast-icon"
                style={{ width: 20, height: 20, color: '#269b24' }}
              >
                <path
                  d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-111 111-47-47c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l64 64c9.4 9.4 24.6 9.4 33.9 0L369 209z"
                ></path>
              </svg>
            </div>
            <div className="toast-message-container">
              <p className="toast-message-title">{notificationToast.title}</p>
              <p className="toast-message-sub" title={notificationToast.subText}>{notificationToast.subText}</p>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 15 15"
              strokeWidth="0"
              fill="none"
              stroke="currentColor"
              className="toast-cross-icon"
              onClick={() => setNotificationToast(null)}
            >
              <path
                fill="currentColor"
                d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                clipRule="evenodd"
                fillRule="evenodd"
              ></path>
            </svg>
          </div>
        </div>
      )}

      {/* POP SCREEN SCHEME APPLICATION MODAL */}
      {selectedSchemeForModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20
        }}>
          <div style={{
            background: 'var(--color-carbon, #1e1e24)',
            border: '1px solid var(--color-graphite, #333)',
            borderRadius: 20,
            width: '100%',
            maxWidth: 520,
            padding: '24px 28px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            animation: 'fadeInModal 0.25s ease-out'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ 
                  fontSize: 11, 
                  fontWeight: 700, 
                  color: 'var(--color-signal-mint, #2ecc71)', 
                  textTransform: 'uppercase', 
                  letterSpacing: 0.5 
                }}>
                  {selectedSchemeForModal.category}
                </span>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-chalk, #fff)', margin: '4px 0 0 0' }}>
                  {selectedSchemeForModal.title}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedSchemeForModal(null)}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none',
                  color: 'var(--color-ash, #aaa)',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  cursor: 'pointer',
                  fontSize: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <i className="bi bi-x-lg" />
              </button>
            </div>

            <div style={{ 
              background: 'rgba(255, 153, 51, 0.08)', 
              border: '1px solid rgba(255, 153, 51, 0.2)',
              borderRadius: 12,
              padding: '12px 16px'
            }}>
              <span style={{ 
                fontSize: 12, 
                fontWeight: 800, 
                color: '#FF9933', 
                display: 'block', 
                marginBottom: 4 
              }}>
                ⚡ {selectedSchemeForModal.highlight}
              </span>
              <p style={{ fontSize: 13, color: 'var(--color-chalk, #eee)', margin: 0, lineHeight: 1.4 }}>
                {selectedSchemeForModal.overview}
              </p>
            </div>

            <div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ash, #888)', display: 'block', marginBottom: 8 }}>
                {t('Required Documents for Verification:')}
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selectedSchemeForModal.documents.map((doc, idx) => (
                  <span key={idx} style={{
                    fontSize: 11,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    padding: '4px 10px',
                    color: 'var(--color-chalk, #ddd)'
                  }}>
                    ✓ {doc}
                  </span>
                ))}
              </div>
            </div>

            <label style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 10, 
              cursor: 'pointer',
              fontSize: 13,
              color: 'var(--color-chalk, #ddd)',
              marginTop: 4
            }}>
              <input 
                type="checkbox" 
                checked={isAgreed} 
                onChange={(e) => setIsAgreed(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#2ecc71', cursor: 'pointer' }}
              />
              <span>{t('I confirm to submit application request for this scheme.')}</span>
            </label>

            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button
                onClick={() => setSelectedSchemeForModal(null)}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: 12,
                  border: '1px solid var(--color-graphite, #444)',
                  background: 'transparent',
                  color: 'var(--color-ash, #aaa)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {t('Cancel')}
              </button>

              <button
                disabled={!isAgreed || isSubmitting}
                onClick={handleConfirmSubmit}
                style={{
                  flex: 2,
                  padding: '12px',
                  borderRadius: 12,
                  border: 'none',
                  background: isAgreed ? '#2ecc71' : '#555',
                  color: '#FFFFFF',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: isAgreed ? 'pointer' : 'not-allowed',
                  boxShadow: isAgreed ? '0 4px 14px rgba(46, 204, 113, 0.3)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'all 0.15s'
                }}
              >
                <i className="bi bi-send-fill" />
                {isSubmitting ? t('Submitting...') : t('Submit Application')}
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="brochure-header">
        <div className="brochure-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button 
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-ash)',
              cursor: 'pointer',
              padding: '4px 8px 4px 0',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-chalk)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-ash)'}
            aria-label="Back"
          >
            <i className="bi bi-chevron-left" />
          </button>
          <i className="bi bi-check2-all brochure-title-orange" />
          <span>{t('My Schemes Dashboard')}</span>
        </div>
      </header>

      <div className="brochure-content">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '12px 0' }}>
          
          {/* SECTION 1: APPLIED SCHEMES */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderBottom: '1px solid var(--color-graphite)', paddingBottom: 8 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#2ecc71', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                <i className="bi bi-check-circle-fill" />
                {t('My Applied Schemes')}
                <span style={{ fontSize: 12, background: 'rgba(46,204,113,0.15)', color: '#2ecc71', padding: '2px 8px', borderRadius: 12 }}>
                  {appliedSchemes.length}
                </span>
              </h3>
            </div>

            {appliedSchemes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 16px', background: 'var(--color-carbon)', borderRadius: 12, border: '1px dashed var(--color-graphite)', color: 'var(--color-ash)' }}>
                <i className="bi bi-inbox" style={{ fontSize: 28, marginBottom: 6, display: 'block' }} />
                <p style={{ margin: 0, fontSize: 13 }}>{t('No schemes applied yet. Select from the available schemes below to apply!')}</p>
              </div>
            ) : (
              <div className="schemes-list" style={{ gap: 12 }}>
                {appliedSchemes.map((scheme) => {
                  const app = appliedAppsMap[scheme.id] || null;
                  const st = app?.status || 'Submitted';
                  const sc = statusColor(st);
                  const bgImg = getSchemeBgImage(scheme.title);
                  const lastUpdate = app?.statusHistory?.length
                    ? app.statusHistory[app.statusHistory.length - 1].updatedAt
                    : app?.appliedAt;
                  return (
                    <div 
                      key={scheme.id} 
                      className="scheme-card"
                      style={{
                        border: `1.5px solid ${sc.border}`,
                        borderRadius: 16,
                        padding: '20px 22px',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        position: 'relative',
                        minHeight: 170,
                        boxSizing: 'border-box',
                        background: bgImg
                          ? `url("${encodeURI(bgImg)}") center / 100% 100% no-repeat`
                          : sc.tint,
                        boxShadow: '0 3px 12px rgba(0,0,0,0.06)',
                        transition: 'all 0.2s ease'
                      }}
                      onClick={() => openTracking(scheme)}
                    >
                      <div style={{ maxWidth: '75%', zIndex: 2, position: 'relative' }}>
                        <div className="scheme-card-header" style={{ marginBottom: 4 }}>
                          <div>
                            <div className="scheme-meta-cat" style={{ color: '#2ecc71', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              {t(scheme.category)}
                            </div>
                            <h3 className="scheme-title" style={{ fontSize: 18, fontWeight: 700, color: '#1d1d1f', margin: '3px 0 0 0', lineHeight: 1.25 }}>
                              {scheme.id}. {scheme.title}
                            </h3>
                          </div>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            background: sc.fg,
                            color: '#fff',
                            padding: '5px 14px',
                            borderRadius: 20,
                            fontSize: 11.5,
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.12)'
                          }}>
                            <i className={`bi ${sc.icon}`} /> {t(st)}
                          </span>
                        </div>

                        <p className="scheme-overview" style={{ marginTop: 8, fontSize: 13, color: '#3b3b3b', lineHeight: 1.45, fontWeight: 500 }}>
                          {scheme.overview}
                        </p>

                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
                          <button
                            className="scheme-toggle-btn"
                            onClick={(e) => { e.stopPropagation(); openTracking(scheme); }}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              background: '#2ecc71', color: '#ffffff', border: 'none',
                              padding: '7px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                              cursor: 'pointer', boxShadow: '0 2px 8px rgba(46, 204, 113, 0.3)'
                            }}
                          >
                            <i className="bi bi-clipboard-check" />
                            <span>{t('Track Application')}</span>
                          </button>
                          {lastUpdate && (
                            <span style={{ fontSize: 11.5, color: '#474747', fontWeight: 600 }}>
                              {t('Updated')}: {fmtDateTime(lastUpdate)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION 2: NOT APPLIED SCHEMES */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderBottom: '1px solid var(--color-graphite)', paddingBottom: 8 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-chalk)', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                <i className="bi bi-grid-fill brochure-title-orange" />
                {t('Available Central Schemes to Apply')}
                <span style={{ fontSize: 12, background: 'rgba(255,153,51,0.15)', color: '#FF9933', padding: '2px 8px', borderRadius: 12 }}>
                  {notAppliedSchemes.length}
                </span>
              </h3>
            </div>

            {notAppliedSchemes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 16px', background: 'var(--color-carbon)', borderRadius: 12, border: '1px solid var(--color-graphite)', color: 'var(--color-signal-mint)', fontWeight: 600 }}>
                🎉 {t('Congratulations! You have applied for all 23 Central Welfare Schemes!')}
              </div>
            ) : (
              <div className="schemes-list" style={{ gap: 12 }}>
                {notAppliedSchemes.map((scheme) => {
                  const isExpanded = expandedId === scheme.id;
                  const bgImg = getSchemeBgImage(scheme.title);
                  return (
                    <div 
                      key={scheme.id} 
                      className="scheme-card"
                      style={{
                        border: '1px solid #e5e5ea',
                        borderRadius: 16,
                        padding: '20px 22px',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        position: 'relative',
                        minHeight: 180,
                        boxSizing: 'border-box',
                        background: bgImg
                          ? `url("${encodeURI(bgImg)}") center / 100% 100% no-repeat`
                          : 'var(--color-carbon)',
                        boxShadow: '0 3px 12px rgba(0,0,0,0.06)',
                        transition: 'all 0.2s ease'
                      }}
                      onClick={() => setExpandedId(isExpanded ? null : scheme.id)}
                    >
                      <div style={{ maxWidth: '75%', zIndex: 2, position: 'relative' }}>
                        <div className="scheme-card-header" style={{ marginBottom: 6 }}>
                          <div>
                            <div className="scheme-meta-cat" style={{ color: 'var(--color-saffron, #ea580c)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              {t(scheme.category)}
                            </div>
                            <h3 className="scheme-title" style={{ fontSize: 18, fontWeight: 700, color: '#1d1d1f', margin: '3px 0 0 0', lineHeight: 1.25 }}>
                              {scheme.id}. {scheme.title}
                            </h3>
                          </div>
                          {scheme.highlight && (
                            <span className="scheme-badge" style={{ background: '#fff', border: '1px solid #FF9933', color: '#ea580c', fontWeight: 700, fontSize: 10.5, padding: '4px 10px', borderRadius: 20 }}>
                              {scheme.highlight}
                            </span>
                          )}
                        </div>

                        <div className="scheme-tags-row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
                          {scheme.tags.map((tItem, idx) => (
                            <span key={idx} className="scheme-tag" style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid #d2d2d7', color: '#1d1d1f', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6 }}>
                              {tItem}
                            </span>
                          ))}
                        </div>

                        <p className="scheme-overview" style={{ fontSize: 13, color: '#33333b', lineHeight: 1.45, fontWeight: 500, margin: '6px 0 12px 0' }}>
                          {scheme.overview}
                        </p>

                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                          <button
                            className="scheme-toggle-btn"
                            onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : scheme.id); }}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              background: 'rgba(255,255,255,0.92)', border: '1px solid #c2c2c7',
                              color: '#1d1d1f', padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                              cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                            }}
                          >
                            <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`} />
                            <span>{isExpanded ? t('Hide Steps') : t('View Details')}</span>
                          </button>

                          <button
                            className="btn-apply-scheme"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenApplyModal(scheme);
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              backgroundColor: '#2ecc71',
                              color: '#FFFFFF',
                              padding: '6px 18px',
                              borderRadius: 10,
                              fontWeight: 700,
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: 12.5,
                              transition: 'all 0.15s',
                              boxShadow: '0 2px 8px rgba(46, 204, 113, 0.3)'
                            }}
                          >
                            <i className="bi bi-send-check-fill" />
                            {t('Apply Now')}
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="scheme-details-expanded" onClick={(e) => e.stopPropagation()} style={{ marginTop: 16, background: 'rgba(255,255,255,0.95)', padding: 16, borderRadius: 12, border: '1px solid #e5e5ea' }}>
                            <div>
                              <div className="details-section-title" style={{ fontWeight: 700, color: '#1d1d1f' }}>
                                <i className="bi bi-info-circle-fill" style={{ color: '#ea580c' }} /> {t('Eligibility & Benefits')}
                              </div>
                              <p className="details-text" style={{ color: '#333' }}>{scheme.eligibility}</p>
                            </div>

                            <div style={{ marginTop: 10 }}>
                              <div className="details-section-title" style={{ fontWeight: 700, color: '#1d1d1f' }}>
                                <i className="bi bi-file-earmark-check-fill" style={{ color: '#2ecc71' }} /> {t('Required Documents')}
                              </div>
                              <div className="documents-list">
                                {scheme.documents.map((doc, idx) => (
                                  <div key={idx} className="doc-item" style={{ color: '#333' }}>
                                    <i className="bi bi-check-circle-fill" style={{ color: '#2ecc71' }} />
                                    <span>{doc}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>

        </div>
      </div>
    </div>
  );
}

function ReferralLinkMsg({ link }) {
  const { t } = useLang()
  const canvasRef = useRef(null)
  const [copied, setCopied] = useState(false)
  const [qrReady, setQrReady] = useState(false)

  useEffect(() => {
    if (!link || !canvasRef.current) return
    const canvas = canvasRef.current
    const size = 180
    QRCode.toCanvas(canvas, link, {
      width: size,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'H'
    }, (err) => {
      if (err) return
      const ctx = canvas.getContext('2d')
      const img = new Image()
      img.src = '/bjp_logo.svg'
      img.onload = () => {
        const logoSize = size * 0.22
        const logoX = (size - logoSize) / 2
        const logoY = (size - logoSize) / 2
        ctx.save()
        ctx.beginPath()
        ctx.arc(size / 2, size / 2, logoSize * 0.62, 0, Math.PI * 2)
        ctx.fillStyle = '#ffffff'
        ctx.fill()
        ctx.restore()
        ctx.drawImage(img, logoX, logoY, logoSize, logoSize)
        setQrReady(true)
      }
      img.onerror = () => setQrReady(true)
    })
  }, [link])

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(link).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleShareWhatsApp = () => {
    if (!link) return
    const shareText = `${t('*🪷 Join BJP Tamil Nadu!*')}\n\n${t('*Generate your free Digital Member ID Card here:*')}\n${link}`
    if (navigator.canShare && canvasRef.current) {
      canvasRef.current.toBlob((blob) => {
        const file = new File([blob], 'bjp-referral-qr.png', { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          navigator.share({
            title: t('🪷 Join BJP Tamil Nadu!'),
            text: shareText,
            files: [file]
          }).catch(() => {
            window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank')
          })
          return
        }
        window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank')
      }, 'image/png', 1.0)
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '8px 4px' }}>
      <div style={{ color: 'var(--color-ash)', fontSize: 13, textAlign: 'center', fontWeight: 500, lineHeight: 1.5 }}>
        {t('🪷 Here is your referral link and QR code! Share this to invite others and build your team:')}
      </div>
      
      {/* QR Code */}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <div style={{
          background: '#fff',
          borderRadius: 12,
          padding: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          display: 'inline-block'
        }}>
          <canvas ref={canvasRef} style={{ display: 'block', borderRadius: 6, width: 180, height: 180 }} />
        </div>
        {!qrReady && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner-border spinner-border-sm text-warning" />
          </div>
        )}
      </div>

      {/* Referral Link Box */}
      <div style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 12,
        color: 'var(--color-chalk)',
        wordBreak: 'break-all',
        width: '100%',
        textAlign: 'center',
        fontFamily: 'monospace'
      }}>
        {link}
      </div>

      {/* Share / Copy Buttons */}
      <div style={{ display: 'flex', gap: 8, width: '100%' }}>
        <button
          onClick={handleCopyLink}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.15)',
            background: copied ? 'rgba(46,204,113,0.15)' : 'rgba(255,255,255,0.07)',
            color: copied ? '#2ecc71' : 'var(--color-chalk)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <i className={`bi bi-${copied ? 'check-lg' : 'clipboard'}`} />
          {copied ? t('Copied!') : t('Copy Link')}
        </button>
        <button
          onClick={handleShareWhatsApp}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '10px 14px',
            borderRadius: 8,
            border: 'none',
            background: '#25d366',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          <i className="bi bi-whatsapp" /> {t('Share WhatsApp')}
        </button>
      </div>
    </div>
  )
}

const SCHEMES = [
  {
    id: 1,
    category: 'Cluster 1 — Insurance Trinity',
    title: 'PMSBY (Pradhan Mantri Suraksha Bima Yojana)',
    highlight: '₹2L ACCIDENT COVER — ₹20/YR',
    link: 'https://www.jansuraksha.gov.in/',
    overview: 'An affordable accidental death and disability insurance scheme providing ₹2 Lakhs cover for just ₹20 per year auto-debited from your bank account.',
    tags: ['Accident Insurance', '₹2 Lakhs Cover', '₹20 Annual Premium'],
    eligibility: 'Available to individuals aged 18 to 70 years with a bank account.',
    documents: ['Aadhaar Card', 'Bank Account Passbook (Auto-Debit)', 'Nominee Details'],
    steps: ['Visit your bank branch or access net-banking portal', 'Fill PMSBY enrollment form', 'Authorize annual auto-debit of ₹20']
  },
  {
    id: 2,
    category: 'Cluster 1 — Insurance Trinity',
    title: 'PMJJBY (Pradhan Mantri Jeevan Jyoti Bima Yojana)',
    highlight: '₹2L LIFE COVER — ₹436/YR',
    link: 'https://www.jansuraksha.gov.in/',
    overview: 'A renewable one-year term life insurance scheme offering ₹2 Lakhs coverage for death due to any reason for an annual premium of ₹436.',
    tags: ['Life Insurance', '₹2 Lakhs Death Benefit', 'Any Cause Cover'],
    eligibility: 'Available to individuals aged 18 to 50 years with a savings bank account.',
    documents: ['Aadhaar Card', 'Savings Bank Account', 'Nominee Aadhaar & Relationship'],
    steps: ['Contact savings bank or mobile banking app', 'Submit PMJJBY consent form', 'Enable auto-debit of ₹436 annual premium']
  },
  {
    id: 3,
    category: 'Cluster 1 — Insurance Trinity',
    title: 'Atal Pension Yojana (APY)',
    highlight: 'PENSION UP TO ₹5,000/MONTH',
    link: 'https://www.npscra.nsdl.co.in/scheme-details.php',
    overview: 'A guaranteed government pension scheme for unorganized sector workers, providing a monthly pension of ₹1,000 to ₹5,000 after attaining 60 years of age.',
    tags: ['Guaranteed Pension', 'Post-60 Retirement', 'Unorganized Sector'],
    eligibility: 'Open to all Indian citizens aged 18 to 40 years holding a bank account.',
    documents: ['Aadhaar Card', 'Mobile Number', 'Savings Bank Account Details'],
    steps: ['Approach bank branch or use online APY portal', 'Choose pension slab (₹1,000 to ₹5,000)', 'Contributions auto-deducted monthly']
  },
  {
    id: 4,
    category: 'Cluster 2 — Credit & Enterprise',
    title: 'PM SVANidhi (Street Vendor Loan)',
    highlight: 'COLLATERAL-FREE LOAN UP TO ₹50,000',
    link: 'https://pmsvanidhi.mohua.gov.in/',
    overview: 'Collateral-free working capital loan scheme for urban street vendors, offering initial ₹10,000 loans scaling up to ₹50,000 with 7% interest subsidy.',
    tags: ['Street Vendors', 'Collateral-Free Loan', '7% Interest Subsidy'],
    eligibility: 'Street vendors operating in urban areas with a Vending Certificate or ULB recommendation letter.',
    documents: ['Aadhaar Card', 'Vending Certificate / ULB LOR', 'Bank Account Passbook'],
    steps: ['Apply at pmsvanidhi.mohua.gov.in or nearest bank', 'Attach Vending ID', 'Receive collateral-free credit in bank account']
  },
  {
    id: 5,
    category: 'Cluster 2 — Credit & Enterprise',
    title: 'PM Mudra Loan — Shishu Category',
    highlight: 'BUSINESS LOAN UP TO ₹50,000',
    link: 'https://www.mudra.org.in/',
    overview: 'Collateral-free micro-business loans up to ₹50,000 for small entrepreneurs, shopkeepers, artisans, and new startups.',
    tags: ['No Collateral', 'Micro Loan', 'Startup Capital'],
    eligibility: 'Non-corporate, non-farm small micro-enterprises seeking startup or expansion capital.',
    documents: ['Aadhaar & PAN Card', 'Business Identity Proof', 'Bank Account Statement'],
    steps: ['Visit nearest bank or MFI branch', 'Submit business plan & KYC', 'Receive loan sanction in 7-10 days']
  },
  {
    id: 6,
    category: 'Cluster 2 — Credit & Enterprise',
    title: 'PM Mudra Loan — Kishor Category',
    highlight: 'BUSINESS LOAN ₹50,000 TO ₹5 LAKHS',
    link: 'https://www.mudra.org.in/',
    overview: 'Business expansion loans ranging from ₹50,000 up to ₹5 Lakhs for established micro-enterprises looking to purchase equipment or working capital.',
    tags: ['Business Expansion', 'Up to ₹5 Lakhs', 'Collateral Free'],
    eligibility: 'Existing micro-enterprises with proven business activity for at least 1 year.',
    documents: ['Aadhaar & Business PAN', '6 Months Bank Statement', 'Business Registration'],
    steps: ['Apply at bank branch', 'Submit business financial statements', 'Receive loan disbursement']
  },
  {
    id: 7,
    category: 'Cluster 2 — Credit & Enterprise',
    title: 'Udyam MSME Registration Portal',
    highlight: 'FREE MSME CERTIFICATE',
    link: 'https://udyamregistration.gov.in/',
    overview: 'Free online government registration for Micro, Small & Medium Enterprises (MSMEs) unlocking priority bank lending, subsidies, and tender benefits.',
    tags: ['Instant Certificate', 'Priority Bank Credit', 'Govt Subsidies'],
    eligibility: 'Any enterprise meeting MSME turnover criteria (Micro < ₹5Cr, Small < ₹50Cr, Medium < ₹250Cr).',
    documents: ['Aadhaar Card (Proprietor)', 'PAN Card', 'GSTIN (if applicable)'],
    steps: ['Visit udyamregistration.gov.in', 'Enter Aadhaar & OTP', 'Download official Udyam MSME Certificate']
  },
  {
    id: 8,
    category: 'Cluster 2 — Credit & Enterprise',
    title: 'Stand Up India Scheme',
    highlight: 'LOANS ₹10 LAKHS TO ₹1 CRORE',
    link: 'https://www.standupmitra.in/',
    overview: 'Bank loans between ₹10 Lakhs and ₹1 Crore for SC/ST and Women entrepreneurs to set up greenfield manufacturing, services, or trading enterprises.',
    tags: ['SC/ST & Women', '₹10L to ₹1Cr Loan', 'Greenfield Enterprise'],
    eligibility: 'SC/ST and/or Woman entrepreneurs above 18 years setting up first-time business.',
    documents: ['Aadhaar & PAN Card', 'Caste Certificate (if SC/ST)', 'Detailed Project Report (DPR)'],
    steps: ['Apply at standupmitra.in', 'Submit project report to bank', 'Receive loan approval and disbursement']
  },
  {
    id: 9,
    category: 'Cluster 2 — Credit & Enterprise',
    title: 'Startup India Seed Fund Scheme (SISFS)',
    highlight: 'SEED FUNDING UP TO ₹50 LAKHS',
    link: 'https://seedfund.startupindia.gov.in/',
    overview: 'Financial assistance up to ₹20 Lakhs for proof of concept/prototype development and up to ₹50 Lakhs for commercialization via DPIIT-approved incubators.',
    tags: ['Startup Funding', 'Proof of Concept', 'Incubator Support'],
    eligibility: 'DPIIT-recognized startups incorporated for less than 2 years with an innovative product.',
    documents: ['DPIIT Recognition Cert.', 'Company Incorporation Cert.', 'Pitch Deck / Prototype Details'],
    steps: ['Register on startupindia.gov.in', 'Apply to DPIIT-approved incubators', 'Receive seed grant funding']
  },
  {
    id: 10,
    category: 'Cluster 3 — Farmers Welfare',
    title: 'PM Kisan Samman Nidhi',
    highlight: '₹6,000/YEAR DIRECT CASH',
    link: 'https://pmkisan.gov.in/',
    overview: 'Direct income support of ₹6,000 per year in 3 equal installments of ₹2,000 credited directly into landholding farmers bank accounts via Aadhaar DBT.',
    tags: ['Direct Cash Transfer', '₹6,000 Annual Benefit', 'Landholding Farmers'],
    eligibility: 'All landholding farmer families who own cultivable land in Tamil Nadu.',
    documents: ['Aadhaar Card', 'Land Records (Patta / Chitta)', 'Aadhaar-Seeded Bank Passbook'],
    steps: ['Visit pmkisan.gov.in for self-registration', 'Submit Patta/Chitta details', 'Receive ₹2,000 installments directly in bank']
  },
  {
    id: 11,
    category: 'Cluster 3 — Farmers Welfare',
    title: 'PM Fasal Bima Yojana (PMFBY)',
    highlight: 'CROP LOSS INSURANCE COVER',
    link: 'https://pmfby.gov.in/',
    overview: 'Comprehensive crop insurance protecting farmers against non-preventable natural risks, drought, floods, pests, and weather calamities.',
    tags: ['Crop Insurance', 'Natural Risk Cover', 'Subsidized Premium'],
    eligibility: 'All farmers (loanee & non-loanee) growing notified crops in notified areas.',
    documents: ['Aadhaar Card', 'Land Ownership / Sowing Cert.', 'Bank Passbook'],
    steps: ['Apply on pmfby.gov.in or bank', 'Upload crop sowing cert', 'Pay heavily subsidized premium (1.5%-2%)']
  },
  {
    id: 12,
    category: 'Cluster 3 — Farmers Welfare',
    title: 'PM Kisan Maan Dhan Yojana',
    highlight: '₹3,000 MONTHLY PENSION',
    link: 'https://pmkmy.gov.in/',
    overview: 'Voluntary pension scheme for small & marginal farmers guaranteeing a minimum monthly pension of ₹3,000 after attaining age 60.',
    tags: ['Farmer Pension', '₹3,000 Guaranteed', 'Old Age Security'],
    eligibility: 'Small & marginal farmers aged 18 to 40 years holding cultivable land up to 2 hectares.',
    documents: ['Aadhaar Card', 'Savings Bank / PM-Kisan A/c', 'Land Records'],
    steps: ['Enroll at nearest CSC', 'Set up auto-debit contribution', 'Receive ₹3,000 monthly pension after age 60']
  },
  {
    id: 13,
    category: 'Cluster 4 — Health & Wellness',
    title: 'Ayushman Bharat PMJAY',
    highlight: '₹5 LAKHS CASHLESS HEALTH COVER',
    link: 'https://pmjay.gov.in/',
    overview: 'Cashless hospitalisation health cover of ₹5 Lakhs per family per year across 25,000+ empanelled hospitals nationwide.',
    tags: ['₹5 Lakhs Health Cover', 'Cashless Hospitalisation', 'Empanelled Network'],
    eligibility: 'Families listed in SECC 2011 database or eligible priority categories.',
    documents: ['Aadhaar Card', 'Ration Card / Beneficiary ID'],
    steps: ['Check eligibility at pmjay.gov.in', 'Visit empanelled hospital', 'Get free Ayushman Card for cashless treatment']
  },
  {
    id: 14,
    category: 'Cluster 4 — Health & Wellness',
    title: 'ABHA — Digital Health ID Card',
    highlight: '14-DIGIT DIGITAL HEALTH ID',
    link: 'https://abha.abdm.gov.in/',
    overview: 'A unique 14-digit digital health account number that securely links and stores all your health records, prescriptions, and lab reports.',
    tags: ['Digital Health Card', 'ABDM Network', 'Instant Creation'],
    eligibility: 'All Indian citizens. Free of cost.',
    documents: ['Aadhaar Card (Mobile Linked)'],
    steps: ['Visit abha.abdm.gov.in', 'Enter Aadhaar & OTP', 'Download ABHA Card instantly']
  },
  {
    id: 15,
    category: 'Cluster 5 — Women & Families',
    title: 'PM Ujjwala Yojana (PMUY 2.0)',
    highlight: 'FREE LPG CONNECTION',
    link: 'https://www.pmuy.gov.in/',
    overview: 'Provides deposit-free LPG gas connections with first refill and stove free of cost to adult women belonging to poor BPL households.',
    tags: ['Free Cooking Gas', 'Women Empowerment', 'Clean Kitchen'],
    eligibility: 'Adult women from BPL / SECC households without an existing LPG connection.',
    documents: ['Aadhaar Card (All Adult Members)', 'Ration Card / BPL Certificate', 'Bank Account Passbook'],
    steps: ['Apply at LPG distributor', 'Attach family Aadhaar & Ration card', 'Receive free LPG cylinder & stove']
  },
  {
    id: 16,
    category: 'Cluster 5 — Women & Families',
    title: 'PM Matru Vandana Yojana (PMMVY)',
    highlight: '₹5,000 DIRECT CASH',
    link: 'https://pmmvy.wcd.gov.in/',
    overview: 'Direct cash transfer of ₹5,000 to pregnant and lactating mothers for essential nutrition and healthcare during first live birth.',
    tags: ['Maternal Health', '₹5,000 Cash DBT', 'First Child Benefit'],
    eligibility: 'Pregnant women and lactating mothers for the first living child in the family.',
    documents: ['Mother Aadhaar', 'MCP Card', 'Bank Passbook'],
    steps: ['Register at Anganwadi / Health Center', 'Upload MCP Card', 'Receive ₹5,000 cash in 2 installments']
  },
  {
    id: 17,
    category: 'Cluster 5 — Women & Families',
    title: 'Sukanya Samriddhi Yojana (SSY)',
    highlight: '8.2% TAX-FREE INTEREST',
    link: 'https://www.nsiindia.gov.in/',
    overview: 'High-interest tax-free savings scheme for girl children below 10 years to build a secure fund for higher education and marriage.',
    tags: ['Girl Child Savings', '8.2% Interest Rate', 'Tax Exempt 80C'],
    eligibility: 'Parents or guardians of a girl child below 10 years of age (max 2 girls per family).',
    documents: ['Child Birth Certificate', 'Parent Aadhaar & PAN Card'],
    steps: ['Visit Post Office or Bank branch', 'Fill SSY form', 'Deposit min ₹250/yr (earn 8.2% tax-free interest)']
  },
  {
    id: 18,
    category: 'Cluster 6 — Housing for All',
    title: 'PM Awas Yojana (PMAY)',
    highlight: '₹1.2L TO ₹1.3L HOUSING SUBSIDY',
    link: 'https://pmayg.nic.in/',
    overview: 'Financial subsidy of ₹1.2 Lakhs to ₹1.3 Lakhs to construct a pucca house or upgrade kutcha/dilapidated homes.',
    tags: ['Pucca House Subsidy', 'PMAY Urban & Rural', 'DBT Housing Fund'],
    eligibility: 'Houseless families or those living in kutcha/dilapidated houses as per SECC list.',
    documents: ['Aadhaar Card', 'Job Card / SECC Proof', 'Bank Passbook'],
    steps: ['Apply at Gram Panchayat / ULB office', 'SECC priority list verification', 'Receive construction funds in bank']
  },
  {
    id: 19,
    category: 'Cluster 7 — Youth & Skills',
    title: 'PM Kaushal Vikas Yojana (PMKVY 4.0)',
    highlight: 'FREE SKILL TRAINING & CERTIFICATE',
    link: 'https://www.pmkvyofficial.org/',
    overview: 'Industry-aligned free skill development training and certification for youth aged 15–45 to enhance employability.',
    tags: ['Skill Certification', 'Free Training', 'Job Placement'],
    eligibility: 'Indian youth aged 15 to 45 years looking for skill training or upskilling.',
    documents: ['Aadhaar Card', 'Educational Certificate', 'Bank Account'],
    steps: ['Register at skillindiadigital.gov.in', 'Enroll at PMKK center', 'Complete training & receive certificate']
  },
  {
    id: 20,
    category: 'Cluster 7 — Youth & Skills',
    title: 'National Scholarship Portal (NSP)',
    highlight: 'PRE & POST MATRIC GRANTS',
    link: 'https://scholarships.gov.in/',
    overview: 'Single window online portal for central scholarships providing full educational fee support from Class 1 through PhD levels.',
    tags: ['Student Scholarships', 'Higher Education', 'Direct Fee Support'],
    eligibility: 'Students studying in Class 1 to PhD levels meeting income & academic criteria.',
    documents: ['Student Aadhaar / Bonafide Cert.', 'Marksheet', 'Income Certificate'],
    steps: ['Register on scholarships.gov.in', 'Select scheme & upload docs', 'Receive scholarship via DBT']
  },
  {
    id: 21,
    category: 'Cluster 7 — Youth & Skills',
    title: 'PM Vishwakarma Scheme',
    highlight: '₹15,000 TOOLKIT GRANT & 5% LOAN',
    link: 'https://pmvishwakarma.gov.in/',
    overview: 'Holistic support for 18 traditional artisan trades providing ₹15,000 toolkit e-vouchers, free training stipend, and 5% interest loans.',
    tags: ['18 Artisan Trades', '₹15K Toolkit Grant', '5% Concessional Credit'],
    eligibility: 'Artisans working with hands & tools in 18 notified traditional trades.',
    documents: ['Aadhaar Card (Mobile Linked)', 'Ration Card / Trade Declaration', 'Bank Passbook'],
    steps: ['Register at CSC', 'Complete verification & skill training', 'Receive ₹15k toolkit voucher & loan']
  },
  {
    id: 22,
    category: 'Foundation Layer',
    title: 'Pradhan Mantri Jan Dhan Yojana (PMJDY)',
    highlight: 'ZERO BALANCE BANK ACCOUNT',
    link: 'https://pmjdy.gov.in/',
    overview: 'National Mission for Financial Inclusion providing zero-balance savings accounts, free RuPay debit card, and ₹2 Lakhs accident insurance.',
    tags: ['Zero Balance Account', 'RuPay Debit Card', 'DBT Gateway'],
    eligibility: 'Any Indian citizen aged 10 years and above without an existing bank account.',
    documents: ['Aadhaar Card', 'Passport Photograph'],
    steps: ['Visit bank branch / BC kiosk', 'Fill PMJDY form', 'Receive RuPay debit card']
  },
  {
    id: 23,
    category: 'Foundation Layer',
    title: 'e-Shram Unorganised Workers Portal',
    highlight: 'UNIVERSAL WORKER ID CARD',
    link: 'https://eshram.gov.in/',
    overview: 'National database of unorganised workers providing a 12-digit UWIN card that unlocks free accidental death/disability insurance and welfare benefit eligibility.',
    tags: ['Worker ID Card', 'Unorganised Sector', 'Accident Insurance'],
    eligibility: 'Unorganised workers aged 16 to 59 years (construction workers, domestic help, drivers, farmers, gig workers).',
    documents: [
      'Aadhaar Card (Mobile Linked)',
      'Savings Bank Account Number & IFSC Code'
    ],
    steps: [
      'Visit eshram.gov.in or nearest Common Service Center (CSC)',
      'Self-register using Aadhaar-linked mobile number for OTP',
      'Fill occupation, skill type, and bank account details',
      'Download 12-digit Universal Account Number (UAN) e-Shram Card',
      'Get free ₹2 Lakhs accidental insurance cover under PMSBY'
    ]
  }
];

function FullProfilePanel({ epicNo, mobile, referredCount, onBack }) {
  const { t } = useLang()
  const [profileData, setProfileData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!epicNo) {
      setError(t('No profile data available.'))
      setLoading(false)
      return
    }
    chat.profile(epicNo, mobile)
      .then((data) => {
        setProfileData(data)
      })
      .catch((err) => {
        setError(err.message || t('Unable to load profile.'))
      })
      .finally(() => {
        setLoading(false)
      })
  }, [epicNo, mobile])

  const u = profileData?.user || profileData || {}
  const voterName = u.voterName || u.name || u.voter_name || 'Member'
  const userEpic = u.epicNo || u.epic_no || epicNo || 'N/A'
  const userMobile = u.mobile || mobile || 'N/A'
  const userAssembly = u.assemblyName || u.assembly || 'N/A'
  const userDistrict = u.district || 'N/A'
  const userBooth = u.boothNo || u.booth_no || u.part_no || 'N/A'

  return (
    <div className="chatbot-container brochure-panel">
      <header className="brochure-header">
        <div className="brochure-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button 
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-ash)',
              cursor: 'pointer',
              padding: '4px 8px 4px 0',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-chalk)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-ash)'}
            aria-label="Back"
          >
            <i className="bi bi-chevron-left" />
          </button>
          <i className="bi bi-person-circle brochure-title-orange" />
          <span>{t('My Profile')}</span>
        </div>
      </header>

      <div className="brochure-content">
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
            <div style={{ width: 32, height: 32, border: '3px solid rgba(46, 204, 113, 0.15)', borderTopColor: 'var(--color-signal-mint)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-ash)' }}>
            <i className="bi bi-exclamation-triangle" style={{ fontSize: 32, color: '#ff3b30', marginBottom: 12, display: 'block' }} />
            {error}
          </div>
        ) : (
          <div style={{ 
            width: '100%', 
            maxWidth: '640px',
            margin: '20px auto 0 auto',
            display: 'flex', 
            flexDirection: 'column',
            gap: 20,
            background: 'transparent',
            border: 'none',
            borderRadius: 0,
            padding: '10px 0',
            boxShadow: 'none'
          }}>
            {/* Header Name & Role Badge */}
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <h3 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-chalk)', marginBottom: 4 }}>{voterName}</h3>
              <p style={{ fontSize: 13, color: 'var(--color-signal-mint)', fontWeight: 600, margin: 0 }}>
                {referredCount >= 5 ? t('BJP Volunteer Agent') : t('BJP Registered Member')}
              </p>
            </div>

            {/* Details Grid */}
            <div style={{ 
              width: '100%', 
              display: 'grid', 
              gridTemplateColumns: 'repeat(2, 1fr)', 
              gap: 12 
            }}>
              {/* EPIC Number */}
              <div style={{ 
                background: 'var(--color-carbon)', 
                border: '1px solid var(--color-graphite)',
                borderRadius: 12,
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-ash)' }}>
                  <i className="bi bi-card-text" style={{ color: '#FF9933' }} />
                  <span>{t('EPIC Number')}</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-chalk)', fontFamily: 'monospace' }}>{userEpic}</span>
              </div>

              {/* Mobile Number */}
              <div style={{ 
                background: 'var(--color-carbon)', 
                border: '1px solid var(--color-graphite)',
                borderRadius: 12,
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-ash)' }}>
                  <i className="bi bi-phone" style={{ color: '#FF9933' }} />
                  <span>{t('Mobile Number')}</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-chalk)', fontFamily: 'monospace' }}>{userMobile}</span>
              </div>

              {/* State */}
              <div style={{ 
                background: 'var(--color-carbon)', 
                border: '1px solid var(--color-graphite)',
                borderRadius: 12,
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-ash)' }}>
                  <i className="bi bi-geo" style={{ color: '#FF9933' }} />
                  <span>{t('State')}</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-chalk)' }}>{t('Tamil Nadu')}</span>
              </div>

              {/* Assembly */}
              <div style={{ 
                background: 'var(--color-carbon)', 
                border: '1px solid var(--color-graphite)',
                borderRadius: 12,
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-ash)' }}>
                  <i className="bi bi-geo-alt" style={{ color: '#FF9933' }} />
                  <span>{t('Assembly')}</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-chalk)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={userAssembly}>{userAssembly}</span>
              </div>

              {/* District */}
              <div style={{ 
                background: 'var(--color-carbon)', 
                border: '1px solid var(--color-graphite)',
                borderRadius: 12,
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-ash)' }}>
                  <i className="bi bi-map" style={{ color: '#FF9933' }} />
                  <span>{t('District')}</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-chalk)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={userDistrict}>{userDistrict}</span>
              </div>

              {/* Booth Number */}
              <div style={{ 
                background: 'var(--color-carbon)', 
                border: '1px solid var(--color-graphite)',
                borderRadius: 12,
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-ash)' }}>
                  <i className="bi bi-house-door" style={{ color: '#FF9933' }} />
                  <span>{t('Polling Booth')}</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-chalk)' }}>{userBooth === 'N/A' ? userBooth : `${t('Booth')} ${userBooth}`}</span>
              </div>

              {/* Total Referrals */}
              <div style={{ 
                background: 'rgba(46,204,113,0.04)', 
                border: '1px solid rgba(46,204,113,0.1)',
                borderRadius: 12,
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="bi bi-people-fill" style={{ color: 'var(--color-signal-mint)', fontSize: 16 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-chalk)' }}>{t('Total Referrals')}</span>
                </div>
                <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-signal-mint)' }}>{referredCount || 0}</span>
              </div>
            </div>
          </div>
        )}
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ── My Referrals — simple flat list of referred persons ─────────────
function MyReferralsListPanel({ bjpCode, onBack }) {
  const { t } = useLang()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!bjpCode) {
      setError(t('No referral code available.'))
      setLoading(false)
      return
    }
    chat.getMyMembers(bjpCode)
      .then((data) => {
        // Backend returns a flat { members } array. Also support a legacy
        // { root, tree } shape by flattening direct + indirect referrals.
        let list = []
        if (Array.isArray(data.members)) {
          list = data.members
        } else if (Array.isArray(data.tree)) {
          data.tree.forEach((m) => {
            list.push(m)
            if (Array.isArray(m.referrals)) list.push(...m.referrals)
          })
        }
        setMembers(list)
      })
      .catch((err) => setError(err.message || t('Unable to load referred members.')))
      .finally(() => setLoading(false))
  }, [bjpCode])

  const fmtJoin = (d) => {
    if (!d) return ''
    try {
      return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    } catch { return '' }
  }

  return (
    <div className="chatbot-container brochure-panel">
      <header className="brochure-header">
        <div className="brochure-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', color: 'var(--color-ash)', cursor: 'pointer', padding: '4px 8px 4px 0', fontSize: '18px', display: 'flex', alignItems: 'center' }}
            aria-label={t('Back')}
          >
            <i className="bi bi-chevron-left" />
          </button>
          <i className="bi bi-people-fill brochure-title-orange" />
          <span>{t('My Referrals')}</span>
        </div>
      </header>

      <div className="brochure-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
            <div style={{ width: 32, height: 32, border: '3px solid rgba(46, 204, 113, 0.15)', borderTopColor: 'var(--color-signal-mint)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-ash)' }}>
            <i className="bi bi-exclamation-triangle" style={{ fontSize: 32, color: '#ff3b30', marginBottom: 12, display: 'block' }} />
            {error}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>
            <div style={{ fontSize: 13, color: 'var(--color-signal-mint)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--color-graphite)', paddingBottom: 10 }}>
              <i className="bi bi-people-fill" />
              {t('{count} people joined using your referral link', { count: members.length })}
            </div>

            {members.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-ash)' }}>
                <i className="bi bi-person-plus" style={{ fontSize: 44, color: 'var(--color-graphite)', marginBottom: 14, display: 'block' }} />
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-chalk)', marginBottom: 8 }}>{t('No referrals yet')}</h3>
                <p style={{ fontSize: 13, margin: 0, color: 'var(--color-ash)', lineHeight: 1.6 }}>
                  {t('Share your referral link — everyone who registers through it will appear here.')}
                </p>
              </div>
            ) : (
              members.map((m, idx) => {
                const name = m.voterName || m.name || 'BJP Member'
                const epic = m.epicNo || m.epic_no || '—'
                const district = m.district || '—'
                const assembly = m.assemblyName || m.assembly_name || '—'
                const booth = m.boothNo || m.part_no || '—'
                const joined = m.createdAt || m.generated_at
                return (
                  <div key={m._id || m.epicNo || m.bjp_code || idx} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    background: 'var(--color-carbon)', border: '1px solid var(--color-graphite)', borderRadius: 14
                  }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(46,204,113,0.12)', color: 'var(--color-signal-mint)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                      {idx + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-chalk)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-ash)', marginTop: 2 }}>
                        <i className="bi bi-card-text" style={{ marginRight: 4 }} />{epic}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-ash)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <i className="bi bi-geo-alt" style={{ marginRight: 4 }} />{district} • {assembly} • {t('Booth')} {booth}
                      </div>
                    </div>
                    {joined && (
                      <div style={{ fontSize: 10, color: 'var(--color-ash)', textAlign: 'right', flexShrink: 0 }}>
                        {t('Joined')}<br />{fmtJoin(joined)}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Main ChatbotPage ────────────────────────────────────────
export default function ChatbotPage() {
  const navigate = useNavigate()
  useEffect(() => {
    console.log("BJP TN Member App v1.0.5 Loaded");

    window.handlePDFGenerated = (pdfBlob, filename) => {
      console.log('Parent received generated PDF blob:', filename);
      const file = new File([pdfBlob], filename, { type: 'application/pdf' });
      
      const uploadAndDownloadPDF = () => {
        const reader = new FileReader();
        reader.readAsDataURL(pdfBlob);
        reader.onloadend = () => {
          const base64data = reader.result.split(',')[1];
          const apiUrl = import.meta.env.VITE_API_URL || '';
          const uploadUrl = `${apiUrl}/api/verify/pdf/upload`;
          
          fetch(uploadUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              pdfData: base64data,
              filename: filename
            })
          })
          .then((res) => {
            if (!res.ok) throw new Error('Upload failed');
            return res.json();
          })
          .then((data) => {
            const downloadId = data.downloadId;
            const downloadUrl = `${apiUrl}/api/verify/pdf/download/${downloadId}?disposition=attachment`;
            
            // If we pre-opened a window, use it
            if (window.iosWin && !window.iosWin.closed) {
              window.iosWin.location.href = downloadUrl;
              window.iosWin = null;
            } else {
              // Otherwise navigate parent
              window.location.href = downloadUrl;
            }
          })
          .catch((err) => {
            console.error('Server upload failed, saving locally:', err);
            if (window.iosWin && !window.iosWin.closed) {
              try { window.iosWin.close(); } catch (e) {}
              window.iosWin = null;
            }
            // Fallback: programmatically click a blob link
            const blobUrl = URL.createObjectURL(pdfBlob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
          });
        };
      };

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        if (window.iosWin && !window.iosWin.closed) {
          try { window.iosWin.close(); } catch (e) {}
          window.iosWin = null;
        }
        navigator.share({
          files: [file],
          title: filename,
          text: 'Your Official BJP Tamil Nadu Letter'
        })
        .then(() => {
          console.log('PDF shared successfully');
        })
        .catch((err) => {
          console.warn('PDF share failed or canceled:', err);
          // If the user cancelled the share sheet (AbortError), don't trigger download fallback.
          // Otherwise, if it was a real failure, fall back to upload/download.
          if (err.name !== 'AbortError') {
            uploadAndDownloadPDF();
          }
        });
      } else {
        uploadAndDownloadPDF();
      }
    };

    return () => {
      delete window.handlePDFGenerated;
    };
  }, [])
  const [chatState, setChatState]   = useState(S.WELCOME)
  const [messages, setMessages]     = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping]     = useState(false)
  const [sendHint, setSendHint]     = useState('')   // small validation bubble near the send button
  const sendHintTimer = useRef(null)
  const [otpResendIn, setOtpResendIn] = useState(0)  // seconds left before "Resend OTP" is allowed
  const otpTimerRef = useRef(null)
  const { t } = useLang()
  const [activeView, setActiveView] = useState('chat')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Notification bell: reflects browser permission (on/off) + unseen scheme updates
  const [notifPermission, setNotifPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied'
  )
  const [hasSchemeUpdate, setHasSchemeUpdate] = useState(false)

  const [referredCount, setReferredCount] = useState(0)

  // Snapshot of the user's scheme applications (status + history length) for
  // detecting admin status updates during polling.
  const schemeSnapshotRef = useRef(null)
  const schemeSeenKeyRef  = useRef(null)

  const playNotificationSound = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return
      const ctx = new AudioContext()
      const now = ctx.currentTime
      
      // Tone 1: C5
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(523.25, now)
      gain1.gain.setValueAtTime(0.12, now)
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start(now)
      osc1.stop(now + 0.25)

      // Tone 2: E5
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(659.25, now + 0.08)
      gain2.gain.setValueAtTime(0.12, now + 0.08)
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start(now + 0.08)
      osc2.stop(now + 0.35)
    } catch (err) {
      console.warn('Audio Context sound play failed:', err)
    }
  }

  // Refresh referral count / member status whenever a view that shows it opens.
  // Returning users load from cache without a fresh fetch, so without this the
  // "Total Referrals" count stays stale at 0.
  useEffect(() => {
    if (activeView === 'profile' || activeView === 'my_referrals' || activeView === 'my_members') {
      const code = cardRef.current?.bjp_code || cardRef.current?.ptc_code || profileRef.current?.bjp_code || profileRef.current?.ptc_code
      if (code) fetchMemberStatus(code)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView])

  const fetchMemberStatus = async (code) => {
    if (!code) return
    try {
      const res = await chat.getMemberStatus(code)
      if (res.success) {
        setReferredCount(res.referred_count || 0)
      }
    } catch (err) {
      console.warn('Failed to fetch member status:', err)
    }
  }

  const handleSidebarOpen = () => {
    setSidebarOpen(true)
  }

  // Persistent refs (avoid stale closures)
  const initializedRef = useRef(false)
  const mobileRef   = useRef('')
  const epicRef     = useRef('')
  const cardRef     = useRef(null)
  const profileRef  = useRef(null)
  const voterRef    = useRef(null)
  const stateRef    = useRef(S.WELCOME)
  // Referral attribution — populated from URL params on mount
  const referralRef = useRef(getReferralParams())

  const messagesEndRef  = useRef(null)

  // Keep stateRef synced
  useEffect(() => { stateRef.current = chatState }, [chatState])

  // Auto scroll — scroll ONLY the messages container, never the page.
  // Using scrollIntoView() here caused the whole fixed chat layout to jump/move
  // on mobile (it scrolls every scrollable ancestor). Scrolling the container's
  // own scrollTop keeps the header + input bar fixed.
  useEffect(() => {
    const end = messagesEndRef.current
    if (!end) return
    const container = end.parentElement // .chat-messages
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, isTyping])

  // Poll for admin status updates on the user's scheme applications.
  // On any status/history change → red dot on the bell + notification sound
  // (+ a browser notification if the user has granted permission).
  useEffect(() => {
    if (chatState !== S.DONE) return
    const epic = epicRef.current || cardRef.current?.epic_no || profileRef.current?.epic_no || ''
    const mob  = mobileRef.current || cardRef.current?.mobile || profileRef.current?.mobile || ''
    const userKey = epic || mob
    if (!userKey) return
    const seenKey = `bjp_scheme_seen_${userKey}`
    schemeSeenKeyRef.current = seenKey
    let stopped = false

    const buildSnapshot = (apps) => {
      const snap = {}
      apps.forEach((a) => { snap[a._id] = { status: a.status, len: (a.statusHistory || []).length } })
      return snap
    }

    const check = async () => {
      try {
        const data = await chat.profile(epic || 'user', mob)
        if (stopped) return
        const apps = data.applications || []
        const snapshot = buildSnapshot(apps)
        schemeSnapshotRef.current = snapshot

        const raw = localStorage.getItem(seenKey)
        if (!raw) {
          // First observation — establish baseline silently.
          try { localStorage.setItem(seenKey, JSON.stringify(snapshot)) } catch {}
          return
        }
        let seen = {}
        try { seen = JSON.parse(raw) } catch {}
        let changed = false
        for (const id in snapshot) {
          const cur = snapshot[id]
          const old = seen[id]
          if (!old || old.status !== cur.status || old.len !== cur.len) { changed = true; break }
        }
        if (changed) {
          setHasSchemeUpdate(true)
          playNotificationSound()
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification('BJP Nalam Thittam', {
                body: t('Your scheme application status has been updated.'),
                icon: '/bjp_logo.png'
              })
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore network errors */ }
    }

    check()
    const iv = setInterval(check, 30000)
    return () => { stopped = true; clearInterval(iv) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatState])

  // Clear the OTP resend timer on unmount
  useEffect(() => () => { if (otpTimerRef.current) clearInterval(otpTimerRef.current) }, [])

  // ── Rolling session: auto-logout after 30 minutes of inactivity ────
  // Timer resets on every user action (sliding). If the member returns before
  // 30 min, the clock restarts; 30 min of no activity logs them out automatically.
  const AUTO_LOGOUT_MS   = 30 * 60 * 1000
  const inactivityRef    = useRef(null)
  const lastActivityRef  = useRef(0)

  const doAutoLogout = useCallback(async () => {
    if (inactivityRef.current) { clearTimeout(inactivityRef.current); inactivityRef.current = null }
    // Clear client-side session state
    clearCache()
    cardRef.current    = null
    profileRef.current = null
    mobileRef.current  = ''
    epicRef.current    = ''
    try { localStorage.removeItem('bjp_referral') } catch { /* ignore */ }
    // Logout is client-side (stateless JWT): clearCache() already dropped the
    // token + cached session above.
    setSidebarOpen(false)
    setActiveView('chat')
    setMessages([])
    setChatState(S.WELCOME)
    addMsg('bot', 'text', { text: t('🔒 You have been logged out after 30 minutes of inactivity. Tap Start to continue.') })
    addMsg('bot', 'welcome_banner', {})
  // addMsg is a stable useCallback([]) declared later — referencing it in the
  // dep array here would hit the temporal dead zone at render (ReferenceError).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const armInactivityTimer = useCallback(() => {
    if (inactivityRef.current) clearTimeout(inactivityRef.current)
    inactivityRef.current = setTimeout(() => { doAutoLogout() }, AUTO_LOGOUT_MS)
  }, [doAutoLogout])

  // Track activity + arm the inactivity timer only while logged in (card shown).
  useEffect(() => {
    if (chatState !== S.DONE) return

    const onActivity = () => {
      const now = Date.now()
      if (now - lastActivityRef.current < 15000) return  // throttle to once / 15s
      lastActivityRef.current = now
      touchCache()
      armInactivityTimer()
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (!getCache()) { doAutoLogout(); return }  // expired while tab was hidden
      touchCache()
      armInactivityTimer()
    }
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    document.addEventListener('visibilitychange', onVisible)

    // Being on the logged-in screen counts as activity — start the clock.
    lastActivityRef.current = Date.now()
    touchCache()
    armInactivityTimer()

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity))
      document.removeEventListener('visibilitychange', onVisible)
      if (inactivityRef.current) { clearTimeout(inactivityRef.current); inactivityRef.current = null }
    }
  }, [chatState, armInactivityTimer, doAutoLogout])

  // ── Message helpers ───────────────────────────────────────
  const addMsg = useCallback((from, type, payload = {}) => {
    setMessages((prev) => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from, type, ...payload,
      ts: new Date(),
    }])
  }, [])

  const botSay = useCallback(async (text, delay = 500) => {
    setIsTyping(true)
    await sleep(delay)
    setIsTyping(false)
    addMsg('bot', 'text', { text })
  }, [addMsg])

  // ── Initialise ────────────────────────────────────────────
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    // Do NOT auto-prompt for notification permission on load. Just reflect the
    // current permission state on the bell icon; the user enables it by tapping
    // the bell (shown as "off" until granted).
    if ('Notification' in window) {
      setNotifPermission(Notification.permission)
    }

    const cache = getCache()
    if (cache?.card) {
      cardRef.current    = cache.card
      profileRef.current = cache.profile || {}
      epicRef.current    = cache.card.epic_no || ''
      // Note: mobile is NOT stored in localStorage for PII protection
      
      // Only warn "already registered / rescan" when a referral is present in the
      // CURRENT URL (i.e. they actually scanned someone's QR this visit).
      // Do NOT use getReferralParams() here — it falls back to a 24h localStorage
      // value, which caused a false "Already registered" on a plain revisit.
      const urlRef = hasReferralInUrl()
      if (urlRef) {
        addMsg('bot', 'text', { text: t('⚠️ *You are already registered!* Your schemes are active.') })
      } else {
        addMsg('bot', 'text', { text: t('👋 Welcome back to *Nalam Thittam!*') })
      }
      setTimeout(() => {
        const cachedRefLink = toFrontendReferralLink(cache.card.referral_link, cache.card.bjp_code)
        if (cachedRefLink) {
          addMsg('bot', 'referral_link', { link: cachedRefLink })
        }
        setChatState(S.DONE)
      }, 300)
    } else {
      addMsg('bot', 'welcome_banner', {})
      setChatState(S.WELCOME)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Flow handlers ─────────────────────────────────────────
  const handleStart = async () => {
    addMsg('user', 'text', { text: t('Start') })
    setChatState(S.AWAIT_MOBILE)
    await botSay(t('📱 Please enter your 10-digit mobile number to get started.'), 400)
  }

  const handleMobileSubmit = async () => {
    const mobile = inputValue.trim()
    if (!/^\d{10}$/.test(mobile)) {
      await botSay(t('❌ Please enter a valid 10-digit mobile number.'), 300)
      return
    }
    mobileRef.current = mobile
    addMsg('user', 'text', { text: maskMobile(mobile) })
    setInputValue('')

    setIsTyping(true)
    try {
      const res = await chat.sendOtp(mobile)
      setIsTyping(false)
      if (res?.success) {
        await botSay(t('📱 A 6-digit OTP has been sent to {mobile}. Please enter the OTP to verify.', { mobile: maskMobile(mobile) }), 300)
        setChatState(S.AWAIT_OTP)
        startOtpCountdown(60)
      } else {
        await botSay(t('❌ Could not send OTP. Please try again.'), 300)
      }
    } catch (err) {
      setIsTyping(false)
      await botSay(`❌ ${err?.message || t('Failed to send OTP. Please try again.')}`, 300)
    }
  }

  const handleOtpSubmit = async () => {
    const otp = inputValue.trim()
    if (!/^\d{6}$/.test(otp)) {
      await botSay(t('❌ Please enter the 6-digit OTP sent to your number.'), 300)
      return
    }
    const mobile = mobileRef.current
    addMsg('user', 'text', { text: '••••••' })   // never echo the OTP
    setInputValue('')
    setIsTyping(true)
    try {
      const res = await chat.verifyOtp(mobile, otp)
      setIsTyping(false)
      if (res.success && (res.has_card || res.isExistingUser || res.user)) {
        // Persist the JWT so subsequent protected calls (profile, my-members,
        // member-status) are authenticated as this member.
        if (res.token) localStorage.setItem('bjp_user_token', res.token)
        const u = res.user || {}
        const card = {
          epic_no:       res.epic_no || u.epicNo || '',
          voter_name:    res.voter_name || u.voterName || 'BJP Member',
          card_url:      res.card_url || '',
          back_url:      res.back_url || '',
          combined_url:  res.combined_url || res.card_url || '',
          photo_url:     res.photo_url || u.photo || '',
          bjp_code:      res.bjp_code || u.referralCode || '',
          referral_link: toFrontendReferralLink(res.referral_link, res.bjp_code || u.referralCode),
        }
        cardRef.current = card
        profileRef.current = u
        saveCache(card, u)
        if (res.referred_count !== undefined) {
          setReferredCount(res.referred_count)
        }
        if (card.bjp_code) {
          fetchMemberStatus(card.bjp_code)
        }
        await botSay(t('👋 Welcome back! Mobile number verified.'), 300)
        const refLink = toFrontendReferralLink(card.referral_link, card.bjp_code)
        if (refLink) {
          addMsg('bot', 'referral_link', { link: refLink })
        }
        setChatState(S.DONE)
        return
      }
      // Verified and no existing registration → start a new registration.
      await botSay(t('✅ Mobile verified! You are not registered yet — enter your EPIC Number (Voter ID) to continue.'), 300)
      await botSay(t('📋 Format: 3 letters + 7 digits  e.g. ABC1234567'), 200)
      setChatState(S.AWAIT_EPIC)
    } catch (err) {
      setIsTyping(false)
      // 400 = invalid/expired OTP, 429 = too many attempts
      await botSay(`❌ ${err?.message || t('Invalid OTP. Please try again.')}`, 300)
      // stay on AWAIT_OTP so the user can retry
    }
  }

  // Start / restart the resend cooldown (matches the backend's 60s cooldown).
  const startOtpCountdown = (sec = 60) => {
    if (otpTimerRef.current) clearInterval(otpTimerRef.current)
    setOtpResendIn(sec)
    otpTimerRef.current = setInterval(() => {
      setOtpResendIn((s) => {
        if (s <= 1) { clearInterval(otpTimerRef.current); otpTimerRef.current = null; return 0 }
        return s - 1
      })
    }, 1000)
  }

  const handleResendOtp = async () => {
    if (otpResendIn > 0 || isTyping) return
    const mobile = mobileRef.current
    if (!/^\d{10}$/.test(mobile || '')) return
    setIsTyping(true)
    try {
      const sent = await chat.sendOtp(mobile)
      setIsTyping(false)
      if (sent?.success) {
        await botSay(t('📨 A new OTP has been sent to {mobile}.', { mobile: maskMobile(mobile) }), 250)
        startOtpCountdown(60)
      } else {
        await botSay(t('❌ Could not resend OTP. Please try again shortly.'), 250)
      }
    } catch (e) {
      setIsTyping(false)
      // Backend enforces a 60s cooldown; if we're early it returns the wait time.
      const msg = e?.message || t('Could not resend OTP. Please try again.')
      const m = /(\d+)\s*s/.exec(msg)
      if (m) startOtpCountdown(Math.min(60, parseInt(m[1], 10)))
      await botSay(t('⏳ {message}', { message: msg }), 250)
    }
  }

  const handleEpicSubmit = async () => {
    const epic = inputValue.trim().toUpperCase()
    if (!/^[A-Z]{3}\d{7}$/.test(epic)) {
      await botSay(t('❌ Invalid format. Use 3 letters + 7 digits (e.g., ABC1234567).'), 300)
      return
    }
    epicRef.current = epic
    addMsg('user', 'text', { text: epic })
    setInputValue('')
    setIsTyping(true)
    try {
      const res = await chat.validateEpic(epic, mobileRef.current)
      setIsTyping(false)

      if (res.already_registered || res.card_url) {
        const card = {
          epic_no:     res.epic_no     || epic,
          voter_name:  res.voter_name  || '',
          card_url:    res.card_url    || '',
          back_url:    res.back_url    || '',
          combined_url: res.combined_url || '',
          photo_url:   res.photo_url   || '',
          bjp_code:    res.bjp_code    || res.ptc_code    || '',
          referral_link: toFrontendReferralLink(res.referral_link, res.bjp_code || res.ptc_code),
        }
        cardRef.current = card
        saveCache(card, {})
        if (card.bjp_code) {
          fetchMemberStatus(card.bjp_code)
        }
        await botSay(t('👋 Welcome back! Mobile number verified.'), 300)
        const refLink = toFrontendReferralLink(card.referral_link, card.bjp_code)
        if (refLink) {
          addMsg('bot', 'referral_link', { link: refLink })
        }
        setChatState(S.DONE)
        return
      }

      const voter = res.voter || res.data || res
      if (!voter || (!voter.name && !voter.Name && !voter.voter_name)) {
        throw new Error(t('Voter data not found in response'))
      }
      voterRef.current = voter
      await botSay(t('✅ Voter found! Please confirm your details:'), 200)
      addMsg('bot', 'voter_card', { voter })
      setChatState(S.CONFIRM)
    } catch (err) {
      setIsTyping(false)
      const data = err
      if (data?.already_registered || data?.card_url) {
        const card = {
          epic_no:     data.epic_no     || epic,
          voter_name:  data.voter_name  || '',
          card_url:    data.card_url    || '',
          back_url:    data.back_url    || '',
          combined_url: data.combined_url || '',
          photo_url:   data.photo_url   || '',
          bjp_code:    data.bjp_code    || data.ptc_code    || '',
          referral_link: toFrontendReferralLink(data.referral_link, data.bjp_code || data.ptc_code),
        }
        cardRef.current = card
        saveCache(card, {})
        await botSay(t('👋 Welcome back! Mobile number verified.'), 300)
        const refLink = toFrontendReferralLink(card.referral_link, card.bjp_code)
        if (refLink) {
          addMsg('bot', 'referral_link', { link: refLink })
        }
        setChatState(S.DONE)
        return
      }
      await botSay(`❌ ${err.message || t('EPIC not found in Voter DB. Please check and try again.')}`, 200)
    }
  }

  const handleConfirm = async () => {
    addMsg('user', 'text', { text: t('✓ Confirmed') })
    await botSay(t('🎯 Please select the Central Government schemes you are interested in applying for:'), 400)
    addMsg('bot', 'scheme_selection', {})
    setChatState(S.SELECT_SCHEMES)
  }

  const handleRetry = async () => {
    addMsg('user', 'text', { text: t('↩ Try Again') })
    epicRef.current = ''
    voterRef.current = null
    await botSay(t('📋 Please enter your EPIC Number again.'), 300)
    setChatState(S.AWAIT_EPIC)
  }

  const handleSchemesSubmit = async (selectedIds) => {
    const { ref } = referralRef.current
    addMsg('user', 'text', { text: t('{count} scheme(s) selected ✓', { count: selectedIds.length }) })
    setIsTyping(true)
    try {
      const res = await chat.registerSchemes({
        mobile: mobileRef.current,
        epicNo: epicRef.current,
        voterName: voterRef.current?.name || voterRef.current?.voter_name || voterRef.current?.VOTER_NAME || 'BJP Member',
        district: voterRef.current?.district || voterRef.current?.DISTRICT || 'TAMIL NADU',
        assemblyName: voterRef.current?.assembly || voterRef.current?.assembly_name || voterRef.current?.ASSEMBLY_NAME || 'Assembly',
        boothNo: voterRef.current?.part_no || voterRef.current?.booth_no || voterRef.current?.PART_NO || '1',
        gender: voterRef.current?.gender || voterRef.current?.GENDER || 'Unspecified',
        schemeIds: selectedIds,
        referredBy: ref || null
      })
      setIsTyping(false)
      const ntCode  = res.ntCode || res.nt_code || res.bjp_code || res.referral_code || ''
      const refLink = toFrontendReferralLink(res.referral_link, ntCode)
      if (ntCode) {
        cardRef.current = {
          epic_no: epicRef.current,
          voter_name: voterRef.current?.name || voterRef.current?.voter_name || 'BJP Member',
          bjp_code: ntCode,
          referral_link: refLink,
          selected_scheme_ids: selectedIds
        }
        saveCache(cardRef.current, profileRef.current || {})
      }
      try { localStorage.removeItem('bjp_referral') } catch (_) {}
      await botSay(t('🎉 Your scheme registration is complete!'), 300)
      if (refLink) {
        await sleep(500)
        addMsg('bot', 'referral_link', { link: refLink })
      }
      setChatState(S.DONE)
    } catch (err) {
      setIsTyping(false)
      await botSay(`❌ ${err.message || t('Registration failed. Please try again.')}`, 200)
      setChatState(S.SELECT_SCHEMES)
    }
  }

  // ── Sidebar actions ───────────────────────────────────────
  const handleSidebarAction = async (action) => {
    setSidebarOpen(false)
    if (action === 'my_schemes') {
      setActiveView('my_schemes')
      return
    }
    if (action === 'profile') {
      setActiveView('profile')
      return
    }
    if (action === 'my_members') {
      setActiveView('my_members')
      return
    }
    if (action === 'my_referrals') {
      setActiveView('my_referrals')
      return
    }
    setActiveView('chat')
    const bjpCode = cardRef.current?.bjp_code || cardRef.current?.ptc_code || profileRef.current?.bjp_code || profileRef.current?.ptc_code

    switch (action) {


      case 'referral': {
        if (!bjpCode) { await botSay('ℹ️ Referral link unavailable.', 200); return }
        // Use cached link from card if available — avoids a session-auth round-trip
        const cachedLink = cardRef.current?.referral_link
        if (cachedLink) {
          setActiveView('referral')
          break
        }
        setIsTyping(true)
        try {
          const res = await chat.getReferralLink(bjpCode)
          setIsTyping(false)
          const link = res.referral_link || res.link || res.url || ''
          // Cache it on the card ref for future sidebar clicks
          if (link && cardRef.current) cardRef.current.referral_link = link
          setActiveView('referral')
        } catch {
          setIsTyping(false)
          await botSay('❌ Unable to load referral link.', 200)
        }
        break
      }
      default: break
    }
  }

  const handleLogout = async () => {
    // 1. Clear all in-memory React state
    clearCache()                           // localStorage CACHE_KEY
    sessionStorage.clear()                 // any session-level cache
    mobileRef.current  = ''
    epicRef.current    = ''
    cardRef.current    = null
    profileRef.current = null
    voterRef.current   = null
    setSidebarOpen(false)
    setInputValue('')
    setMessages([])

    // 2. Drop any stored referral attribution so a refresh after logout does
    //    NOT keep showing the referral link. Only a fresh QR scan (which puts
    //    ?ref=&rid= back in the URL) should re-attach a referral.
    try { localStorage.removeItem('bjp_referral') } catch (_) {}

    // 3. Logout is client-side (stateless JWT) — token + cache already cleared.

    // 4. Reload to the CLEAN base URL (strip ?ref=&rid= query string) after a
    //    tiny delay — ensures a totally clean slate so no cached card / photo
    //    data or stale referral code bleeds into the next visit.
    setTimeout(() => {
      window.location.replace(window.location.origin + window.location.pathname)
    }, 300)
  }

  // ── Input config ──────────────────────────────────────────
  const getInputCfg = () => {
    switch (chatState) {
      case S.AWAIT_MOBILE:
        return { type: 'tel', placeholder: t('Enter 10-digit mobile number'), maxLength: 10, inputMode: 'numeric' }
      case S.AWAIT_OTP:
        return { type: 'tel', placeholder: t('Enter 6-digit OTP'), maxLength: 6, inputMode: 'numeric' }
      case S.AWAIT_EPIC:
        return { type: 'text', placeholder: t('EPIC Number (e.g. ABC1234567)'), maxLength: 10 }
      default:
        return null
    }
  }

  const getIsSendDisabled = () => {
    if (isTyping) return true
    const val = inputValue.trim()
    if (chatState === S.AWAIT_MOBILE) return val.length !== 10
    if (chatState === S.AWAIT_OTP) return val.length !== 6
    if (chatState === S.AWAIT_EPIC) return val.length !== 10
    return !val
  }

  const handleInputChange = (e) => {
    let val = e.target.value
    if (chatState === S.AWAIT_EPIC) {
      val = val.toUpperCase().replace(/[^A-Z0-9]/g, '')
      const letters = val.slice(0, 3).replace(/[^A-Z]/g, '')
      const digits  = val.slice(3).replace(/[^0-9]/g, '').slice(0, 7)
      val = letters + digits
    } else if (chatState === S.AWAIT_MOBILE) {
      val = val.replace(/\D/g, '')
    } else if (chatState === S.AWAIT_OTP) {
      val = val.replace(/\D/g, '').slice(0, 6)
    }
    if (sendHint) setSendHint('')   // clear the hint as soon as the user types
    setInputValue(val)
  }

  // Small transient bubble shown near the send button on invalid submit.
  const flashSendHint = (msg) => {
    setSendHint(msg)
    if (sendHintTimer.current) clearTimeout(sendHintTimer.current)
    sendHintTimer.current = setTimeout(() => setSendHint(''), 3000)
  }

  // Returns a validation message if the current field is invalid, else ''.
  const getFieldHint = () => {
    const val = inputValue.trim()
    if (chatState === S.AWAIT_MOBILE) {
      return /^\d{10}$/.test(val) ? '' : 'Please enter a 10-digit mobile number'
    }
    if (chatState === S.AWAIT_OTP) {
      return /^\d{6}$/.test(val) ? '' : 'Please enter the 6-digit OTP'
    }
    if (chatState === S.AWAIT_EPIC) {
      return /^[A-Z]{3}\d{7}$/.test(val) ? '' : 'Please enter a valid EPIC number (e.g. ABC1234567)'
    }
    return ''
  }

  const handleSubmit = async (e) => {
    e?.preventDefault()
    if (isTyping) return

    // Validate first — if invalid, show a small bubble instead of proceeding.
    const hint = getFieldHint()
    if (hint) {
      flashSendHint(hint)
      return
    }

    switch (chatState) {
      case S.AWAIT_MOBILE:   await handleMobileSubmit(); break
      case S.AWAIT_OTP:      await handleOtpSubmit(); break
      case S.AWAIT_EPIC:     await handleEpicSubmit(); break
      default: break
    }
  }

  // ── Render message content ────────────────────────────────
  const renderMsgContent = (msg) => {
    switch (msg.type) {
      case 'text': {
        // HTML-escape text before applying bold markdown to prevent XSS
        const escapeHtml = (s) => String(s || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
        const safeHtml = escapeHtml(msg.text || '').replace(/\*(.*?)\*/g, '<strong>$1</strong>')
        return <span dangerouslySetInnerHTML={{ __html: safeHtml }} />
      }
      case 'welcome_banner':
        return <WelcomeBannerMsg onStart={handleStart} />
      case 'voter_card': {
        const isLatest = messages[messages.length - 1]?.id === msg.id
        return (
          <VoterCardMsg
            voter={msg.voter}
            isLatest={isLatest}
            chatState={chatState}
            onConfirm={handleConfirm}
            onRetry={handleRetry}
            disabled={isTyping}
          />
        )
      }
      case 'scheme_selection': {
        const isLatest = messages[messages.length - 1]?.id === msg.id
        return (
          <SchemeSelectionMsg
            isLatest={isLatest && chatState === S.SELECT_SCHEMES}
            onSubmit={handleSchemesSubmit}
            disabled={isTyping}
          />
        )
      }
      case 'generated_card': {
        const cardRefLink = msg.card?.referral_link || (msg.card?.bjp_code ? `${window.location.origin}/r/${msg.card.bjp_code}` : '')
        return <ReferralLinkMsg link={cardRefLink} />
      }
      case 'profile_card':
        return (
          <div className="profile-card">
            {msg.profile?.photo_url && (
              <img src={msg.profile.photo_url} crossOrigin="anonymous" alt="Profile" className="profile-photo" />
            )}
            <div className="profile-details">
              <h4>{msg.profile?.name || 'Member'}</h4>
              <p>{[msg.profile?.assembly, msg.profile?.district].filter(Boolean).join(', ')}</p>
              {(msg.profile?.epic_no || epicRef.current) && <p>EPIC: {msg.profile?.epic_no || epicRef.current}</p>}
              {(msg.profile?.bjp_code || msg.profile?.ptc_code) && <p className="bjp">BJP: {msg.profile.bjp_code || msg.profile.ptc_code}</p>}
            </div>
          </div>
        )
      case 'referral_link':
        return <ReferralLinkMsg link={msg.link || ''} />
      case 'members_list': {
        const members = msg.members || []
        return (
          <div className="members-card info-card">
            <div className="info-card-header"><i className="bi bi-people-fill" /> {t('My Members')} ({members.length})</div>
            {members.length === 0 ? (
              <p className="members-empty">{t('No members yet. Share your referral link!')}</p>
            ) : (
              <ul className="members-list">
                {members.slice(0, 15).map((m, i) => (
                  <li key={i}>
                    <span>{m.name || m.Name || m.voter_name || 'Member'}</span>
                    <span style={{ opacity: 0.6, fontSize: 11 }}>{m.epic_no || m.EpicNo || ''}</span>
                  </li>
                ))}
                {members.length > 15 && <li style={{ opacity: 0.5, fontStyle: 'italic' }}>+{members.length - 15} more…</li>}
              </ul>
            )}
          </div>
        )
      }
      default:
        return <span>{msg.text || ''}</span>
    }
  }

  // ── Input area render ─────────────────────────────────────
  const inputCfg = getInputCfg()
  const isWide   = ['voter_card', 'generated_card', 'booth_info', 'referral_link', 'members_list', 'profile_card'].includes
  const isDone   = chatState === S.DONE

  // Cache-busting comment v1.0.5 to force new hash
  return (
    <div className="chatbot-app bjp-theme">
      {/* ── Main Layout ── */}
      <div className="main-content-layout single-layout">
        
        {/* Left Menu Panel (WhatsApp style) */}
        <div className="left-menu-panel">
          <div className="left-menu-header">
            <div className="left-menu-profile">
              <img src="/bjp_logo.svg" alt="BJP" onError={(e) => { e.target.style.display = 'none' }} />
              <div className="left-menu-profile-info">
                <div className="left-menu-brand">{t('BJP Nalam Thittam')}</div>
                <div className="left-menu-status">
                  <span className="status-dot-green" /> {t('Online')}
                </div>
              </div>
            </div>
            <div className="left-menu-header-actions" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>

              {isDone && (
                <button
                  className="chat-header-btn"
                  onClick={() => {
                    if (window.confirm(t('Logout and start over?'))) handleLogout()
                  }}
                  title={t('Logout')}
                  style={{ fontSize: 16 }}
                >
                  <i className="bi bi-box-arrow-right" />
                </button>
              )}
            </div>
          </div>



          <div className="left-chat-list">
            <div className="left-chat-item active">
              <div className="left-chat-avatar bot-avatar">
                <i className="bi bi-robot" />
              </div>
              <div className="left-chat-details">
                <div className="left-chat-name-row">
                  <span className="left-chat-name">{t('BJP TN Member Bot')}</span>
                  <span className="left-chat-time">{fmtTime(new Date())}</span>
                </div>
                <div className="left-chat-msg">
                  {!isDone ? t('Register for Central Government Schemes') : t('Registration completed successfully!')}
                </div>
              </div>
            </div>

            {[
              { icon: 'person-circle',  label: 'My Profile',              action: 'profile',     desc: 'View your registration details' },
              { icon: 'check2-all',     label: 'My Schemes',              action: 'my_schemes',  desc: 'Schemes you registered for' },
              { icon: 'link-45deg',     label: 'Referral Link',           action: 'referral',    desc: 'Share and invite others' },
              { icon: 'people-fill',    label: 'My Referrals',            action: 'my_referrals',desc: 'Members you referred' },
            ].map((item) => {
              const locked = !isDone
              return (
                <div
                  key={item.action}
                  className={`left-chat-item option-item ${locked ? 'locked' : ''}`}
                  role="button"
                  tabIndex={locked ? -1 : 0}
                  aria-disabled={locked}
                  onClick={() => !locked && handleSidebarAction(item.action)}
                  onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !locked) { e.preventDefault(); handleSidebarAction(item.action) } }}
                  title={locked ? t('Complete registration to unlock') : t(item.desc)}
                >
                  <div className="left-chat-avatar option-avatar">
                    <i className={`bi bi-${item.icon}`} />
                  </div>
                  <div className="left-chat-details">
                    <div className="left-chat-name-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span className="left-chat-name">{t(item.label)}</span>
                      </div>
                      {locked && <i className="bi bi-lock-fill lock-icon" />}
                    </div>
                    <div className="left-chat-msg">{t(item.desc)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Chatbot Panel */}
        <div className="right-chat-panel">
          {activeView === 'my_schemes' ? (
            <MySchemePanel
              epicNo={epicRef.current || cardRef.current?.epic_no || profileRef.current?.epic_no}
              mobile={mobileRef.current || cardRef.current?.mobile || profileRef.current?.mobile}
              onBack={() => setActiveView('chat')}
            />
          ) : activeView === 'profile' ? (
            <FullProfilePanel 
              epicNo={epicRef.current || cardRef.current?.epic_no || profileRef.current?.epic_no} 
              mobile={mobileRef.current || cardRef.current?.mobile || profileRef.current?.mobile} 
              referredCount={referredCount} 
              onBack={() => setActiveView('chat')} 
            />
          ) : activeView === 'referral' ? (
            <FullReferralPanel
              link={toFrontendReferralLink(cardRef.current?.referral_link, cardRef.current?.bjp_code)}
              onBack={() => setActiveView('chat')}
            />
          ) : activeView === 'my_members' || activeView === 'my_referrals' ? (
            <MyReferralsListPanel 
              bjpCode={cardRef.current?.bjp_code || cardRef.current?.ptc_code || profileRef.current?.bjp_code || profileRef.current?.ptc_code}
              onBack={() => setActiveView('chat')} 
            />
          ) : (
            <div className="chatbot-container">


            {/* Header */}
            <header className="chat-header">
              <div
                className="chat-header-avatar"
                onClick={() => isDone && handleSidebarOpen()}
              >
                <img src="/bjp_logo.svg" alt="BJP" onError={(e) => { e.target.style.display = 'none' }} />
              </div>
              <div className="chat-header-info">
                <div className="chat-header-name">{t('BJP Nalam Thittam')}</div>
                <div className="chat-header-status">
                  {isDone ? (
                    <><span className="status-dot-green" /> {t('Online')}</>
                  ) : (
                    <><span className="status-dot-green" /> {t('Registration in progress')}</>
                  )}
                </div>
              </div>
              <div className="chat-header-actions" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>

                {isDone && (
                  <button
                    className="chat-header-btn"
                    onClick={handleSidebarOpen}
                    title="Menu"
                  >
                    <i className="bi bi-list" />
                  </button>
                )}
              </div>
            </header>

            {/* Messages */}
            <main className="chat-messages">
              {messages.map((msg) => {
                return (
                  <div
                    key={msg.id}
                    className={`msg-row ${msg.from}`}
                  >
                    <div className="msg-avatar" aria-hidden="true">
                      {msg.from === 'bot'
                        ? <img src="/bjp_logo.svg" alt="BJP" onError={(e) => { e.target.onerror = null; e.target.src = '/bjp_logo.png' }} />
                        : <i className="bi bi-person-fill" />}
                    </div>
                    <div className={`msg-bubble ${['voter_card','generated_card','booth_info','referral_link','members_list','profile_card','welcome_banner','welcome_letter','appreciation_letter'].includes(msg.type) ? 'wide' : ''}`}>
                      {renderMsgContent(msg)}
                      <div className="msg-time">
                        {fmtTime(msg.ts)}
                      </div>
                    </div>
                  </div>
                )
              })}

              {isTyping && (
                <div className="msg-row bot">
                  <div className="msg-avatar" aria-hidden="true">
                    <img src="/bjp_logo.svg" alt="BJP" onError={(e) => { e.target.onerror = null; e.target.src = '/bjp_logo.png' }} />
                  </div>
                  <div className="typing-bubble" role="status" aria-label={t('Bot is typing')}>
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} style={{ height: 8 }} />
            </main>

            {/* Resend OTP bar (only during OTP entry) */}
            {chatState === S.AWAIT_OTP && (
              <div className="otp-resend-bar">
                {otpResendIn > 0 ? (
                  <span className="otp-resend-wait">
                    <i className="bi bi-clock-history" /> {t('Resend OTP in {seconds}s', { seconds: otpResendIn })}
                  </span>
                ) : (
                  <button type="button" className="otp-resend-btn" onClick={handleResendOtp} disabled={isTyping}>
                    <i className="bi bi-arrow-clockwise" /> {t('Resend OTP')}
                  </button>
                )}
              </div>
            )}

            {/* Input area — only render when there is something to show, so the
                WELCOME / CONFIRM / SELECT_SCHEMES states don't leave an empty
                input bar (white gap) at the bottom. */}
            {(isDone || inputCfg) && (
            <footer className="chat-input-area">
              {isDone && !inputCfg ? (
                <div className="chat-form done-bar">
                  <div className="chat-input-wrapper">
                    <span className="done-status">
                      <i className="bi bi-shield-fill-check text-success" />
                      {t('Registration Successful')}
                    </span>
                  </div>
                  <button className="chat-send-btn menu-btn" onClick={handleSidebarOpen} title={t('Menu')} style={{ position: 'relative' }}>
                    <i className="bi bi-grid-3x3-gap-fill" />
                  </button>
                </div>
              ) : inputCfg ? (
                <form className="chat-form" onSubmit={handleSubmit} style={{ position: 'relative' }}>
                  {sendHint && (
                    <div className="send-hint-bubble" role="status">
                      {sendHint}
                    </div>
                  )}
                  <div className="chat-input-wrapper">
                    <input
                      className="chat-input"
                      value={inputValue}
                      onChange={handleInputChange}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
                      placeholder={inputCfg.placeholder}
                      aria-label={inputCfg.placeholder}
                      type={inputCfg.type}
                      maxLength={inputCfg.maxLength}
                      inputMode={inputCfg.inputMode}
                      autoComplete="off"
                      disabled={isTyping}
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    className={`chat-send-btn${getIsSendDisabled() ? ' not-ready' : ''}`}
                    aria-label={t('Send')}
                    title={t('Send')}
                  >
                    <i className="bi bi-send-fill" />
                  </button>
                </form>
              ) : null}
            </footer>
            )}
          </div>
          )}
        </div>
      </div>

      {/* ── Sidebar ── */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)}>
          <div className="sidebar-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sidebar-header" style={{ position: 'relative' }}>
              <img src="/bjp_logo.svg" alt="BJP" className="sidebar-logo"
                onError={(e) => { e.target.src = '/bjp_logo.png' }} />
              <div>
                <div className="sidebar-brand">{t('BJP TAMIL NADU')}</div>
                <div className="sidebar-tagline">{t('Nation First. Party Next. Self Last.')}</div>
              </div>
              <button 
                onClick={() => setSidebarOpen(false)}
                style={{
                  position: 'absolute',
                  top: '50%',
                  right: 16,
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-ash)',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10
                }}
                aria-label={t('Close sidebar')}
              >
                <i className="bi bi-x" />
              </button>
            </div>
            <nav className="sidebar-nav">
              {[
                { icon: 'person-circle',       label: 'My Profile',              action: 'profile' },
                { icon: 'check2-all',          label: 'My Schemes',              action: 'my_schemes' },
                { icon: 'link-45deg',          label: 'Referral Link',           action: 'referral' },
                { icon: 'people-fill',         label: 'My Referrals',            action: 'my_referrals' },
              ].map((item) => {
                return (
                  <button
                    key={item.action}
                    className="sidebar-nav-item"
                    onClick={() => handleSidebarAction(item.action)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <i className={`bi bi-${item.icon}`} />
                        <span>{t(item.label)}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </nav>
            <div className="sidebar-footer">
              <button className="sidebar-logout-btn" onClick={handleLogout}>
                <i className="bi bi-box-arrow-left" /> {t('Logout')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
