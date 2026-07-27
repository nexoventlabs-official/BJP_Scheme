import React, { useState, useEffect, useRef, useCallback } from 'react'
import QRCode from 'qrcode'
import { useNavigate } from 'react-router-dom'
import { chat, publicApi } from '../api'
import { FlipCard3D } from '../components/FlipCard3D'
import '../styles/chatbot.css'
import { useLang } from '../i18n/LanguageContext'

// ── Read referral params from landing URL (?ref=NT-XXXX)
const getReferralParams = () => {
  try {
    const p = new URLSearchParams(window.location.search)
    const ref = (p.get('ref') || '').trim().toUpperCase()
    if (/^NT-[0-9A-F]{8}$/.test(ref)) {
      return { ref }
    }
    // localStorage fallback — valid for 24 hours
    const stored = localStorage.getItem('bjp_referral')
    if (stored) {
      const data = JSON.parse(stored)
      if (data && Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
        const storedRef = (data.ntCode || '').trim().toUpperCase()
        if (/^NT-[0-9A-F]{8}$/.test(storedRef)) {
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
    return /^NT-[0-9A-F]{8}$/.test(ref)
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
// Rolling 1-hour session: the cached login is valid for 1h from the LAST
// activity. Every user action refreshes `timestamp` (see touchCache), so an
// active member stays logged in; 1h of inactivity expires it (auto-logout).
const CACHE_TTL = 60 * 60 * 1000   // 1 hour

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

const clearCache = () => localStorage.removeItem(CACHE_KEY)

const maskMobile = (m) => m ? m.slice(0, 5) + 'XXXXX' : ''

const getDownloadUrl = (url, epicNo) => {
  if (url && url.includes('/upload/')) {
    return url.replace('/upload/', `/upload/fl_attachment:${epicNo}_BJP_Card/`)
  }
  return url
}

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

// ── Crop Modal ──────────────────────────────────────────────
function CropModal({ src, onCrop, onCancel }) {
  const { t } = useLang()
  const imgRef = useRef(null)
  const cropperRef = useRef(null)

  useEffect(() => {
    if (!imgRef.current || !src) return
    const img = imgRef.current

    const initCropper = () => {
      cropperRef.current = new Cropper(img, {
        aspectRatio: 268 / 384,
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 0.9,
        responsive: true,
        background: false,
        guides: true,
        center: true,
      })
    }

    if (img.complete) {
      initCropper()
    } else {
      img.onload = initCropper
    }

    return () => {
      cropperRef.current?.destroy()
      cropperRef.current = null
    }
  }, [src])

  const handleCrop = () => {
    if (!cropperRef.current) return
    cropperRef.current.getCroppedCanvas({ width: 536, height: 768, imageSmoothingQuality: 'high' })
      .toBlob((blob) => onCrop(blob), 'image/jpeg', 0.93)
  }

  return (
    <div className="crop-overlay">
      <div className="crop-modal">
        <div className="crop-modal-header">
          <h5><i className="bi bi-crop" /> {t('Crop Your Photo')}</h5>
          <button className="crop-close-btn" onClick={onCancel}><i className="bi bi-x-lg" /></button>
        </div>
        <div className="crop-modal-body">
          <img ref={imgRef} src={src} alt="Crop preview" style={{ display: 'block', maxWidth: '100%' }} />
        </div>
        <div className="crop-modal-footer">
          <span className="crop-hint"><i className="bi bi-info-circle" /> {t('Drag to adjust. Aspect ratio 2.68:3.84.')}</span>
          <button className="btn btn-sm btn-outline-secondary" onClick={onCancel}>{t('Cancel')}</button>
          <button className="btn btn-sm btn-danger" onClick={handleCrop}>
            <i className="bi bi-check-lg" /> {t('Use Photo')}
          </button>
        </div>
      </div>
    </div>
  )
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
        <p>{t("You are joining the world's leading political organization. Click below to generate your personalized Member Card.")}</p>
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
              const isSelected = selected.has(scheme.id)
              return (
                <div
                  key={scheme.id}
                  onClick={() => toggle(scheme.id)}
                  style={{
                    padding: '8px 7px',
                    background: isSelected ? 'rgba(250,93,0,0.08)' : 'var(--color-carbon)',
                    border: `1.5px solid ${isSelected ? 'var(--color-signal-mint)' : 'var(--color-graphite)'}`,
                    borderRadius: 8,
                    cursor: submitted || !isLatest ? 'default' : 'pointer',
                    transition: 'all 0.15s',
                    opacity: submitted && !isSelected ? 0.4 : 1,
                    display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start'
                  }}
                >
                  {/* Icon + checkbox row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <span style={{ fontSize: 18, lineHeight: 1 }}>{scheme.icon}</span>
                    <div style={{
                      width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                      background: isSelected ? 'var(--color-signal-mint)' : 'transparent',
                      border: `1.5px solid ${isSelected ? 'var(--color-signal-mint)' : 'var(--color-graphite)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s'
                    }}>
                      {isSelected && <i className="bi bi-check" style={{ fontSize: 8, color: '#fff', lineHeight: 1 }} />}
                    </div>
                  </div>
                  {/* Scheme name — English only, abbreviated */}
                  <div style={{
                    fontSize: 10, fontWeight: 700,
                    color: isSelected ? 'var(--color-signal-mint)' : 'var(--color-chalk)',
                    lineHeight: 1.3,
                    overflow: 'hidden', display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
                  }}>
                    {scheme.name_en.replace(/^[A-Z]+\s*—\s*/, '')}
                  </div>
                  {/* Benefit + info row */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', width: '100%', gap: 2 }}>
                    <div style={{
                      fontSize: 9, color: 'var(--color-ash)', lineHeight: 1.3, flex: 1,
                      overflow: 'hidden', display: '-webkit-box',
                      WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
                    }}>
                      {scheme.benefit_en}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setInfoScheme(scheme) }}
                      style={{
                        flexShrink: 0, background: 'none', border: 'none',
                        color: 'var(--color-ash)', cursor: 'pointer',
                        padding: '0 0 0 2px', fontSize: 11, lineHeight: 1,
                        display: 'flex', alignItems: 'center',
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
          const titlesList = [];

          apps.forEach(app => {
            const sName = app.schemeName || app.schemeId;
            const match = SCHEMES.find(sch => sch.title === sName || sch.id === Number(sName) || sch.title?.includes(sName));
            if (match) {
              updatedMap[match.id] = 'applied';
              titlesList.push(match.title);
            }
          });

          setApplyStatus(updatedMap);
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

  const handleConfirmSubmit = async () => {
    if (!selectedSchemeForModal) return;
    const scheme = selectedSchemeForModal;
    setIsSubmitting(true);

    const activeEpic = epicNo || epicRef.current || cardRef.current?.epic_no || profileRef.current?.epic_no || localStorage.getItem('bjp_user_epic') || '';
    const activeMobile = mobile || mobileRef.current || cardRef.current?.mobile || profileRef.current?.mobile || localStorage.getItem('bjp_user_mobile') || '';
    const userObj = cardRef.current || profileRef.current || {};

    try {
      await chat.registerSchemes({
        mobile: activeMobile,
        epicNo: activeEpic,
        voterName: userObj.voter_name || userObj.voterName || 'BJP Member',
        district: userObj.district || 'TAMIL NADU',
        assemblyName: userObj.assembly_name || userObj.assemblyName || 'Assembly',
        boothNo: userObj.part_no || userObj.boothNo || '1',
        schemeIds: [scheme.title]
      });
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
                  const isExpanded = expandedId === scheme.id;
                  return (
                    <div 
                      key={scheme.id} 
                      className="scheme-card"
                      style={{ border: '1px solid rgba(46,204,113,0.3)', background: 'rgba(46,204,113,0.03)' }}
                      onClick={() => setExpandedId(isExpanded ? null : scheme.id)}
                    >
                      <div className="scheme-card-header">
                        <div>
                          <div className="scheme-meta-cat" style={{ color: '#2ecc71' }}>{t(scheme.category)}</div>
                          <h3 className="scheme-title">{scheme.id}. {scheme.title}</h3>
                        </div>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          background: '#27ae60',
                          color: '#fff',
                          padding: '4px 12px',
                          borderRadius: 20,
                          fontSize: 11,
                          fontWeight: 700
                        }}>
                          <i className="bi bi-check-circle-fill" /> {t('Applied ✓')}
                        </span>
                      </div>

                      {scheme.highlight && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#FF9933', marginTop: 4 }}>
                          ⚡ {scheme.highlight}
                        </div>
                      )}

                      <p className="scheme-overview" style={{ marginTop: 6 }}>{scheme.overview}</p>

                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10 }}>
                        <button className="scheme-toggle-btn" onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : scheme.id); }}>
                          <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`} />
                          <span>{isExpanded ? t('Hide Details') : t('View Details')}</span>
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="scheme-details-expanded" onClick={(e) => e.stopPropagation()}>
                          <div>
                            <div className="details-section-title">
                              <i className="bi bi-info-circle-fill" /> {t('Eligibility & Benefits')}
                            </div>
                            <p className="details-text">{scheme.eligibility}</p>
                          </div>
                          <div>
                            <div className="details-section-title">
                              <i className="bi bi-file-earmark-check-fill" /> {t('Required Documents')}
                            </div>
                            <div className="documents-list">
                              {scheme.documents.map((doc, idx) => (
                                <div key={idx} className="doc-item">
                                  <i className="bi bi-check-circle-fill" />
                                  <span>{doc}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
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
                  return (
                    <div 
                      key={scheme.id} 
                      className="scheme-card"
                      onClick={() => setExpandedId(isExpanded ? null : scheme.id)}
                    >
                      <div className="scheme-card-header">
                        <div>
                          <div className="scheme-meta-cat">{t(scheme.category)}</div>
                          <h3 className="scheme-title">{scheme.id}. {scheme.title}</h3>
                        </div>
                        {scheme.highlight && <span className="scheme-badge">{scheme.highlight}</span>}
                      </div>

                      <div className="scheme-tags-row">
                        {scheme.tags.map((tItem, idx) => (
                          <span key={idx} className="scheme-tag">{tItem}</span>
                        ))}
                      </div>

                      <p className="scheme-overview">{scheme.overview}</p>

                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                        <button className="scheme-toggle-btn" onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : scheme.id); }}>
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
                            padding: '6px 16px',
                            borderRadius: 10,
                            fontWeight: 700,
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 12,
                            transition: 'all 0.15s',
                            boxShadow: '0 2px 8px rgba(46, 204, 113, 0.25)'
                          }}
                        >
                          <i className="bi bi-send-check-fill" />
                          {t('Apply Now')}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="scheme-details-expanded" onClick={(e) => e.stopPropagation()}>
                          <div>
                            <div className="details-section-title">
                              <i className="bi bi-info-circle-fill" /> {t('Eligibility & Benefits')}
                            </div>
                            <p className="details-text">{scheme.eligibility}</p>
                          </div>

                          <div>
                            <div className="details-section-title">
                              <i className="bi bi-file-earmark-check-fill" /> {t('Required Documents')}
                            </div>
                            <div className="documents-list">
                              {scheme.documents.map((doc, idx) => (
                                <div key={idx} className="doc-item">
                                  <i className="bi bi-check-circle-fill" />
                                  <span>{doc}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
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

// ── Scheme Application Status View ──────────────────────────
const STATUS_META = {
  submitted:          { label: 'Submitted',           color: '#fa5d00', icon: 'send-check-fill',           bg: 'rgba(250,93,0,0.08)',    border: 'rgba(250,93,0,0.3)' },
  under_review:       { label: 'Under Review',         color: '#3498db', icon: 'hourglass-split',           bg: 'rgba(52,152,219,0.08)',  border: 'rgba(52,152,219,0.3)' },
  documents_required: { label: 'Documents Required',   color: '#f39c12', icon: 'exclamation-triangle-fill', bg: 'rgba(243,156,18,0.08)',  border: 'rgba(243,156,18,0.3)' },
  approved:           { label: 'Approved',             color: '#2ecc71', icon: 'check-circle-fill',          bg: 'rgba(46,204,113,0.08)',  border: 'rgba(46,204,113,0.3)' },
  rejected:           { label: 'Rejected',             color: '#e74c3c', icon: 'x-circle-fill',              bg: 'rgba(231,76,60,0.08)',   border: 'rgba(231,76,60,0.3)' },
}
const STAGE_ORDER = { submitted: 0, under_review: 1, documents_required: 2, approved: 2, rejected: 2 }

function SchemeStatusView({ scheme, ntCode, onBack }) {
  // TEMP: hardcoded status — replace with GET /api/scheme-status/:ntCode/:schemeId
  const status = 'submitted'
  const updatedAt = null
  const bpNotes = ''

  if (!scheme) return null
  const name = scheme.name_en.replace(/^[A-Z]+\s*—\s*/, '')
  const meta = STATUS_META[status] || STATUS_META.submitted
  const currentStage = STAGE_ORDER[status] ?? 0

  const stages = [
    { key: 'submitted',    label: 'Application Submitted', desc: 'Your application has been received and recorded.' },
    { key: 'under_review', label: 'Under Review',          desc: 'Your Booth President is reviewing your application.' },
    { key: 'decision',     label: status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : status === 'documents_required' ? 'Documents Required' : 'Decision', desc: status === 'approved' ? 'Approved by your Booth President.' : status === 'rejected' ? 'Rejected. Contact your Booth President for details.' : status === 'documents_required' ? 'Additional documents required. Contact your Booth President.' : 'Awaiting final decision by Booth President.' },
  ]

  const stageState = (i) => i < currentStage ? 'done' : i === currentStage ? 'active' : 'pending'
  const stageDotColor = (i) => {
    const s = stageState(i)
    if (s === 'done') return '#2ecc71'
    if (s === 'active') return i === 2 ? meta.color : '#fa5d00'
    return 'rgba(0,0,0,0.12)'
  }

  const backBtnStyle = { background: 'none', border: 'none', color: 'var(--color-ash)', cursor: 'pointer', padding: '4px 8px 4px 0', fontSize: 18, display: 'flex', alignItems: 'center' }

  return (
    <div className="chatbot-container brochure-panel">
      <header className="brochure-header">
        <div className="brochure-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={backBtnStyle} onMouseEnter={e => e.currentTarget.style.color = 'var(--color-chalk)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--color-ash)'} aria-label="Back">
            <i className="bi bi-chevron-left" />
          </button>
          <span style={{ fontSize: 20 }}>{scheme.icon}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-chalk)' }}>{name}</div>
            <div style={{ fontSize: 10, color: 'var(--color-ash)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{scheme.cluster}</div>
          </div>
        </div>
      </header>
      <div className="brochure-content">
        <div style={{ padding: '20px 16px' }}>

          {/* Status badge */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 10, color: 'var(--color-ash)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Application Status</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: meta.bg, border: `1.5px solid ${meta.border}`, borderRadius: 20, padding: '8px 18px', fontSize: 13, fontWeight: 700, color: meta.color }}>
              <i className={`bi bi-${meta.icon}`} style={{ fontSize: 15 }} />
              {meta.label}
            </div>
          </div>

          {/* Timeline */}
          <div style={{ padding: '0 4px' }}>
            {stages.map((stage, i) => {
              const s = stageState(i)
              const dotColor = stageDotColor(i)
              const isLast = i === stages.length - 1
              return (
                <div key={stage.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, paddingTop: 2 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: s !== 'pending' ? dotColor : 'transparent', border: `2px solid ${dotColor}`, flexShrink: 0 }}>
                      {s === 'done' && <i className="bi bi-check" style={{ fontSize: 11, color: '#fff', lineHeight: 1 }} />}
                      {s === 'active' && <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor }} />}
                    </div>
                    {!isLast && <div style={{ width: 2, height: 32, background: s === 'done' ? '#2ecc71' : 'rgba(0,0,0,0.1)', marginTop: 2, marginBottom: 2 }} />}
                  </div>
                  <div style={{ flex: 1, paddingBottom: isLast ? 0 : 4 }}>
                    <div style={{ fontSize: 13, fontWeight: s === 'pending' ? 400 : 600, color: s === 'pending' ? 'var(--color-ash)' : (i === 2 && s === 'active' ? meta.color : 'var(--color-chalk)'), marginBottom: s !== 'pending' ? 3 : 28 }}>
                      {stage.label}
                    </div>
                    {s !== 'pending' && (
                      <div style={{ fontSize: 11, color: 'var(--color-ash)', lineHeight: 1.5, marginBottom: 12 }}>
                        {stage.desc}
                        {s === 'active' && updatedAt && (
                          <span style={{ display: 'block', marginTop: 2, fontWeight: 500 }}>
                            {new Date(updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* BP notes */}
          {bpNotes ? (
            <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(250,93,0,0.05)', border: '1px solid rgba(250,93,0,0.2)', borderRadius: 8, borderLeft: '3px solid var(--color-signal-mint)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-ash)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Note from Booth President</div>
              <div style={{ fontSize: 12, color: 'var(--color-chalk)', lineHeight: 1.5 }}>{bpNotes}</div>
            </div>
          ) : status === 'submitted' && (
            <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(0,0,0,0.03)', borderRadius: 8, fontSize: 12, color: 'var(--color-ash)', lineHeight: 1.5, textAlign: 'center' }}>
              ⏳ Awaiting review by your Booth President
            </div>
          )}

          {/* Reference */}
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--color-ash)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Application Reference</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-chalk)', fontFamily: 'monospace', letterSpacing: '0.05em' }}>{ntCode || '—'}</div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Add More Schemes Panel ──────────────────────────────────
function AddSchemesPanel({ registeredIds = [], onSubmit, onBack }) {
  const { t } = useLang()
  const available = NT_SCHEMES.filter(s => !registeredIds.includes(s.id))
  const [selected, setSelected] = useState(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [infoScheme, setInfoScheme] = useState(null)
  const clusters = [...new Set(available.map(s => s.cluster))]

  const toggle = (id) => {
    if (submitted) return
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const handleSubmit = () => {
    if (selected.size === 0 || submitted) return
    setSubmitted(true)
    onSubmit([...selected])
  }

  const backBtnStyle = { background: 'none', border: 'none', color: 'var(--color-ash)', cursor: 'pointer', padding: '4px 8px 4px 0', fontSize: 18, display: 'flex', alignItems: 'center' }

  if (available.length === 0) return (
    <div className="chatbot-container brochure-panel">
      <header className="brochure-header">
        <div className="brochure-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={backBtnStyle} onMouseEnter={e => e.currentTarget.style.color = 'var(--color-chalk)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--color-ash)'} aria-label="Back"><i className="bi bi-chevron-left" /></button>
          <i className="bi bi-plus-circle brochure-title-orange" />
          <span>Add More Schemes</span>
        </div>
      </header>
      <div className="brochure-content">
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--color-ash)' }}>
          <i className="bi bi-award-fill" style={{ fontSize: 40, display: 'block', marginBottom: 12, color: 'var(--color-signal-mint)' }} />
          <div style={{ fontWeight: 600, color: 'var(--color-chalk)', marginBottom: 6 }}>You've applied for all schemes!</div>
          <div style={{ fontSize: 12 }}>All 23 central government schemes have been added to your registration.</div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="chatbot-container brochure-panel">
      {infoScheme && <SchemeInfoModal scheme={infoScheme} onClose={() => setInfoScheme(null)} />}
      <header className="brochure-header">
        <div className="brochure-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={backBtnStyle} onMouseEnter={e => e.currentTarget.style.color = 'var(--color-chalk)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--color-ash)'} aria-label="Back"><i className="bi bi-chevron-left" /></button>
          <i className="bi bi-plus-circle brochure-title-orange" />
          <span>Add More Schemes</span>
        </div>
      </header>
      <div className="brochure-content">
        <div style={{ padding: '12px 0 0' }}>
          <div style={{ fontSize: 12, color: 'var(--color-ash)', marginBottom: 12, paddingLeft: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="bi bi-check2-square" style={{ color: 'var(--color-signal-mint)' }} />
            {selected.size > 0
              ? <span style={{ color: 'var(--color-signal-mint)', fontWeight: 600 }}>{selected.size} selected</span>
              : <span>{available.length} scheme(s) available to add</span>}
          </div>

          {clusters.map(cluster => (
            <div key={cluster} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-ash)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, paddingLeft: 7, borderLeft: '3px solid var(--color-signal-mint)' }}>
                {cluster}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
                {available.filter(s => s.cluster === cluster).map(scheme => {
                  const isSelected = selected.has(scheme.id)
                  return (
                    <div key={scheme.id} onClick={() => toggle(scheme.id)} style={{ padding: '8px 7px', background: isSelected ? 'rgba(250,93,0,0.08)' : 'var(--color-carbon)', border: `1.5px solid ${isSelected ? 'var(--color-signal-mint)' : 'var(--color-graphite)'}`, borderRadius: 8, cursor: submitted ? 'default' : 'pointer', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span style={{ fontSize: 18, lineHeight: 1 }}>{scheme.icon}</span>
                        <div style={{ width: 14, height: 14, borderRadius: 4, flexShrink: 0, background: isSelected ? 'var(--color-signal-mint)' : 'transparent', border: `1.5px solid ${isSelected ? 'var(--color-signal-mint)' : 'var(--color-graphite)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {isSelected && <i className="bi bi-check" style={{ fontSize: 8, color: '#fff', lineHeight: 1 }} />}
                        </div>
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: isSelected ? 'var(--color-signal-mint)' : 'var(--color-chalk)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {scheme.name_en.replace(/^[A-Z]+\s*—\s*/, '')}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', width: '100%', gap: 2 }}>
                        <div style={{ fontSize: 9, color: 'var(--color-ash)', lineHeight: 1.3, flex: 1, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{scheme.benefit_en}</div>
                        <button onClick={e => { e.stopPropagation(); setInfoScheme(scheme) }} style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--color-ash)', cursor: 'pointer', padding: '0 0 0 2px', fontSize: 11, lineHeight: 1, display: 'flex', alignItems: 'center' }} title="Learn more" aria-label={`Info: ${scheme.name_en}`}>
                          <i className="bi bi-info-circle" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {!submitted ? (
            <button onClick={handleSubmit} disabled={selected.size === 0} style={{ width: '100%', padding: '13px 20px', marginTop: 6, background: selected.size === 0 ? 'rgba(250,93,0,0.25)' : 'var(--color-signal-mint)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: selected.size === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <i className="bi bi-plus-circle" />
              {selected.size > 0 ? `Add ${selected.size} Scheme(s) to My Registration` : 'Select Schemes to Add'}
            </button>
          ) : (
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-ash)', padding: '10px 0', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
              <div style={{ width: 14, height: 14, border: '2px solid var(--color-graphite)', borderTopColor: 'var(--color-signal-mint)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Adding schemes to your registration...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function GeneratedCardMsg({ card, isNew = false }) {  const c = card || {}
  const [fullCardData, setFullCardData] = useState(null)

  useEffect(() => {
    if (!c) return;
    const hasName = c.name || c.voter_name || c.VOTER_NAME;
    const hasAssembly = c.assembly_name || c.assembly || c.ASSEMBLY_NAME;
    if (hasName && hasAssembly) {
      setFullCardData(c)
    } else if ((c.epic_no || c.bjp_code) && publicApi && typeof publicApi.getCardData === 'function') {
      publicApi.getCardData(c.bjp_code || c.epic_no)
        .then((data) => setFullCardData(data?.user || data || c))
        .catch(() => setFullCardData(c))
    } else {
      setFullCardData(c)
    }
  }, [c])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: '4px 0' }}>
      {fullCardData ? (
        <FlipCard3D
          cardData={fullCardData}
          backUrl={c.back_url || fullCardData.back_url}
          width={Math.min(310, (typeof window !== 'undefined' ? window.innerWidth : 360) - 96)}
          autoFlip={isNew}
          showActions={false}
          showDownloadIcon={true}
          onCardClick={() => window.dispatchEvent(new CustomEvent('show-card-modal', { detail: fullCardData }))}
        />
      ) : (
        <div className="card-skeleton">
          <style>{`
            .card-skeleton {
              background: #f9f8f6;
              width: 300px;
              height: 190px;
              border-radius: 12px;
              padding: 16px;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              border: 1px solid rgba(0, 0, 0, 0.08);
              overflow: hidden;
            }

            @keyframes pulse {
              0%, 100% { opacity: 0.8; }
              50% { opacity: 0.4; }
            }

            .skeleton-logo,
            .skeleton-line,
            .skeleton-photo,
            .skeleton-qr {
              background: rgba(0, 0, 0, 0.08);
              border-radius: 4px;
              animation: pulse 1.5s infinite ease-in-out;
            }

            .skeleton-header {
              display: flex;
              align-items: center;
              gap: 12px;
              height: 32px;
            }

            .skeleton-logo {
              width: 28px;
              height: 28px;
              border-radius: 50%;
            }

            .skeleton-title-lines {
              display: flex;
              flex-direction: column;
              gap: 6px;
              flex: 1;
            }

            .title-l1 {
              width: 60%;
              height: 8px;
            }

            .title-l2 {
              width: 40%;
              height: 6px;
            }

            .skeleton-body {
              display: flex;
              align-items: center;
              gap: 12px;
              flex: 1;
              margin-top: 14px;
            }

            .skeleton-photo {
              width: 64px;
              height: 78px;
              border-radius: 6px;
            }

            .skeleton-details {
              display: flex;
              flex-direction: column;
              gap: 8px;
              flex: 1;
            }

            .detail-line {
              width: 90%;
              height: 6px;
            }
            .detail-line:nth-child(2) { width: 75%; }
            .detail-line:nth-child(3) { width: 85%; }
            .detail-line:nth-child(4) { width: 50%; }

            .skeleton-qr {
              width: 48px;
              height: 48px;
              border-radius: 6px;
              align-self: flex-end;
            }
          `}</style>
          <div className="skeleton-header">
            <div className="skeleton-logo"></div>
            <div className="skeleton-title-lines">
              <div className="skeleton-line title-l1"></div>
              <div className="skeleton-line title-l2"></div>
            </div>
          </div>
          <div className="skeleton-body">
            <div className="skeleton-photo"></div>
            <div className="skeleton-details">
              <div className="skeleton-line detail-line"></div>
              <div className="skeleton-line detail-line"></div>
              <div className="skeleton-line detail-line"></div>
              <div className="skeleton-line detail-line"></div>
            </div>
            <div className="skeleton-qr"></div>
          </div>
        </div>
      )}
    </div>
  )
}

const triggerPDFDownload = (iframeId, fileName) => {
  const iframe = document.getElementById(iframeId);
  if (!iframe || !iframe.contentWindow) return;

  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const isMobileSafari = isIOS || isSafari;
  
  // Check if Web Share API with files is likely supported.
  const isShareSupported = typeof navigator.share === 'function' && typeof navigator.canShare === 'function';

  let iosWin = null;
  if (isMobileSafari && !isShareSupported) {
    try {
      iosWin = window.open('', '_blank');
      if (iosWin) {
        iosWin.document.write('<html><head><title>Generating PDF...</title><style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;background:#f5f5f5;color:#333;font-size:18px;text-align:center;padding:20px;box-sizing:border-box;}.spinner{border:4px solid rgba(0,0,0,0.1);width:36px;height:36px;border-radius:50%;border-left-color:#ff6600;animation:spin 1s linear infinite;margin-bottom:20px;}@keyframes spin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}</style></head><body><div class="spinner"></div><p>Generating PDF, please wait...</p></body></html>');
        iosWin.document.close();
      }
      window.iosWin = iosWin;
    } catch (e) {
      console.warn('Failed to pre-open window on iOS', e);
    }
  }

  if (typeof iframe.contentWindow.downloadPDF === 'function') {
    iframe.contentWindow.downloadPDF(fileName, iosWin);
  } else {
    if (iosWin) iosWin.close();
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  }
};

function WelcomeLetterMsg({ name, date, refCode, autoDownload }) {
  const { t } = useLang()
  const safeId = name.replace(/[^a-zA-Z0-9]/g, '-')
  const wrapperRef = useRef(null)
  
  const handlePrint = () => {
    triggerPDFDownload(`welcome-iframe-${safeId}`, `Welcome_Letter_${name}`);
  }

  const hasDownloaded = useRef(false)

  useEffect(() => {
    if (autoDownload && !hasDownloaded.current) {
      const timer = setTimeout(() => {
        hasDownloaded.current = true
        triggerPDFDownload(`welcome-iframe-${safeId}`, `Welcome_Letter_${name}`);
      }, 3500)
      return () => clearTimeout(timer)
    }
  }, [autoDownload, name, safeId])

  const letterUrl = `/Welcome_letter.html?name=${encodeURIComponent(name)}&date=${encodeURIComponent(date)}&ref=${encodeURIComponent(refCode || '')}&lang=ta&hideControls=true&apiUrl=${encodeURIComponent(import.meta.env.VITE_API_URL || '')}&v=1.0.4`

  return (
    <div ref={wrapperRef} style={{
      background: 'var(--color-carbon)',
      border: '1.5px solid rgba(19, 136, 8, 0.25)',
      borderRadius: '20px',
      padding: '16px',
      width: '320px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      backdropFilter: 'blur(8px)'
    }}>
      {/* File Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '10px',
          background: 'rgba(19, 136, 8, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid rgba(19, 136, 8, 0.2)',
          flexShrink: 0
        }}>
          <i className="bi bi-file-earmark-pdf-fill" style={{ color: 'var(--color-signal-mint)', fontSize: 20 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: 'left' }}>
          <span style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--color-chalk)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{t('Welcome_Letter.pdf')}</span>
          <span style={{ fontSize: 9, color: 'var(--color-ash)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{date}</span>
        </div>
      </div>

      {/* Embedded Iframe Preview */}
      <div style={{
        width: '100%',
        height: '420px',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid var(--color-graphite)',
        background: '#fff',
        position: 'relative'
      }}>
        <iframe 
          id={`welcome-iframe-${safeId}`}
          src={letterUrl} 
          style={{ 
            width: '100%', 
            height: '100%', 
            border: 'none',
            transform: 'scale(1.0)',
            transformOrigin: 'top left'
          }} 
          title="Welcome Letter Preview"
          onLoad={(e) => {
            try {
              const iframe = e.target;
              const doc = iframe.contentDocument || iframe.contentWindow.document;
              const controls = doc.querySelector('.controls-container');
              if (controls) controls.style.display = 'none';
            } catch(err) {}
          }}
        />
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handlePrint}
          style={{
            flex: 1,
            background: 'linear-gradient(135deg, #138808 0%, #0c5b05 100%)',
            color: '#fff',
            border: 'none',
            padding: '10px 14px',
            borderRadius: '12px',
            fontSize: 11,
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'all 0.15s'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'none' }}
        >
          <i className="bi bi-file-earmark-pdf-fill" /> {t('Download PDF')}
        </button>
      </div>
    </div>
  )
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

function AppreciationLetterMsg({ name, date, refCode, autoDownload }) {
  const { t } = useLang()
  const safeId = name.replace(/[^a-zA-Z0-9]/g, '-')
  
  const handlePrint = () => {
    triggerPDFDownload(`appreciation-iframe-${safeId}`, `Appreciation_Letter_${name}`);
  }

  const hasDownloaded = useRef(false)

  useEffect(() => {
    if (autoDownload && !hasDownloaded.current) {
      const timer = setTimeout(() => {
        hasDownloaded.current = true
        triggerPDFDownload(`appreciation-iframe-${safeId}`, `Appreciation_Letter_${name}`);
      }, 3500)
      return () => clearTimeout(timer)
    }
  }, [autoDownload, name, safeId])

  const letterUrl = `/Appreciation_letter.html?name=${encodeURIComponent(name)}&date=${encodeURIComponent(date)}&ref=${encodeURIComponent(refCode || '')}&lang=ta&hideControls=true&apiUrl=${encodeURIComponent(import.meta.env.VITE_API_URL || '')}&v=1.0.4`

  return (
    <div style={{
      background: 'var(--color-carbon)',
      border: '1.5px solid rgba(19, 136, 8, 0.25)',
      borderRadius: '20px',
      padding: '16px',
      width: '320px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      backdropFilter: 'blur(8px)'
    }}>
      {/* File Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '10px',
          background: 'rgba(19, 136, 8, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid rgba(19, 136, 8, 0.2)',
          flexShrink: 0
        }}>
          <i className="bi bi-file-earmark-pdf-fill" style={{ color: 'var(--color-signal-mint)', fontSize: 20 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: 'left' }}>
          <span style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--color-chalk)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{t('Appreciation_Letter.pdf')}</span>
          <span style={{ fontSize: 9, color: 'var(--color-ash)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{date}</span>
        </div>
      </div>

      {/* Embedded Iframe Preview */}
      <div style={{
        width: '100%',
        height: '420px',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid var(--color-graphite)',
        background: '#fff',
        position: 'relative'
      }}>
        <iframe 
          id={`appreciation-iframe-${safeId}`}
          src={letterUrl} 
          style={{ 
            width: '100%', 
            height: '100%', 
            border: 'none',
            transform: 'scale(1.0)',
            transformOrigin: 'top left'
          }} 
          title="Appreciation Letter Preview"
          onLoad={(e) => {
            try {
              const iframe = e.target;
              const doc = iframe.contentDocument || iframe.contentWindow.document;
              const controls = doc.querySelector('.controls-container');
              if (controls) controls.style.display = 'none';
            } catch(err) {}
          }}
        />
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handlePrint}
          style={{
            flex: 1,
            background: 'linear-gradient(135deg, #138808 0%, #0c5b05 100%)',
            color: '#fff',
            border: 'none',
            padding: '10px 14px',
            borderRadius: '12px',
            fontSize: 11,
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'all 0.15s'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'none' }}
        >
          <i className="bi bi-file-earmark-pdf-fill" /> {t('Download PDF')}
        </button>
      </div>
    </div>
  )
}

function SelectWingMsg({ bjpCode, epicNo, isLatest }) {
  const { t } = useLang()
  const [selectedWing, setSelectedWing] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [statusText, setStatusText] = useState('')
  const [existingRequest, setExistingRequest] = useState(null)

  const wings = [
    "Bharatiya Janata Yuva Morcha (BJYM)",
    "BJP Mahila Morcha",
    "OBC Morcha",
    "SC Morcha",
    "ST Morcha",
    "Kisan Morcha",
    "Minority Morcha",
    "Arts and Culture Wing",
    "NGO Wing",
    "Intellectual Cell / Teachers & Professionals Cell",
    "Weavers and Artisans Cell",
    "Fishermen Cell",
    "Traders and Business Cell",
    "Ex-Servicemen Cell",
    "Overseas Friends of BJP (OFBJP) / NRI Cell",
    "Information Technology (IT) & Social Media Wing",
    "Co-Operative Cell",
    "Sports & Skill Development Cell",
    "Medical & Doctors Cell",
    "Legal & Advocates Cell",
    "Local Bodies Cell"
  ]

  useEffect(() => {
    if (!bjpCode) {
      setChecking(false)
      return
    }
    chat.getRequestStatus(bjpCode)
      .then(res => {
        if (res.success && res.volunteer) {
          setExistingRequest(res.volunteer)
          setSubmitted(true)
        }
      })
      .catch(err => {
        console.error('Error fetching request status:', err)
      })
      .finally(() => {
        setChecking(false)
      })
  }, [bjpCode])

  const handleSubmit = async () => {
    if (!selectedWing) return
    setLoading(true)
    try {
      const res = await chat.requestVolunteer(bjpCode, epicNo, selectedWing)
      setSubmitted(true)
      setStatusText(res.message || t('✅ Organizer request submitted! Admin will review it shortly.'))
    } catch (err) {
      setStatusText(`❌ ${err.message || t('Unable to submit request. Please try again.')}`)
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <div style={{ width: 32, height: 32, border: '3px solid rgba(46, 204, 113, 0.15)', borderTopColor: 'var(--color-signal-mint)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <div style={{ fontSize: 13, color: 'var(--color-ash)', marginTop: 12 }}>{t('Checking status...')}</div>
      </div>
    )
  }

  return (
    <div style={{ 
      width: '100%', 
      maxWidth: '600px',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 24
    }}>
      {/* Role Header Description */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: 'rgba(255, 153, 51, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px auto'
        }}>
          <i className="bi bi-hand-thumbs-up-fill" style={{ fontSize: 36, color: '#FF9933' }} />
        </div>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-chalk)', marginBottom: 8 }}>{t('BJP Organizer Wing')}</h3>
        <p style={{ fontSize: 13, color: 'var(--color-ash)', lineHeight: '1.6', margin: '0 auto', maxWidth: '480px' }}>
          {t("As a BJP Organizer, you play a pivotal role in strengthening the party's foundation. Select your preferred Wing to lead local initiatives, mobilize community support, and drive organizational progress across Tamil Nadu.")}
        </p>
      </div>

      {existingRequest ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          {/* Custom SVG Pending / Success Spinner */}
          <div style={{ position: 'relative', width: 80, height: 80 }}>
            {existingRequest.status === 'confirmed' ? (
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            ) : existingRequest.status === 'rejected' ? (
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            ) : (
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#FF9933" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="pending-svg">
                <circle cx="12" cy="12" r="10" style={{ strokeDasharray: '60', strokeDashoffset: '20', animation: 'spin-pending 3s linear infinite' }} />
                <polyline points="12 6 12 12 15 15" />
              </svg>
            )}
          </div>

          <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: 'var(--color-chalk)' }}>
            {t('Status:')} <span style={{ textTransform: 'capitalize', color: existingRequest.status === 'confirmed' ? '#2ecc71' : existingRequest.status === 'rejected' ? '#dc2626' : '#FF9933' }}>{t(existingRequest.status)}</span>
          </div>

          {/* Grid fields */}
          <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
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
                <i className="bi bi-tag-fill" style={{ color: '#FF9933' }} />
                <span>{t('Assigned Wing')}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-chalk)' }}>{existingRequest.wing}</span>
            </div>

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
                <i
                  className={`bi ${existingRequest.status === 'confirmed' ? 'bi-check-circle-fill' : existingRequest.status === 'rejected' ? 'bi-x-circle-fill' : 'bi-clock-history'}`}
                  style={{ color: existingRequest.status === 'confirmed' ? '#2ecc71' : existingRequest.status === 'rejected' ? '#dc2626' : '#FF9933' }}
                />
                <span>{t('Application Status')}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-chalk)' }}>
                {existingRequest.status === 'confirmed'
                  ? t('Approved & Activated')
                  : existingRequest.status === 'rejected'
                  ? t('Rejected by Admin')
                  : t('Pending Admin Verification')}
              </span>
            </div>
          </div>
        </div>
      ) : !submitted ? (
        <div style={{ 
          background: 'var(--color-carbon)',
          border: '1px solid var(--color-graphite)',
          borderRadius: 16,
          padding: '24px 20px',
          width: '100%',
          maxWidth: '440px',
          margin: '0 auto'
        }}>
          <label htmlFor="wing-select" style={{ fontSize: 13, display: 'block', marginBottom: 8, color: 'var(--color-chalk)', fontWeight: '500' }}>
            {t('Select Preferred Wing:')}
          </label>
          <select
            id="wing-select"
            style={{ 
              width: '100%', 
              marginBottom: 16, 
              padding: 10, 
              borderRadius: 8, 
              background: 'var(--color-carbon)', 
              color: 'var(--color-chalk)', 
              border: '1px solid var(--color-graphite)', 
              fontSize: 13 
            }}
            value={selectedWing}
            onChange={(e) => setSelectedWing(e.target.value)}
            disabled={loading}
          >
            <option value="" style={{ color: 'var(--color-ash)' }}>{t('-- Choose a Wing --')}</option>
            {wings.map(w => <option key={w} value={w}>{t(w)}</option>)}
          </select>
          <button
            style={{
              width: '100%',
              padding: '12px 16px',
              background: '#f47a20',
              border: 'none',
              borderRadius: 8,
              color: '#ffffff',
              fontWeight: 'bold',
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              opacity: (!selectedWing || loading) ? 0.6 : 1
            }}
            onClick={handleSubmit}
            disabled={!selectedWing || loading}
          >
            {loading ? t('Submitting...') : t('Submit Request')}
          </button>
        </div>
      ) : (
        <div style={{ 
          background: 'var(--color-carbon)',
          border: '1px solid var(--color-graphite)',
          borderRadius: 16,
          padding: '24px 20px',
          width: '100%',
          maxWidth: '440px',
          margin: '0 auto',
          textAlign: 'center',
          color: 'var(--color-chalk)',
          fontSize: 14,
          lineHeight: '1.6'
        }}>
          {statusText}
        </div>
      )}
      <style>{`
        @keyframes spin-pending {
          to { stroke-dashoffset: -60; }
        }
        .pending-svg circle {
          transform-origin: center;
          animation: spin-pending 2s linear infinite;
        }
      `}</style>
    </div>
  )
}

function BoothAgentSetupMsg({ bjpCode, epicNo, isLatest }) {
  const { t } = useLang()
  const [districtsData, setDistrictsData] = useState(null)
  const [district, setDistrict] = useState('')
  const [assembly, setAssembly] = useState(null)
  const [booth, setBooth] = useState('')
  const [step, setStep] = useState('district') // 'district' | 'assembly' | 'booth' | 'submitted' | 'error' | 'already_submitted'
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [existingRequest, setExistingRequest] = useState(null)

  useEffect(() => {
    if (!bjpCode) {
      setChecking(false)
      return
    }
    chat.getRequestStatus(bjpCode)
      .then(res => {
        if (res.success && res.boothAgent) {
          setExistingRequest(res.boothAgent)
          setStep('already_submitted')
        }
      })
      .catch(err => {
        console.error('Error fetching request status:', err)
      })
      .finally(() => {
        setChecking(false)
      })
  }, [bjpCode])

  useEffect(() => {
    if (step === 'already_submitted') return
    chat.getDistrictsData()
      .then(res => {
        if (res.success && res.data) {
          setDistrictsData(res.data)
        } else {
          setErrorMsg(t('Failed to load district data.'))
          setStep('error')
        }
      })
      .catch(err => {
        setErrorMsg(t('Failed to load district data: {error}', { error: err.message || '' }))
        setStep('error')
      })
  }, [step])

  const handleDistrictSubmit = () => {
    if (district) setStep('assembly')
  }

  const handleAssemblySubmit = () => {
    if (assembly) setStep('booth')
  }

  const handleBoothSubmit = async () => {
    if (!booth) return
    setLoading(true)
    try {
      const res = await chat.requestBoothAgent(bjpCode, epicNo, booth, assembly.name, district)
      setStep('submitted')
    } catch (err) {
      setErrorMsg(err.message || t('Failed to submit booth agent request.'))
      setStep('error')
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <div style={{ width: 32, height: 32, border: '3px solid rgba(46, 204, 113, 0.15)', borderTopColor: 'var(--color-signal-mint)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <div style={{ fontSize: 13, color: 'var(--color-ash)', marginTop: 12 }}>{t('Checking status...')}</div>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#b45309' }}>
        <i className="bi bi-exclamation-triangle" style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
        {errorMsg}
      </div>
    )
  }

  if (step !== 'already_submitted' && !districtsData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <div style={{ width: 32, height: 32, border: '3px solid rgba(46, 204, 113, 0.15)', borderTopColor: 'var(--color-signal-mint)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <div style={{ fontSize: 13, color: 'var(--color-ash)', marginTop: 12 }}>{t('Loading districts...')}</div>
      </div>
    )
  }

  const districts = districtsData ? Object.keys(districtsData) : []
  const assemblies = (district && districtsData) ? districtsData[district] : []
  const maxBooths = assembly ? assembly.booths : 0
  const booths = Array.from({ length: maxBooths }, (_, i) => i + 1)

  return (
    <div style={{ 
      width: '100%', 
      maxWidth: '600px',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 24
    }}>
      {/* Role Header Description */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: 'rgba(255, 153, 51, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px auto'
        }}>
          <i className="bi bi-building-fill-check" style={{ fontSize: 36, color: '#FF9933' }} />
        </div>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-chalk)', marginBottom: 8 }}>{t('BJP Booth Agent')}</h3>
        <p style={{ fontSize: 13, color: 'var(--color-ash)', lineHeight: '1.6', margin: '0 auto', maxWidth: '480px' }}>
          {t('As a BJP Booth Agent, you are the crucial guardian of our democratic process at the polling booth level. You will be responsible for booth management, voter facilitation, and ensuring fair elections in your local part.')}
        </p>
      </div>

      {step === 'already_submitted' && existingRequest && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          {/* Custom SVG Pending / Success Spinner */}
          <div style={{ position: 'relative', width: 80, height: 80 }}>
            {existingRequest.status === 'confirmed' ? (
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            ) : existingRequest.status === 'rejected' ? (
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            ) : (
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#FF9933" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="pending-svg">
                <circle cx="12" cy="12" r="10" style={{ strokeDasharray: '60', strokeDashoffset: '20', animation: 'spin-pending 3s linear infinite' }} />
                <polyline points="12 6 12 12 15 15" />
              </svg>
            )}
          </div>

          <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: 'var(--color-chalk)' }}>
            {t('Status:')} <span style={{ textTransform: 'capitalize', color: existingRequest.status === 'confirmed' ? '#2ecc71' : existingRequest.status === 'rejected' ? '#dc2626' : '#FF9933' }}>{t(existingRequest.status)}</span>
          </div>

          {/* Grid fields */}
          <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
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
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-chalk)' }}>{existingRequest.district}</span>
            </div>

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
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-chalk)' }}>{existingRequest.assembly}</span>
            </div>

            <div style={{ 
              background: 'var(--color-carbon)', 
              border: '1px solid var(--color-graphite)',
              borderRadius: 12,
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              gridColumn: 'span 2'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-ash)' }}>
                <i className="bi bi-pin-map" style={{ color: '#FF9933' }} />
                <span>{t('Polling Booth Location')}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-chalk)' }}>{t('Booth Number {booth}', { booth: existingRequest.booth_no })}</span>
            </div>
          </div>
        </div>
      )}

      {step !== 'already_submitted' && step !== 'submitted' && (
        <div style={{ 
          background: 'var(--color-carbon)',
          border: '1px solid var(--color-graphite)',
          borderRadius: 16,
          padding: '24px 20px',
          width: '100%',
          maxWidth: '440px',
          margin: '0 auto'
        }}>
          {step === 'district' && (
            <>
              <label htmlFor="district-select" style={{ fontSize: 13, display: 'block', marginBottom: 8, color: 'var(--color-chalk)', fontWeight: '500' }}>
                {t('Select District:')}
              </label>
              <select
                id="district-select"
                style={{ width: '100%', marginBottom: 16, padding: 10, borderRadius: 8, background: 'var(--color-carbon)', color: 'var(--color-chalk)', border: '1px solid var(--color-graphite)', fontSize: 13 }}
                value={district}
                onChange={(e) => {
                  setDistrict(e.target.value)
                  setAssembly(null)
                  setBooth('')
                }}
              >
                <option value="" style={{ color: 'var(--color-ash)' }}>{t('-- Choose a District --')}</option>
                {districts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <button
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: '#f47a20',
                  border: 'none',
                  borderRadius: 8,
                  color: '#ffffff',
                  fontWeight: 'bold',
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  opacity: !district ? 0.6 : 1
                }}
                onClick={handleDistrictSubmit}
                disabled={!district}
              >
                {t('Next')} <i className="bi bi-chevron-right" />
              </button>
            </>
          )}

          {step === 'assembly' && (
            <>
              <div style={{ fontSize: 12, color: 'var(--color-ash)', marginBottom: 12 }}>
                {t('District')}: <strong style={{ color: 'var(--color-chalk)' }}>{district}</strong>
              </div>
              <label htmlFor="assembly-select" style={{ fontSize: 13, display: 'block', marginBottom: 8, color: 'var(--color-chalk)', fontWeight: '500' }}>
                {t('Choose Assembly:')}
              </label>
              <select
                id="assembly-select"
                style={{ width: '100%', marginBottom: 16, padding: 10, borderRadius: 8, background: 'var(--color-carbon)', color: 'var(--color-chalk)', border: '1px solid var(--color-graphite)', fontSize: 13 }}
                value={assembly ? JSON.stringify(assembly) : ''}
                onChange={(e) => {
                  setAssembly(e.target.value ? JSON.parse(e.target.value) : null)
                  setBooth('')
                }}
              >
                <option value="" style={{ color: 'var(--color-ash)' }}>{t('-- Choose an Assembly --')}</option>
                {assemblies.map(a => <option key={a.no} value={JSON.stringify(a)}>{a.name} ({a.no})</option>)}
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    background: '#64748b',
                    border: 'none',
                    borderRadius: 8,
                    color: '#ffffff',
                    fontWeight: 'bold',
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}
                  onClick={() => setStep('district')}
                >
                  <i className="bi bi-chevron-left" /> {t('Back')}
                </button>
                <button
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    background: '#f47a20',
                    border: 'none',
                    borderRadius: 8,
                    color: '#ffffff',
                    fontWeight: 'bold',
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    opacity: !assembly ? 0.6 : 1
                  }}
                  onClick={handleAssemblySubmit}
                  disabled={!assembly}
                >
                  {t('Next')} <i className="bi bi-chevron-right" />
                </button>
              </div>
            </>
          )}

          {step === 'booth' && (
            <>
              <div style={{ fontSize: 12, color: 'var(--color-ash)', marginBottom: 12, lineHeight: '1.4' }}>
                {t('District')}: <strong style={{ color: 'var(--color-chalk)' }}>{district}</strong><br/>
                {t('Assembly')}: <strong style={{ color: 'var(--color-chalk)' }}>{assembly.name}</strong>
              </div>
              <label htmlFor="booth-select" style={{ fontSize: 13, display: 'block', marginBottom: 8, color: 'var(--color-chalk)', fontWeight: '500' }}>
                {t('Select Polling Booth:')}
              </label>
              <select
                id="booth-select"
                style={{ width: '100%', marginBottom: 16, padding: 10, borderRadius: 8, background: 'var(--color-carbon)', color: 'var(--color-chalk)', border: '1px solid var(--color-graphite)', fontSize: 13 }}
                value={booth}
                onChange={(e) => setBooth(e.target.value)}
              >
                <option value="" style={{ color: 'var(--color-ash)' }}>{t('-- Choose a Booth Number --')}</option>
                {booths.map(b => <option key={b} value={b}>{t('Booth {booth}', { booth: b })}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    background: '#64748b',
                    border: 'none',
                    borderRadius: 8,
                    color: '#ffffff',
                    fontWeight: 'bold',
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}
                  onClick={() => setStep('assembly')}
                  disabled={loading}
                >
                  <i className="bi bi-chevron-left" /> {t('Back')}
                </button>
                <button
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    background: '#f47a20',
                    border: 'none',
                    borderRadius: 8,
                    color: '#ffffff',
                    fontWeight: 'bold',
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    opacity: (!booth || loading) ? 0.6 : 1
                  }}
                  onClick={handleBoothSubmit}
                  disabled={!booth || loading}
                >
                  {loading ? t('Submitting...') : t('Submit Request')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {step === 'submitted' && (
        <div style={{ 
          background: 'var(--color-carbon)',
          border: '1px solid var(--color-graphite)',
          borderRadius: 16,
          padding: '24px 20px',
          width: '100%',
          maxWidth: '440px',
          margin: '0 auto',
          textAlign: 'center',
          color: 'var(--color-chalk)',
          fontSize: 14,
          lineHeight: '1.6'
        }}>
          ✅ <strong>{t('Your booth agent request has been submitted successfully!')}</strong><br/>
          <span style={{ fontSize: 12, opacity: 0.8 }}>{t('Admin will review your request shortly.')}</span>
        </div>
      )}
      <style>{`
        @keyframes spin-pending {
          to { stroke-dashoffset: -60; }
        }
        .pending-svg circle {
          transform-origin: center;
          animation: spin-pending 2s linear infinite;
        }
      `}</style>
    </div>
  )
}

// ── Card Full View Modal Component ──────────────────────────
function CardModal({ cardData, onClose }) {
  const { t } = useLang()
  const modalRef = useRef(null)
  const [downloading, setDownloading] = useState(false)
  const [cardWidth, setCardWidth] = useState(Math.min(window.innerWidth - 48, 520))

  useEffect(() => {
    const handleResize = () => setCardWidth(Math.min(window.innerWidth - 48, 520))
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--color-carbon)',
          border: '1px solid var(--color-graphite)',
          borderRadius: 24,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          maxWidth: '100%',
          position: 'relative',
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'transparent',
            border: 'none',
            color: 'var(--color-ash)',
            fontSize: 20,
            cursor: 'pointer',
            zIndex: 10,
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => e.target.style.color = 'var(--color-chalk)'}
          onMouseLeave={(e) => e.target.style.color = 'var(--color-ash)'}
          aria-label="Close"
        >
          <i className="bi bi-x-lg" />
        </button>

        <div style={{ alignSelf: 'flex-start', marginTop: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ash)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <i className="bi bi-credit-card-2-front" /> {t('Digital Member Card')}
          </div>
        </div>

        <FlipCard3D
          ref={modalRef}
          cardData={cardData}
          width={cardWidth}
          showActions={false}
        />

        <div style={{ display: 'flex', gap: 12, width: '100%', justifyContent: 'center' }}>
          <button
            onClick={async () => {
              setDownloading(true)
              try {
                await modalRef.current?.download()
              } finally {
                setDownloading(false)
              }
            }}
            disabled={downloading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--color-signal-mint)',
              color: 'var(--color-abyss)',
              border: 'none',
              padding: '10px 24px',
              minHeight: 44,
              borderRadius: 16,
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {downloading ? (
              <span className="spinner-border spinner-border-sm" style={{ width: 12, height: 12, borderWidth: 2 }} />
            ) : (
              <i className="bi bi-download" />
            )}
            {t('Download Card')}
          </button>
          <button
            onClick={onClose}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'transparent',
              border: '1px solid var(--color-graphite)',
              color: 'var(--color-chalk)',
              padding: '10px 20px',
              minHeight: 44,
              borderRadius: 16,
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {t('Close')}
          </button>
        </div>
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

function BrochurePanel({ epicNo, mobile, onBack }) {
  const { t } = useLang()
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [expandedId, setExpandedId] = useState(null);
  const [applyStatus, setApplyStatus] = useState({});
  const [selectedSchemeForModal, setSelectedSchemeForModal] = useState(null);
  const [isAgreed, setIsAgreed] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notificationToast, setNotificationToast] = useState(null);

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
          const titlesList = [];

          apps.forEach(app => {
            const sName = app.schemeName || app.schemeId;
            const match = SCHEMES.find(sch => sch.title === sName || sch.id === Number(sName) || sch.title?.includes(sName));
            if (match) {
              updatedMap[match.id] = 'applied';
              titlesList.push(match.title);
            }
          });

          setApplyStatus(updatedMap);
          try {
            localStorage.setItem(storageKey, JSON.stringify(titlesList));
            localStorage.setItem('bjp_applied_schemes_global', JSON.stringify(titlesList));
          } catch(e) {}
        })
        .catch(() => {});
    }
  }, [epicNo, mobile]);

  const categories = [
    'All',
    'Cluster 1 — Insurance Trinity',
    'Cluster 2 — Credit & Enterprise',
    'Cluster 3 — Farmers Welfare',
    'Cluster 4 — Women & Families',
    'Cluster 5 — Youth & Skill',
    'Foundation Layer'
  ];

  const handleOpenApplyModal = (scheme) => {
    setSelectedSchemeForModal(scheme);
    setIsAgreed(true);
  };

  const handleConfirmSubmit = async () => {
    if (!selectedSchemeForModal) return;
    const scheme = selectedSchemeForModal;
    setIsSubmitting(true);

    try {
      await chat.registerSchemes({
        mobile: mobile || '',
        epicNo: epicNo || '',
        schemeIds: [scheme.title]
      });
    } catch (err) {
      console.log('Scheme registration note:', err);
    } finally {
      setIsSubmitting(false);
      setApplyStatus((prev) => ({ ...prev, [scheme.id]: 'applied' }));

      const userKey = epicNo || mobile || 'user';
      const storageKey = `bjp_applied_schemes_${userKey}`;
      try {
        const raw = localStorage.getItem(storageKey);
        let list = raw ? JSON.parse(raw) : [];
        if (!list.includes(scheme.title)) list.push(scheme.title);
        localStorage.setItem(storageKey, JSON.stringify(list));
      } catch (e) {}

      setSelectedSchemeForModal(null);
      
      // Trigger top-right notification toast with user's exact design
      setNotificationToast({
        title: t('Application Submitted!'),
        subText: t('Applied for {title}', { title: scheme.title })
      });

      // Auto dismiss notification after 5 seconds
      setTimeout(() => {
        setNotificationToast(null);
      }, 5000);
    }
  };

  const filteredSchemes = SCHEMES.filter(s => {
    const matchesCategory = activeCategory === 'All' || s.category === activeCategory;
    const matchesSearch = s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.overview.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

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
            {/* Modal Header */}
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

            {/* Highlight & Overview */}
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

            {/* Key Documents Summary */}
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

            {/* Confirmation Checkbox */}
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

            {/* Action Buttons */}
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
          <i className="bi bi-book-fill brochure-title-orange" />
          <span>{t('BJP Brochure — 23 Central BJP Schemes')}</span>
        </div>
      </header>

      <div className="brochure-content">
        <div className="brochure-controls">
          <div className="brochure-search-wrapper">
            <i className="bi bi-search brochure-search-icon" />
            <input 
              type="text" 
              className="brochure-search-input" 
              placeholder={t('Search Central Welfare Schemes...')} 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="brochure-categories">
            {categories.map(cat => (
              <button 
                key={cat} 
                className={`category-pill ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => { setActiveCategory(cat); setExpandedId(null); }}
              >
                {cat === 'All' ? t('All 23 Schemes') : t(cat)}
              </button>
            ))}
          </div>
        </div>

        <div className="schemes-list">
          {filteredSchemes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-ash)' }}>
              <i className="bi bi-clipboard-x" style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
              {t('No schemes found matching your search.')}
            </div>
          ) : (
            filteredSchemes.map((scheme, index) => {
              const isExpanded = expandedId === scheme.id;
              const status = applyStatus[scheme.id];
              return (
                <div 
                  key={scheme.id} 
                  className="scheme-card"
                  onClick={() => setExpandedId(isExpanded ? null : scheme.id)}
                >
                  <div className="scheme-card-header">
                    <div>
                      <div className="scheme-meta-cat">{t(scheme.category)}</div>
                      <h3 className="scheme-title">{scheme.id}. {scheme.title}</h3>
                    </div>
                    {scheme.highlight && <span className="scheme-badge">{scheme.highlight}</span>}
                  </div>

                  <div className="scheme-tags-row">
                    {scheme.tags.map((tItem, idx) => (
                      <span key={idx} className="scheme-tag">{tItem}</span>
                    ))}
                  </div>

                  <p className="scheme-overview">{scheme.overview}</p>

                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                    <button className="scheme-toggle-btn" onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : scheme.id); }}>
                      <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`} />
                      <span>{isExpanded ? t('Hide Steps & Documents') : t('View Details')}</span>
                    </button>

                    <button
                      className="btn-apply-scheme"
                      disabled={status === 'applying' || status === 'applied'}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenApplyModal(scheme);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: status === 'applied' ? '#27ae60' : '#2ecc71',
                        color: '#FFFFFF',
                        padding: '6px 16px',
                        borderRadius: 10,
                        fontWeight: 700,
                        border: 'none',
                        cursor: status === 'applied' ? 'default' : 'pointer',
                        fontSize: 12,
                        transition: 'all 0.15s',
                        boxShadow: '0 2px 8px rgba(46, 204, 113, 0.25)',
                        opacity: status === 'applying' ? 0.7 : 1
                      }}
                    >
                      <i className={`bi bi-${status === 'applied' ? 'check-circle-fill' : 'send-check-fill'}`} />
                      {status === 'applying' ? t('Applying...') : status === 'applied' ? t('Applied ✓') : t('Apply Now')}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="scheme-details-expanded" onClick={(e) => e.stopPropagation()}>
                      <div>
                        <div className="details-section-title">
                          <i className="bi bi-info-circle-fill" /> {t('Eligibility & Benefits')}
                        </div>
                        <p className="details-text">{scheme.eligibility}</p>
                      </div>

                      <div>
                        <div className="details-section-title">
                          <i className="bi bi-file-earmark-check-fill" /> {t('Required Documents')}
                        </div>
                        <div className="documents-list">
                          {scheme.documents.map((doc, idx) => (
                            <div key={idx} className="doc-item">
                              <i className="bi bi-check-circle-fill" />
                              <span>{doc}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="details-section-title">
                          <i className="bi bi-lightning-fill" /> {t('How to Apply (5 Steps)')}
                        </div>
                        <div className="steps-list">
                          {scheme.steps.map((step, idx) => (
                            <div key={idx} className="step-item">
                              <span className="step-num">{idx + 1}</span>
                              <span className="details-text">{step}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {scheme.link && (
                        <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <a 
                            href={scheme.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 8,
                              backgroundColor: '#FF9933',
                              color: '#FFFFFF',
                              padding: '10px 20px',
                              borderRadius: 12,
                              fontWeight: 600,
                              textDecoration: 'none',
                              fontSize: 13,
                              transition: 'all 0.15s',
                              boxShadow: '0 4px 12px rgba(255, 153, 51, 0.2)'
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <i className="bi bi-box-arrow-up-right" />
                            {t('Official Govt Portal')}
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
      <style>{`
        .card-notification-toast {
          position: fixed;
          top: 24px;
          right: 24px;
          z-index: 99999;
          animation: slideInRight 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }

        @keyframes slideInRight {
          from {
            transform: translateX(120%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes fadeInModal {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .toast-notification-card {
          width: 350px !important;
          height: 76px !important;
          border-radius: 12px !important;
          box-sizing: border-box !important;
          padding: 10px 16px !important;
          background-color: #ffffff !important;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18) !important;
          position: relative !important;
          overflow: hidden !important;
          display: flex !important;
          flex-direction: row !important;
          align-items: center !important;
          justify-content: space-between !important;
          gap: 12px !important;
          text-align: left !important;
        }

        .toast-wave {
          position: absolute !important;
          transform: rotate(90deg) !important;
          left: -31px !important;
          top: 32px !important;
          width: 80px !important;
          fill: #04e4003a !important;
          pointer-events: none !important;
        }

        .toast-icon-container {
          width: 42px !important;
          height: 42px !important;
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          background-color: #04e40048 !important;
          border-radius: 50% !important;
          margin-left: 10px !important;
          flex-shrink: 0 !important;
        }

        .toast-icon {
          width: 20px !important;
          height: 20px !important;
          color: #269b24 !important;
        }

        .toast-message-container {
          display: flex !important;
          flex-direction: column !important;
          justify-content: center !important;
          align-items: flex-start !important;
          flex-grow: 1 !important;
          overflow: hidden !important;
          text-align: left !important;
        }

        .toast-message-title {
          color: #269b24 !important;
          font-size: 16px !important;
          font-weight: 700 !important;
          margin: 0 0 2px 0 !important;
          cursor: default !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          width: 100% !important;
          text-align: left !important;
        }

        .toast-message-sub {
          font-size: 13px !important;
          color: #555555 !important;
          margin: 0 !important;
          cursor: default !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          width: 100% !important;
          text-align: left !important;
        }

        .toast-cross-icon {
          width: 18px !important;
          height: 18px !important;
          color: #555555 !important;
          cursor: pointer !important;
          flex-shrink: 0 !important;
          margin-left: 6px !important;
        }
      `}</style>
    </div>
  );
}

function FullLetterPanel({ type, name, date, refCode, epicNo, onBack }) {
  const { t } = useLang()
  const [selectedLang, setSelectedLang] = useState('ta')
  const [resolvedRefCode, setResolvedRefCode] = useState(refCode || '')

  useEffect(() => {
    if (refCode) {
      setResolvedRefCode(refCode)
    }
  }, [refCode])

  useEffect(() => {
    if (!resolvedRefCode && epicNo) {
      publicApi.getCardData(epicNo)
        .then((data) => {
          if (data && data.bjp_code) {
            setResolvedRefCode(data.bjp_code)
          }
        })
        .catch(() => {})
    }
  }, [resolvedRefCode, epicNo])

  const handleDownloadPDF = () => {
    const fileName = `${type === 'appreciation' ? 'Appreciation_Letter' : 'Welcome_Letter'}_${name}`
    triggerPDFDownload('full-letter-iframe', fileName);
  }

  const isAppreciation = type === 'appreciation';
  const letterUrl = isAppreciation
    ? `/Appreciation_letter.html?name=${encodeURIComponent(name)}&date=${encodeURIComponent(date)}&ref=${encodeURIComponent(resolvedRefCode || '')}&lang=${selectedLang}&hideControls=true&apiUrl=${encodeURIComponent(import.meta.env.VITE_API_URL || '')}&v=1.0.4`
    : `/Welcome_letter.html?name=${encodeURIComponent(name)}&date=${encodeURIComponent(date)}&ref=${encodeURIComponent(resolvedRefCode || '')}&lang=${selectedLang}&hideControls=true&apiUrl=${encodeURIComponent(import.meta.env.VITE_API_URL || '')}&v=1.0.4`;

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
          <i className={`bi bi-${isAppreciation ? 'award-fill' : 'envelope-paper-fill'} brochure-title-orange`} />
          <span>{isAppreciation ? t('Letter of Appreciation') : t('Welcome Letter')}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* Tamil / Eng Toggle */}
          <div style={{ 
            display: 'flex', 
            background: 'var(--color-carbon)', 
            border: '1px solid var(--color-graphite)', 
            borderRadius: '20px', 
            padding: '2px',
            alignItems: 'center'
          }}>
            <button
              onClick={() => setSelectedLang('ta')}
              style={{
                background: selectedLang === 'ta' ? 'var(--color-signal-mint)' : 'transparent',
                color: selectedLang === 'ta' ? '#fff' : 'var(--color-ash)',
                border: 'none',
                borderRadius: '18px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              தமிழ்
            </button>
            <button
              onClick={() => setSelectedLang('en')}
              style={{
                background: selectedLang === 'en' ? 'var(--color-signal-mint)' : 'transparent',
                color: selectedLang === 'en' ? '#fff' : 'var(--color-ash)',
                border: 'none',
                borderRadius: '18px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              English
            </button>
          </div>

          <button 
            className="btn-brochure-back" 
            onClick={handleDownloadPDF}
            style={{ 
              borderColor: 'var(--color-signal-mint)', 
              color: 'var(--color-signal-mint)',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title={isAppreciation ? t('Download Appreciation Letter') : t('Download Welcome Letter')}
          >
            <i className="bi bi-download" style={{ fontSize: 16 }} />
          </button>
        </div>
      </header>
      <div style={{ flex: 1, background: '#f5f5f5', overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
        <iframe
          id="full-letter-iframe"
          key={selectedLang}
          src={letterUrl}
          style={{ width: '100%', height: selectedLang === 'ta' ? '2400px' : '100%', border: 'none', minHeight: '100%' }}
          title={isAppreciation ? 'Appreciation Letter' : 'Welcome Letter'}
          onLoad={(e) => {
            try {
              const iframe = e.target;
              const doc = iframe.contentDocument || iframe.contentWindow.document;
              const controls = doc.querySelector('.controls-container');
              if (controls) controls.style.display = 'none';

              const setH = () => {
                const scrollH = Math.max(
                  doc.documentElement.scrollHeight,
                  doc.body ? doc.body.scrollHeight : 0
                );
                if (scrollH > 200) {
                  iframe.style.height = scrollH + 'px';
                }
              };
              setH();
              setTimeout(setH, 800);  // retry after fonts load
              setTimeout(setH, 2000); // final retry
            } catch(err) {}
          }}
        />
      </div>
    </div>
  );
}

function FullBoothPanel({ epicNo, onBack }) {
  const { t } = useLang()
  const [boothData, setBoothData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!epicNo) {
      setError(t('No booth data available. Please complete registration first.'))
      setLoading(false)
      return
    }
    chat.getBooth(epicNo)
      .then((data) => {
        setBoothData(data)
      })
      .catch((err) => {
        setError(err.message || t('Unable to load booth information.'))
      })
      .finally(() => {
        setLoading(false)
      })
  }, [epicNo])

  const getFieldIcon = (key) => {
    const k = key.toLowerCase();
    if (k.includes('assembly_name') || k.includes('assembly')) return 'geo-alt';
    if (k.includes('assembly_no') || k.includes('number')) return 'hash';
    if (k.includes('district')) return 'map';
    if (k.includes('part_no') || k.includes('part')) return 'pin-map';
    return 'info-circle';
  }

  const SKIP_KEYS = new Set(['success', 'polling_station'])
  const entries = boothData ? Object.entries(boothData).filter(([k, v]) => !SKIP_KEYS.has(k) && v !== null && v !== undefined && v !== '') : [];

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
          <i className="bi bi-building brochure-title-orange" />
          <span>{t('Booth Information')}</span>
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
            alignItems: 'center', 
            gap: 24,
            background: 'transparent',
            border: 'none',
            borderRadius: 0,
            padding: '20px 0',
            boxShadow: 'none'
          }}>
            {/* Header Icon & Title */}
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <div style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'rgba(255, 153, 51, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px auto'
              }}>
                <i className="bi bi-building" style={{ fontSize: 36, color: '#FF9933' }} />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-chalk)', marginBottom: 4 }}>{t('Polling Booth Details')}</h3>
              <p style={{ fontSize: 13, color: 'var(--color-ash)', margin: 0 }}>{t('Registered election booth location and part details')}</p>
            </div>

            {/* Details Grid */}
            <div style={{ 
              width: '100%', 
              display: 'grid', 
              gridTemplateColumns: 'repeat(2, 1fr)', 
              gap: 12 
            }}>
              {entries.length > 0 ? entries.map(([k, v]) => (
                <div key={k} style={{ 
                  background: 'var(--color-carbon)', 
                  border: '1px solid var(--color-graphite)',
                  borderRadius: 12,
                  padding: '12px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-ash)' }}>
                    <i className={`bi bi-${getFieldIcon(k)}`} style={{ color: '#FF9933' }} />
                    <span style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-chalk)' }}>{String(v)}</span>
                </div>
              )) : (
                <div style={{ gridColumn: 'span 2', textAlign: 'center', padding: '24px', color: 'var(--color-ash)' }}>
                  {t('No details found.')}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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

function FullMyMembersPanel({ bjpCode, onBack }) {
  const { t } = useLang()
  const [root, setRoot] = useState(null)
  const [tree, setTree] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedMember, setSelectedMember] = useState(null)

  // Incremental reveal: show 5 at a time, then a "+N" chip to load 5 more.
  const PAGE = 5
  const [l2Visible, setL2Visible] = useState(PAGE)          // L2 (direct) count shown
  const [l3Visible, setL3Visible] = useState({})            // { [parentCode]: count } for L3

  const getL3Count = (code) => l3Visible[code] || PAGE
  const showMoreL3 = (code) =>
    setL3Visible((prev) => ({ ...prev, [code]: (prev[code] || PAGE) + PAGE }))

  useEffect(() => {
    if (!bjpCode) {
      setError(t('No referral code available.'))
      setLoading(false)
      return
    }
    chat.getMyMembers(bjpCode)
      .then((data) => {
        setRoot(data.root || null)
        setTree(data.tree || [])
      })
      .catch((err) => {
        setError(err.message || t('Unable to load referred members.'))
      })
      .finally(() => {
        setLoading(false)
      })
  }, [bjpCode])

  const directCount = tree.length
  const indirectCount = tree.reduce((acc, curr) => acc + (curr.referrals?.length || 0), 0)
  const totalCount = directCount + indirectCount

  // Circular "+N" chip that reveals more nodes on click.
  const renderMoreChip = (remaining, onClick, level) => {
    const ringColor = level === 2 ? 'var(--color-signal-mint)' : '#17a2b8'
    return (
      <div
        onClick={onClick}
        role="button"
        title={t('Show {count} more', { count: Math.min(remaining, PAGE) })}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: 'var(--color-carbon)',
          border: `1.5px dashed ${ringColor}`,
          color: ringColor,
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          zIndex: 3,
          transition: 'all 0.15s ease'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)' }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'none' }}
      >
        +{remaining}
      </div>
    )
  }

  const renderNode = (member, level) => {
    const isRoot = level === 1
    const nodeWidth = isRoot ? '200px' : '170px'
    
    return (
      <div key={member.bjp_code} className={`tree-node level-${level}`} style={{
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
        zIndex: 2,
        flexShrink: 0
      }}>
        {/* Node card inner */}
        <div 
          onClick={() => setSelectedMember(member)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            background: 'var(--color-carbon)',
            border: isRoot ? '2px solid #FF9933' : '1px solid var(--color-graphite)',
            borderRadius: '12px',
            cursor: 'pointer',
            width: nodeWidth,
            boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
            transition: 'all 0.15s ease',
            zIndex: 3
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = isRoot ? '#FF9933' : 'var(--color-signal-mint)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = isRoot ? '#FF9933' : 'var(--color-graphite)';
            e.currentTarget.style.transform = 'none';
          }}
        >
          {/* Photo */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {member.photo_url ? (
              <img src={member.photo_url} crossOrigin="anonymous" alt={member.name} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--color-graphite)' }} />
            ) : (
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#252d27', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-graphite)' }}>
                <i className="bi bi-person-fill" style={{ color: 'var(--color-ash)', fontSize: 14 }} />
              </div>
            )}
            <span style={{
              position: 'absolute',
              bottom: -3,
              right: -3,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: '#2ecc71',
              color: '#000',
              fontSize: 8,
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>L{level}</span>
          </div>

          {/* Details */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, textAlign: 'left' }}>
            <span style={{ fontSize: 11, fontWeight: 'bold', color: 'var(--color-chalk)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.name}</span>
            <span style={{ fontSize: 9, color: 'var(--color-signal-mint)', fontFamily: 'monospace', fontWeight: 600 }}>{member.bjp_code}</span>
          </div>

          <i className="bi bi-chevron-right" style={{ color: 'var(--color-ash)', fontSize: 10, flexShrink: 0 }} />
        </div>
      </div>
    )
  }

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
          <i className="bi bi-people-fill brochure-title-orange" />
          <span>{t('My Members')}</span>
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
          <div style={{ width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Stats bar */}
            <div style={{ fontSize: 12, color: 'var(--color-signal-mint)', fontWeight: 600, borderBottom: '1px solid var(--color-graphite)', paddingBottom: 12 }}>
              {t('Referral Tree Network — {directCount} Direct | {indirectCount} Indirect ({totalCount} Total)', { directCount, indirectCount, totalCount })}
            </div>

            {/* Tree Container (Left-to-Right layout) */}
            <div style={{ 
              background: 'var(--color-carbon)', 
              border: '1px solid var(--color-graphite)', 
              borderRadius: 20, 
              padding: '24px 16px', 
              display: 'flex', 
              alignItems: 'center',
              minHeight: '350px',
              overflowX: 'auto',
              overflowY: 'auto',
              gap: '32px',
              position: 'relative'
            }}>
              {/* LAYER 1: ROOT */}
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                {root && renderNode(root, 1)}
                {/* Horizontal connection line to L2 column */}
                {tree.length > 0 && (
                  <div style={{
                    width: '32px',
                    height: '2px',
                    background: 'var(--color-graphite)',
                    flexShrink: 0
                  }} />
                )}
              </div>

              {/* LAYERS 2 & 3 */}
              {tree.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-ash)', flexShrink: 0, width: 'min(280px, 72vw)' }}>
                  <i className="bi bi-diagram-3" style={{ fontSize: 48, color: 'var(--color-graphite)', marginBottom: 16, display: 'block' }} />
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-chalk)', marginBottom: 8 }}>{t('Tree structure empty')}</h3>
                  <p style={{ fontSize: 13, margin: 0, color: 'var(--color-ash)', lineHeight: 1.6, wordBreak: 'normal', overflowWrap: 'anywhere' }}>
                    {t("You haven't referred anyone yet. Share your custom BJP code to build your 3-layer support network!")}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
                  
                  {/* Vertical connecting line spanning from first to last L2 node */}
                  {tree.length > 1 && (
                    <div style={{
                      position: 'absolute',
                      left: '-16px',
                      top: '25px', // Center of first L2 row
                      bottom: '25px', // Center of last L2 row
                      width: '2px',
                      background: 'var(--color-graphite)',
                      zIndex: 1
                    }} />
                  )}

                  {/* Stack of Rows (show 5 at a time) */}
                  {tree.slice(0, l2Visible).map(parent => {
                    const hasChildren = parent.referrals && parent.referrals.length > 0
                    return (
                      <div key={parent.bjp_code} style={{
                        display: 'flex',
                        alignItems: 'center',
                        position: 'relative',
                        gap: '24px'
                      }}>
                        {/* Horizontal link from L2 vertical line to L2 Node */}
                        <div style={{
                          position: 'absolute',
                          left: '-16px',
                          top: '50%',
                          width: '16px',
                          height: '2px',
                          background: 'var(--color-graphite)',
                          transform: 'translateY(-50%)',
                          zIndex: 1
                        }} />

                        {renderNode(parent, 2)}

                        {hasChildren && (
                          <div style={{
                            width: '24px',
                            height: '2px',
                            background: 'var(--color-graphite)',
                            flexShrink: 0
                          }} />
                        )}

                        {hasChildren && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                            position: 'relative'
                          }}>
                            {parent.referrals.length > 1 && (
                              <div style={{
                                position: 'absolute',
                                left: '0px',
                                right: '85px', // Stops at center of last node
                                height: '2px',
                                background: 'var(--color-graphite)',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                zIndex: 1
                              }} />
                            )}

                            {parent.referrals.slice(0, getL3Count(parent.bjp_code)).map(child => (
                              <div key={child.bjp_code} style={{ display: 'flex', alignItems: 'center', gap: '16px', position: 'relative' }}>
                                {renderNode(child, 3)}
                              </div>
                            ))}

                            {/* L3 "+N" — reveal 5 more children of this L2 parent */}
                            {parent.referrals.length > getL3Count(parent.bjp_code) &&
                              renderMoreChip(
                                parent.referrals.length - getL3Count(parent.bjp_code),
                                () => showMoreL3(parent.bjp_code),
                                3
                              )}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* L2 "+N" — reveal 5 more direct referrals */}
                  {tree.length > l2Visible && (
                    <div style={{ display: 'flex', alignItems: 'center', position: 'relative', paddingLeft: 0 }}>
                      {/* Horizontal link from the L2 vertical line to the chip */}
                      <div style={{
                        position: 'absolute',
                        left: '-16px',
                        top: '50%',
                        width: '16px',
                        height: '2px',
                        background: 'var(--color-graphite)',
                        transform: 'translateY(-50%)',
                        zIndex: 1
                      }} />
                      {renderMoreChip(tree.length - l2Visible, () => setL2Visible((v) => v + PAGE), 2)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MEMBER DETAILS MODAL */}
      {selectedMember && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: 16
        }} onClick={() => setSelectedMember(null)}>
          <div style={{
            background: 'var(--color-carbon)',
            border: '1.5px solid var(--color-graphite)',
            borderRadius: 24,
            width: '100%',
            maxWidth: '460px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            position: 'relative'
          }} onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={() => setSelectedMember(null)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'transparent',
                border: 'none',
                color: 'var(--color-ash)',
                fontSize: 22,
                cursor: 'pointer'
              }}
            >
              <i className="bi bi-x-lg" />
            </button>

            <h3 style={{ fontSize: 16, fontWeight: 'bold', color: 'var(--color-chalk)', marginBottom: 20 }}>{t('Member Details')}</h3>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <FlipCard3D
                cardData={{
                  name: selectedMember.name,
                  epic_no: selectedMember.epic_no,
                  assembly_name: selectedMember.assembly_name,
                  district: selectedMember.district,
                  part_no: selectedMember.part_no,
                  bjp_code: selectedMember.bjp_code,
                  photo_url: selectedMember.photo_url
                }}
                width={300}
                autoFlip={false}
                showActions={false}
              />
            </div>

            <div style={{
              background: '#f9f8f6',
              border: '1px solid #E2E8F0',
              borderRadius: 16,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#555555' }}>{t('Member Name')}</span>
                <span style={{ color: '#111111', fontWeight: 600 }}>{selectedMember.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#555555' }}>{t('EPIC Number')}</span>
                <span style={{ color: '#111111', fontFamily: 'monospace', fontWeight: 600 }}>{selectedMember.epic_no || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#555555' }}>{t('BJP Code')}</span>
                <span style={{ color: '#FF9933', fontFamily: 'monospace', fontWeight: 700 }}>{selectedMember.bjp_code}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#555555' }}>{t('Assembly (Booth)')}</span>
                <span style={{ color: '#111111', fontWeight: 600 }}>
                  {selectedMember.assembly_name ? `${selectedMember.assembly_name} (Part ${selectedMember.part_no || '—'})` : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#555555' }}>{t('District')}</span>
                <span style={{ color: '#111111', fontWeight: 600 }}>{selectedMember.district || '—'}</span>
              </div>
              {selectedMember.generated_at && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#555555' }}>{t('Joined Date')}</span>
                  <span style={{ color: '#111111', fontWeight: 600 }}>{new Date(selectedMember.generated_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LocalBodyPanel({ onBack, localBodyInterest, handleLocalBodyInterestSubmit }) {
  const { t } = useLang()
  const isLocked = localBodyInterest === 'interested' || localBodyInterest === 'not_interested';

  const handleClick = (value) => {
    if (isLocked) return;
    const confirmMsg = value === 'interested'
      ? t('Are you sure you want to submit "Interested"? This selection cannot be changed later.')
      : t('Are you sure you want to submit "Not Interested"? This selection cannot be changed later.');
    
    if (window.confirm(confirmMsg)) {
      handleLocalBodyInterestSubmit(value);
    }
  };

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
          <i className="bi bi-check-square-fill brochure-title-orange" />
          <span>{t('Local Body Election')}</span>
        </div>
      </header>

      <div className="brochure-scroll" style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{
          background: 'var(--color-carbon)',
          border: '1px solid var(--color-graphite)',
          borderRadius: 16,
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 16
        }}>
          <div style={{
            fontSize: 48,
            background: 'rgba(255, 153, 51, 0.1)',
            width: 80,
            height: 80,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 8
          }}>
            🗳️
          </div>
          
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-chalk)' }}>
            {t('Local Body Elections')}
          </h2>
          
          <p style={{ fontSize: 13, lineHeight: '1.6', color: 'var(--color-ash)', maxWidth: 400 }}>
            {t('BJP Tamil Nadu is preparing a database of active members who are interested in contesting, organizing, or coordinating local initiatives for the upcoming local body elections.')}
          </p>

          <div style={{
            width: '100%',
            height: '1px',
            background: 'var(--color-graphite)',
            margin: '8px 0'
          }} />

          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-chalk)' }}>
            {t('Are you interested in participating or contesting in the upcoming Local Body Elections?')}
          </p>

          <div style={{ display: 'flex', gap: 16, width: '100%', marginTop: 8, justifyContent: 'center' }}>
            <button
              onClick={() => handleClick('interested')}
              disabled={isLocked}
              style={{
                padding: '12px 24px',
                borderRadius: 10,
                border: 'none',
                fontWeight: 600,
                cursor: isLocked ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: localBodyInterest === 'interested' ? '#2ecc71' : 'var(--color-graphite)',
                color: localBodyInterest === 'interested' ? '#FFF' : 'var(--color-ash)',
                opacity: isLocked && localBodyInterest !== 'interested' ? 0.4 : 1,
                transition: 'all 0.2s'
              }}
            >
              {localBodyInterest === 'interested' ? (
                <>
                  <i className="bi bi-check-circle-fill" style={{ fontSize: 16 }} />
                  {t('Interested')}
                </>
              ) : (
                t('Interested')
              )}
            </button>
            <button
              onClick={() => handleClick('not_interested')}
              disabled={isLocked}
              style={{
                padding: '12px 24px',
                borderRadius: 10,
                border: 'none',
                fontWeight: 600,
                cursor: isLocked ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: localBodyInterest === 'not_interested' ? '#e74c3c' : 'var(--color-graphite)',
                color: localBodyInterest === 'not_interested' ? '#FFF' : 'var(--color-ash)',
                opacity: isLocked && localBodyInterest !== 'not_interested' ? 0.4 : 1,
                transition: 'all 0.2s'
              }}
            >
              {localBodyInterest === 'not_interested' ? (
                <>
                  <i className="bi bi-x-circle-fill" style={{ fontSize: 16 }} />
                  {t('Not Interested')}
                </>
              ) : (
                t('Not Interested')
              )}
            </button>
          </div>

          {localBodyInterest && (
            <div style={{
              marginTop: 16,
              padding: '12px 16px',
              borderRadius: 8,
              background: 'rgba(255, 153, 51, 0.05)',
              border: '1px solid rgba(255, 153, 51, 0.15)',
              color: '#FF9933',
              fontSize: 13,
              fontWeight: 500,
              maxWidth: 400,
              lineHeight: '1.5'
            }}>
              {localBodyInterest === 'interested' 
                ? t('🎉 Your interest has been submitted! Our election coordinators will reach out to you.')
                : t('Thank you for letting us know. You can change your selection at any time.')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FullCardPanel({ card, onBack }) {
  const { t } = useLang()
  const c = card || {}
  const [fullCardData, setFullCardData] = useState(null)
  const cardRef3D = useRef(null)
  const [cardWidth, setCardWidth] = useState(Math.min(540, window.innerWidth - 48))

  useEffect(() => {
    const handleResize = () => {
      setCardWidth(Math.min(540, window.innerWidth - 48))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const hasName = c.name || c.voter_name || c.VOTER_NAME;
    const hasAssembly = c.assembly_name || c.assembly || c.ASSEMBLY_NAME;
    if (hasName && hasAssembly) {
      setFullCardData(c)
    } else if (c.epic_no) {
      publicApi.getCardData(c.bjp_code || c.epic_no)
        .then((data) => setFullCardData(data))
        .catch(() => setFullCardData(c))
    }
  }, [c])

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
          <i className="bi bi-credit-card-2-front brochure-title-orange" />
          <span>{t('My Member Card')}</span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button 
            className="btn-brochure-back" 
            onClick={() => cardRef3D.current?.download()}
            style={{ 
              borderColor: 'var(--color-signal-mint)', 
              color: 'var(--color-signal-mint)',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title={t('Download ID Card')}
          >
            <i className="bi bi-download" style={{ fontSize: 16 }} />
          </button>
        </div>
      </header>

      <div className="brochure-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '40px 20px', minHeight: 400 }}>
        {fullCardData ? (
          <>
            <FlipCard3D
              ref={cardRef3D}
              cardData={fullCardData}
              backUrl={c.back_url || fullCardData.back_url}
              width={cardWidth}
              autoFlip={false}
              showActions={false}
            />
            <div style={{ color: 'var(--color-ash)', fontSize: 13, textAlign: 'center', maxWidth: 360, marginTop: 12 }}>
              <i className="bi bi-info-circle-fill" style={{ color: '#FF9933', marginRight: 6 }} />
              {t('Hover or click on the card to flip it and view the backside voter details.')}
            </div>
          </>
        ) : (
          <div style={{ width: 32, height: 32, border: '3px solid rgba(46, 204, 113, 0.15)', borderTopColor: 'var(--color-signal-mint)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        )}
      </div>
    </div>
  );
}

function FullFormPanel({ title, icon, onBack, children }) {
  const { t } = useLang()
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
          <i className={`bi bi-${icon} brochure-title-orange`} />
          <span>{t(title)}</span>
        </div>
      </header>

      <div className="brochure-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '20px', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

function BestPerformersPanel({ onBack }) {
  const { t } = useLang()
  const [performers, setPerformers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);

  useEffect(() => {
    chat.getBestPerformers()
      .then((data) => {
        setPerformers(data.performers || []);
      })
      .catch((err) => {
        setError(err.message || t('Unable to load leaderboard.'));
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

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
          <i className="bi bi-trophy-fill brochure-title-orange" />
          <span>{t('Best Performers')}</span>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-chalk)', marginBottom: 6 }}>{t('Referral Champions 👑')}</h2>
              <p style={{ fontSize: 13, color: 'var(--color-ash)', maxWidth: 440, margin: '0 auto' }}>
                {t('Leading volunteers who are driving local outreach and expanding our digital footprint across Tamil Nadu.')}
              </p>
            </div>

            {performers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-ash)' }}>
                <i className="bi bi-people-fill" style={{ fontSize: 40, color: 'var(--color-graphite)', marginBottom: 12, display: 'block' }} />
                <p>{t('No referrals recorded yet. Be the first performer!')}</p>
              </div>
            ) : (
              performers.map((p, index) => {
                const rank = index + 1;
                const isFirst = rank === 1;
                const medalColor = rank === 2 ? '#c0c0c0' : rank === 3 ? '#cd7f32' : 'var(--color-ash)';

                return (
                  <div 
                    key={p.bjp_code}
                    onClick={() => setSelectedMember(p)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '12px 16px',
                      background: isFirst
                        ? 'linear-gradient(90deg, rgba(255,193,7,0.16), var(--color-carbon) 70%)'
                        : 'var(--color-carbon)',
                      border: isFirst ? '1.5px solid #FFC107' : '1px solid var(--color-graphite)',
                      borderRadius: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {/* Rank — gold crown for #1, medal circles for #2/#3 */}
                    <div style={{ width: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {isFirst ? (
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="#FFC107" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))' }}>
                          <path d="M3 7l4.5 3.5L12 4l4.5 6.5L21 7l-1.8 10.5H4.8L3 7z" />
                          <rect x="4.8" y="18.2" width="14.4" height="2.4" rx="0.8" />
                          <circle cx="3" cy="6.2" r="1.4" />
                          <circle cx="21" cy="6.2" r="1.4" />
                          <circle cx="12" cy="3.2" r="1.4" />
                        </svg>
                      ) : (
                        <span style={{ width: 24, height: 24, borderRadius: '50%', border: `1.5px solid ${medalColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: medalColor }}>
                          {rank}
                        </span>
                      )}
                    </div>

                    <div style={{ flexShrink: 0 }}>
                      {p.photo_url ? (
                        <img src={p.photo_url} crossOrigin="anonymous" alt={p.name} style={{ width: 44, height: 44, borderRadius: '10px', objectFit: 'cover', border: isFirst ? '1.5px solid #FFC107' : '1.5px solid var(--color-graphite)' }} />
                      ) : (
                        <div style={{ width: 44, height: 44, borderRadius: '10px', background: '#252d27', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--color-graphite)' }}>
                          <i className="bi bi-person-fill" style={{ color: 'var(--color-ash)', fontSize: 18 }} />
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <span style={{ fontSize: 14, fontWeight: 'bold', color: 'var(--color-chalk)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-ash)', fontFamily: 'monospace', marginTop: 2 }}>{t('BJP Code:')} <span style={{ color: 'var(--color-signal-mint)', fontWeight: 600 }}>{p.bjp_code}</span></span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, background: 'rgba(46,204,113,0.1)', padding: '5px 11px', borderRadius: 20 }}>
                      <i className="bi bi-people-fill" style={{ fontSize: 12, color: 'var(--color-signal-mint)' }} />
                      <span style={{ fontSize: 14, fontWeight: 'bold', color: 'var(--color-signal-mint)' }}>{p.referrals || p.referred_count || 0}</span>
                    </div>
                  </div>
                );
              })
            )}

            {selectedMember && (
              <div 
                className="appointment-modal-overlay"
                onClick={() => setSelectedMember(null)}
              >
                <div 
                  className="appointment-modal-content"
                  onClick={(e) => e.stopPropagation()}
                  style={{ 
                    width: '580px', 
                    maxWidth: '95%',
                    padding: '24px 20px', 
                    display: 'flex', 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    gap: 20,
                    background: 'var(--color-carbon)',
                    border: '1px solid var(--color-graphite)',
                    borderRadius: 24,
                    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
                    position: 'relative',
                    flexWrap: 'wrap'
                  }}
                >
                  <button className="modal-close-btn" style={{ color: '#ff3b30' }} onClick={() => setSelectedMember(null)}>×</button>
                  
                  {/* Left Column: Avatar & Rank */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 12,
                    width: '140px',
                    margin: '0 auto',
                    textAlign: 'center',
                    flexShrink: 0
                  }}>
                    {/* Profile Photo */}
                    <div style={{ position: 'relative' }}>
                      {selectedMember.photo_url ? (
                        <img 
                          src={selectedMember.photo_url} 
                          alt={selectedMember.name} 
                          style={{ 
                            width: 80, 
                            height: 80, 
                            borderRadius: '50%', 
                            objectFit: 'cover', 
                            border: selectedMember.rank === 1 ? '2.5px solid #FF9933' : '2px solid var(--color-graphite)',
                            boxShadow: selectedMember.rank === 1 ? '0 0 16px rgba(255, 153, 51, 0.35)' : 'none'
                          }} 
                        />
                      ) : (
                        <div style={{ 
                          width: 80, 
                          height: 80, 
                          borderRadius: '50%', 
                          background: '#252d27', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          border: '2px solid var(--color-graphite)' 
                        }}>
                          <i className="bi bi-person-fill" style={{ color: 'var(--color-ash)', fontSize: 36 }} />
                        </div>
                      )}
                    </div>

                    {/* Rank Badge */}
                    <div style={{
                      background: selectedMember.rank === 1 ? 'linear-gradient(135deg, #FF9933 0%, #d47a1c 100%)' : 'rgba(255,255,255,0.06)',
                      border: selectedMember.rank === 1 ? 'none' : '1px solid var(--color-graphite)',
                      color: selectedMember.rank === 1 ? '#000' : 'var(--color-chalk)',
                      padding: '4px 10px',
                      borderRadius: '16px',
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap'
                    }}>
                      {selectedMember.rank === 1 ? t('👑 Champion') : t('Rank #{rank}', { rank: selectedMember.rank })}
                    </div>

                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-chalk)', marginBottom: 2, wordBreak: 'break-all' }}>{selectedMember.name}</h3>
                      <p style={{ fontSize: 11, color: 'var(--color-signal-mint)', fontWeight: 600, margin: 0 }}>{t('Volunteer Agent')}</p>
                    </div>
                  </div>

                  {/* Right Column: Details Grid */}
                  <div style={{ 
                    flex: 1, 
                    minWidth: '280px', 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(2, 1fr)', 
                    gap: 10 
                  }}>
                    <div style={{ 
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid rgba(255,255,255,0.04)',
                      borderRadius: 10,
                      padding: '8px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-ash)' }}>
                        <i className="bi bi-hash" style={{ color: '#FF9933' }} />
                        <span>{t('Member Code')}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-chalk)', fontFamily: 'monospace' }}>{selectedMember.bjp_code}</span>
                    </div>

                    <div style={{ 
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid rgba(255,255,255,0.04)',
                      borderRadius: 10,
                      padding: '8px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-ash)' }}>
                        <i className="bi bi-card-text" style={{ color: '#FF9933' }} />
                        <span>{t('EPIC Number')}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-chalk)', fontFamily: 'monospace' }}>{selectedMember.epic_no}</span>
                    </div>

                    <div style={{ 
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid rgba(255,255,255,0.04)',
                      borderRadius: 10,
                      padding: '8px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-ash)' }}>
                        <i className="bi bi-geo-alt" style={{ color: '#FF9933' }} />
                        <span>{t('Assembly')}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-chalk)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={selectedMember.assembly_name}>{selectedMember.assembly_name}</span>
                    </div>

                    <div style={{ 
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid rgba(255,255,255,0.04)',
                      borderRadius: 10,
                      padding: '8px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-ash)' }}>
                        <i className="bi bi-map" style={{ color: '#FF9933' }} />
                        <span>{t('District')}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-chalk)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={selectedMember.district}>{selectedMember.district}</span>
                    </div>

                    <div style={{ 
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid rgba(255,255,255,0.04)',
                      borderRadius: 10,
                      padding: '8px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-ash)' }}>
                        <i className="bi bi-pin-map" style={{ color: '#FF9933' }} />
                        <span>{t('Part Number')}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-chalk)', fontFamily: 'monospace' }}>{selectedMember.part_no}</span>
                    </div>

                    <div style={{ 
                      background: 'rgba(46,204,113,0.04)', 
                      border: '1px solid rgba(46,204,113,0.1)',
                      borderRadius: 10,
                      padding: '8px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="bi bi-people-fill" style={{ color: 'var(--color-signal-mint)', fontSize: 14 }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-chalk)' }}>{t('Total Refs')}</span>
                      </div>
                      <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-signal-mint)' }}>{selectedMember.referrals}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
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
  const [selectedSchemeId, setSelectedSchemeId] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isFlipped, setIsFlipped]   = useState(false)
  const [cropSrc, setCropSrc]       = useState('')
  const [cropOpen, setCropOpen]     = useState(false)
  const [modalCard, setModalCard]   = useState(null)

  const [referredCount, setReferredCount] = useState(0)
  const [createdAt, setCreatedAt] = useState(null)
  const [appreciationEarnedAt, setAppreciationEarnedAt] = useState(null)
  const [hasAppointment, setHasAppointment] = useState(false)
  const [localBodyInterest, setLocalBodyInterest] = useState(null)
  const [meetingInterest, setMeetingInterest] = useState(null)
  const [volunteerStatus, setVolunteerStatus] = useState(null)
  const [boothAgentStatus, setBoothAgentStatus] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [bookingStep, setBookingStep] = useState(1) // 1: Congrats/Meeting request, 3: Meeting response thank you, 4: Local Body, 5: Local body thank you
  const [isBooking, setIsBooking] = useState(false)
  const [bookingError, setBookingError] = useState('')

  const soundPlayedRef = useRef({ localBody: false, president: false, volunteer: false, boothAgent: false })

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

  const fetchMemberStatus = async (code) => {
    if (!code) return
    try {
      const res = await chat.getMemberStatus(code)
      if (res.success) {
        setReferredCount(res.referred_count || 0)
        setCreatedAt(res.created_at || null)
        setAppreciationEarnedAt(res.appreciation_earned_at || null)
        
        // Auto-unlock and download appreciation letter when reaching 5 referrals
        if ((res.referred_count || 0) >= 5 && !localStorage.getItem(`appreciation_letter_sent_${code}`)) {
          localStorage.setItem(`appreciation_letter_sent_${code}`, 'true');
          const todayDate = res.appreciation_earned_at 
            ? new Date(res.appreciation_earned_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
            : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
          const mName = cardRef.current?.voter_name || cardRef.current?.name || profileRef.current?.voter_name || profileRef.current?.name || 'Member';
          
          setTimeout(() => {
            addMsg('bot', 'text', { text: '🏆 *Congratulations!* You have successfully invited 5 members to join our party.' });
          }, 500);
          setTimeout(() => {
            addMsg('bot', 'text', { text: 'We are pleased to present you with this official Letter of Appreciation from the BJP State President:' });
          }, 1500);
          setTimeout(() => {
            addMsg('bot', 'appreciation_letter', { name: mName, date: todayDate, autoDownload: false });
          }, 2500);
        }

        setHasAppointment(res.has_appointment || false)
        setLocalBodyInterest(res.local_body_interest || null)
        setVolunteerStatus(res.volunteer_status || null)
        setBoothAgentStatus(res.booth_agent_status || null)
        
        let meetInt = null
        if (res.appointment) {
          meetInt = res.appointment.interest || null
        }
        setMeetingInterest(meetInt)

        // Check if any sound alert should trigger
        const isLocalBodyPending = res.local_body_interest === null
        const isPresidentPending = (res.referred_count || 0) >= 5 && (meetInt === null)
        const isVolunteerStatusAlert = (res.volunteer_status === 'confirmed' || res.volunteer_status === 'rejected') &&
          localStorage.getItem(`ack_vol_status_${code}`) !== res.volunteer_status
        const isBoothAgentStatusAlert = (res.booth_agent_status === 'confirmed' || res.booth_agent_status === 'rejected') &&
          localStorage.getItem(`ack_ba_status_${code}`) !== res.booth_agent_status

        if (isLocalBodyPending && !soundPlayedRef.current.localBody) {
          soundPlayedRef.current.localBody = true
          playNotificationSound()
        }
        if (isPresidentPending && !soundPlayedRef.current.president) {
          soundPlayedRef.current.president = true
          playNotificationSound()
        }
        if (isVolunteerStatusAlert && !soundPlayedRef.current.volunteer) {
          soundPlayedRef.current.volunteer = true
          playNotificationSound()
        }
        if (isBoothAgentStatusAlert && !soundPlayedRef.current.boothAgent) {
          soundPlayedRef.current.boothAgent = true
          playNotificationSound()
        }
      }
    } catch (err) {
      console.warn('Failed to fetch member status:', err)
    }
  }

  const handleBellClick = () => {
    setBookingError('')
    if (referredCount >= 5) {
      if (meetingInterest === null) {
        setBookingStep(1)
      } else {
        setBookingStep(3)
      }
      setShowModal(true)
    }
  }

  const handleSidebarOpen = () => {
    const sCode = cardRef.current?.bjp_code || cardRef.current?.ptc_code || profileRef.current?.bjp_code || profileRef.current?.ptc_code
    const volNotif = (volunteerStatus === 'confirmed' || volunteerStatus === 'rejected') &&
      localStorage.getItem(`ack_vol_status_${sCode}`) !== volunteerStatus
    const baNotif = (boothAgentStatus === 'confirmed' || boothAgentStatus === 'rejected') &&
      localStorage.getItem(`ack_ba_status_${sCode}`) !== boothAgentStatus
    if ((volNotif || baNotif) && !soundPlayedRef.current.sidebarOpen) {
      soundPlayedRef.current.sidebarOpen = true
      playNotificationSound()
    }
    setSidebarOpen(true)
  }

  const handleAcknowledgeStatus = (type, val) => {
    const code = cardRef.current?.bjp_code || cardRef.current?.ptc_code || profileRef.current?.bjp_code || profileRef.current?.ptc_code
    if (code) {
      if (type === 'volunteer') {
        localStorage.setItem(`ack_vol_status_${code}`, val)
      } else if (type === 'booth_agent') {
        localStorage.setItem(`ack_ba_status_${code}`, val)
      }
    }
    setShowModal(false)
  }

  const handleLocalBodyInterestSubmit = async (interestValue) => {
    const bjpCode = cardRef.current?.bjp_code || cardRef.current?.ptc_code || profileRef.current?.bjp_code || profileRef.current?.ptc_code
    if (!bjpCode) return
    setBookingError('')
    setIsBooking(true)
    try {
      const res = await chat.saveLocalBodyInterest(bjpCode, interestValue)
      setIsBooking(false)
      if (res.success) {
        setLocalBodyInterest(interestValue)
        setBookingStep(5)
      } else {
        setBookingError(res.message || 'Failed to record response.')
      }
    } catch (err) {
      setIsBooking(false)
      setBookingError(err.message || 'Network error.')
    }
  }

  const handleMeetingInterestSubmit = async (interestValue) => {
    const bjpCode = cardRef.current?.bjp_code || cardRef.current?.ptc_code || profileRef.current?.bjp_code || profileRef.current?.ptc_code
    if (!bjpCode) return
    setBookingError('')
    setIsBooking(true)
    try {
      const res = await chat.saveMeetingInterest(bjpCode, interestValue)
      setIsBooking(false)
      if (res.success) {
        setMeetingInterest(interestValue)
        setHasAppointment(interestValue === 'interested')
        setBookingStep(3)
      } else {
        setBookingError(res.message || 'Failed to record response.')
      }
    } catch (err) {
      setIsBooking(false)
      setBookingError(err.message || 'Network error.')
    }
  }

  useEffect(() => {
    const handler = (e) => setModalCard(e.detail)
    window.addEventListener('show-card-modal', handler)
    return () => window.removeEventListener('show-card-modal', handler)
  }, [])

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
  const fileInputRef    = useRef(null)
  const cameraInputRef  = useRef(null)

  // Keep stateRef synced
  useEffect(() => { stateRef.current = chatState }, [chatState])

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // Clear the OTP resend timer on unmount
  useEffect(() => () => { if (otpTimerRef.current) clearInterval(otpTimerRef.current) }, [])

  // ── Rolling session: auto-logout after 1 hour of inactivity ────
  // Timer resets on every user action (sliding). If the member returns before
  // 1h, the clock restarts; 1h of no activity logs them out automatically.
  const AUTO_LOGOUT_MS   = 60 * 60 * 1000
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
    // Best-effort destroy the server session
    try { await chat.logout() } catch { /* ignore */ }
    // Reset UI to a logged-out state with a notice (no reload → keep the message)
    setSidebarOpen(false)
    setActiveView('chat')
    setModalCard(null)
    setShowModal(false)
    setMessages([])
    setChatState(S.WELCOME)
    addMsg('bot', 'text', { text: t('🔒 You have been logged out after 1 hour of inactivity. Tap Start to continue.') })
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

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
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
        if (cache.card.referral_link) {
          addMsg('bot', 'referral_link', { link: cache.card.referral_link })
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
        const u = res.user || {}
        const card = {
          epic_no:       res.epic_no || u.epicNo || '',
          voter_name:    res.voter_name || u.voterName || 'BJP Member',
          card_url:      res.card_url || '',
          back_url:      res.back_url || '',
          combined_url:  res.combined_url || res.card_url || '',
          photo_url:     res.photo_url || u.photo || '',
          bjp_code:      res.bjp_code || u.referralCode || '',
          referral_link: res.referral_link || (u.referralCode ? `${window.location.origin}/r/${u.referralCode}` : ''),
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
        await botSay(t('👋 Welcome back! Mobile number verified. Here is your Digital Member ID Card:'), 300)
        addMsg('bot', 'generated_card', { card })
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
          referral_link: res.referral_link || '',
        }
        cardRef.current = card
        saveCache(card, {})
        if (card.bjp_code) {
          fetchMemberStatus(card.bjp_code)
        }
        await botSay(t('✅ You are already a registered member! Here is your Digital Member ID Card:'), 300)
        addMsg('bot', 'generated_card', { card })
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
          referral_link: data.referral_link || '',
        }
        cardRef.current = card
        saveCache(card, {})
        await botSay(t('✅ You are already a registered member! Here is your Digital Member ID Card:'), 300)
        addMsg('bot', 'generated_card', { card })
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
      const refLink = res.referral_link || (ntCode ? `${window.location.origin}/r/${ntCode}` : '')
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

  // TEMP: merges new scheme IDs into existing registration — replace with PATCH /api/scheme-registration/:ntCode/add-schemes
  const handleAddSchemesSubmit = async (newIds) => {
    const existing = cardRef.current?.selected_scheme_ids || []
    const merged = [...new Set([...existing, ...newIds])]
    await sleep(800)
    cardRef.current = { ...cardRef.current, selected_scheme_ids: merged }
    saveCache(cardRef.current, profileRef.current || {})
    setActiveView('my_schemes')
  }

  const handleFileSelect = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      botSay(t('❌ Please select an image file (JPG, PNG, etc.).'), 200)
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => { setCropSrc(e.target.result); setCropOpen(true) }
    reader.readAsDataURL(file)
  }

  const handleCropComplete = async (blob) => {
    setCropOpen(false)
    setCropSrc('')
    addMsg('user', 'text', { text: t('📸 Photo uploaded') })
    setChatState(S.GENERATING)
    await botSay(t('⏳ Generating your card… please wait a moment.'), 400)

    try {
      const { ref, rid } = referralRef.current

      // Preferred path: upload the photo DIRECTLY to Backblaze B2 via a
      // presigned URL, so photo bytes + image compression never touch our
      // server (scales to large concurrent bursts). Only the upload step
      // falls back to multipart — business errors are handled normally.
      let photoKey = null
      try {
        const presign = await chat.getPhotoUploadUrl(epicRef.current, mobileRef.current)
        if (presign?.uploadUrl && presign?.key) {
          await chat.uploadPhotoToB2(presign.uploadUrl, blob)
          photoKey = presign.key
        }
      } catch (_) {
        photoKey = null // upload failed → use multipart fallback below
      }

      let res
      if (photoKey) {
        res = await chat.generateCard({
          epic_no:   epicRef.current,
          mobile:    mobileRef.current,
          photo_key: photoKey,
          ...(ref ? { ref } : {}),
          ...(rid ? { rid } : {}),
        })
      } else {
        const formData = new FormData()
        formData.append('epic_no', epicRef.current)
        formData.append('mobile', mobileRef.current)
        formData.append('photo', blob, 'photo.jpg')
        if (ref) formData.append('ref', ref)
        if (rid) formData.append('rid', rid)
        res = await chat.generateCard(formData)
      }

      const card = {
        card_url:      res.card_url,
        back_url:      res.back_url,
        combined_url:  res.combined_url,
        epic_no:       res.epic_no || epicRef.current,
        bjp_code:      res.bjp_code || res.ptc_code,
        referral_link: res.referral_link || '',
        name:          voterRef.current?.name || voterRef.current?.VOTER_NAME || res.voter_name,
        assembly_name: voterRef.current?.assembly_name || voterRef.current?.assembly || voterRef.current?.ASSEMBLY_NAME,
        district:      voterRef.current?.district || voterRef.current?.DISTRICT || voterRef.current?.DISTRICT_NAME,
        part_no:       voterRef.current?.part_no || voterRef.current?.PartNo || voterRef.current?.PART_NO,
        photo_url:     res.photo_url || voterRef.current?.photo_url,
      }
      cardRef.current = card
      saveCache(card, profileRef.current || {})
      if (card.bjp_code) {
        fetchMemberStatus(card.bjp_code)
      }

      // Clear referral storage since card is successfully generated under this referral
      try {
        localStorage.removeItem('bjp_referral')
      } catch {}

      await botSay(t('🎉 Your Digital Member ID Card is ready!'), 200)
      addMsg('bot', 'generated_card', { card, isNew: true })

      // Send Welcome Letter PDF attachment
      await sleep(1000)
      await botSay(
        t('✉️ *Welcome to BJP Tamil Nadu!*\nWe have prepared your official welcome letter. Click below to view, print, or save it as a PDF:'),
        300
      )
      await sleep(400)
      const regDate = card.created_at || card.generated_at
        ? new Date(card.created_at || card.generated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      addMsg('bot', 'welcome_letter', { name: card.voter_name || card.name, date: regDate, ref: card.bjp_code || card.ptc_code, autoDownload: false })

      if (card.referral_link) {
        await sleep(1200)
        addMsg('bot', 'referral_link', { link: card.referral_link })
      }

      setChatState(S.DONE)
    } catch (err) {
      setChatState(S.AWAIT_PHOTO)
      await botSay(`❌ ${err.message || t('Error generating card. Please try uploading your photo again.')}`, 200)
    }
  }

  const handleBoothNoSubmit = async () => {
    const boothNo = inputValue.trim()
    if (!boothNo) return
    const bjpCode = cardRef.current?.bjp_code || cardRef.current?.ptc_code || profileRef.current?.bjp_code || profileRef.current?.ptc_code
    addMsg('user', 'text', { text: t('Booth No: {booth}', { booth: boothNo }) })
    setInputValue('')
    setIsTyping(true)
    try {
      const res = await chat.requestBoothAgent(bjpCode, epicRef.current, boothNo)
      setIsTyping(false)
      await botSay(res.message || t('✅ Booth Agent request submitted! Admin will review it shortly.'), 200)
    } catch (err) {
      setIsTyping(false)
      await botSay(`ℹ️ ${err.message || t('Unable to submit request. Please try again.')}`, 200)
    }
    setChatState(S.DONE)
  }

  // ── Sidebar actions ───────────────────────────────────────
  const handleSidebarAction = async (action) => {
    setSidebarOpen(false)
    if (action === 'brochure') {
      setActiveView('brochure')
      return
    }
    if (action === 'my_schemes') {
      setActiveView('my_schemes')
      return
    }
    if (action === 'profile') {
      setActiveView('profile')
      return
    }
    if (action === 'my_card') {
      setActiveView('my_card')
      return
    }
    if (action === 'welcome_letter') {
      setActiveView('welcome_letter')
      return
    }
    if (action === 'appreciation_letter') {
      setActiveView('appreciation_letter')
      return
    }
    if (action === 'best_performers') {
      setActiveView('best_performers')
      return
    }
    if (action === 'volunteer') {
      setActiveView('volunteer')
      return
    }
    if (action === 'booth_agent') {
      setActiveView('booth_agent')
      return
    }
    if (action === 'booth_info') {
      setActiveView('booth_info')
      return
    }
    if (action === 'local_body') {
      setActiveView('local_body')
      return
    }
    if (action === 'my_members') {
      setActiveView('my_members')
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
    soundPlayedRef.current = { localBody: false, president: false }
    setSidebarOpen(false)
    setIsFlipped(false)
    setInputValue('')
    setMessages([])

    // 2. Drop any stored referral attribution so a refresh after logout does
    //    NOT keep showing the referral link. Only a fresh QR scan (which puts
    //    ?ref=&rid= back in the URL) should re-attach a referral.
    try { localStorage.removeItem('bjp_referral') } catch (_) {}

    // 3. Destroy the backend session cookie (fire-and-forget)
    try { await chat.logout() } catch (_) {}

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
    if (chatState === S.AWAIT_BOOTH_NO) {
      return val ? '' : 'Please enter your booth number'
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
      case S.AWAIT_BOOTH_NO: await handleBoothNoSubmit(); break
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
      case 'generated_card':
        return <GeneratedCardMsg card={msg.card} isNew={msg.isNew || false} />
      case 'welcome_letter':
        return <WelcomeLetterMsg name={msg.name} date={msg.date} refCode={msg.ref || cardRef.current?.bjp_code || cardRef.current?.ptc_code || profileRef.current?.bjp_code || profileRef.current?.ptc_code} autoDownload={msg.autoDownload} />
      case 'appreciation_letter':
        return <AppreciationLetterMsg name={msg.name} date={msg.date} refCode={msg.ref || cardRef.current?.bjp_code || cardRef.current?.ptc_code || profileRef.current?.bjp_code || profileRef.current?.ptc_code} autoDownload={msg.autoDownload} />
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
      case 'booth_info': {
        const booth = msg.booth || {}
        const SKIP_KEYS = new Set(['success', 'polling_station'])
        const entries = Object.entries(booth).filter(([k, v]) => !SKIP_KEYS.has(k) && v !== null && v !== undefined && v !== '')
        return (
          <div className="info-card booth-card">
            <div className="info-card-header"><i className="bi bi-building" /> {t('Booth Information')}</div>
            <div className="vdc-body">
              {entries.length > 0 ? entries.map(([k, v]) => (
                <div className="vdc-row" key={k}>
                  <span className="vdc-label">{k.replace(/_/g, ' ')}</span>
                  <span className="vdc-value">{String(v)}</span>
                </div>
              )) : <p style={{ padding: '10px 12px', fontSize: 12, color: '#8696a0' }}>{t('No booth information available.')}</p>}
            </div>
          </div>
        )
      }
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
      case 'best_performers': {
        const performers = msg.performers || []
        return (
          <div className="members-card info-card best-performers-card">
            <div className="info-card-header">
              <i className="bi bi-trophy-fill text-warning me-2" /> {t('Top 5 Referrers')}
            </div>
            {performers.length === 0 ? (
              <p className="members-empty">{t('No referrals generated yet. Invite members to lead the board!')}</p>
            ) : (
              <ul className="members-list best-performers-list" style={{ listStyle: 'none', padding: 0 }}>
                {performers.map((p, i) => (
                  <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: i < performers.length - 1 ? '1px solid var(--border-dim)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className={`rank-badge rank-${p.rank}`} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        fontSize: 11,
                        fontWeight: 'bold',
                        background: p.rank === 1 ? '#ffd700' : p.rank === 2 ? '#c0c0c0' : p.rank === 3 ? '#cd7f32' : 'var(--admin-surface-raise)',
                        color: p.rank <= 3 ? '#000' : 'var(--text-secondary)'
                      }}>{p.rank}</span>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 13, fontWeight: '500' }}>{p.name}</span>
                        <span style={{ fontSize: 10, opacity: 0.6 }}>{t('BJP Code:')} {p.bjp_code}</span>
                      </div>
                    </div>
                    <span className="badge-status badge-generated" style={{ fontSize: 12, fontWeight: 'bold' }}>
                      {p.referred_count === 1 ? t('{count} referral', { count: p.referred_count }) : t('{count} referrals', { count: p.referred_count })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      }
      case 'select_wing': {
        const isLatest = messages[messages.length - 1]?.id === msg.id
        return (
          <SelectWingMsg
            bjpCode={msg.bjpCode}
            epicNo={msg.epicNo}
            isLatest={isLatest}
          />
        )
      }
      case 'booth_agent_flow': {
        const isLatest = messages[messages.length - 1]?.id === msg.id
        return (
          <BoothAgentSetupMsg
            bjpCode={msg.bjpCode}
            epicNo={msg.epicNo}
            isLatest={isLatest}
          />
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

  const code = cardRef.current?.bjp_code || cardRef.current?.ptc_code || profileRef.current?.bjp_code || profileRef.current?.ptc_code
  const hasPendingNotification = 
    (referredCount >= 5 && meetingInterest === null)

  const hasVolunteerNotif = (volunteerStatus === 'confirmed' || volunteerStatus === 'rejected') &&
    localStorage.getItem(`ack_vol_status_${code}`) !== volunteerStatus
  const hasBoothAgentNotif = (boothAgentStatus === 'confirmed' || boothAgentStatus === 'rejected') &&
    localStorage.getItem(`ack_ba_status_${code}`) !== boothAgentStatus
  const hasSidebarNotification = hasVolunteerNotif || hasBoothAgentNotif

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
                  className={`chat-header-btn bell-alert-btn ${
                    hasPendingNotification ? 'pulsing-vibrate' : ''
                  } ${hasAppointment ? 'bell-booked-btn' : ''}`}
                  onClick={handleBellClick}
                  title={
                    hasAppointment 
                      ? t('Meeting Scheduled! Click to view details') 
                      : t('Milestone Achieved! Click to Schedule Meeting with President')
                  }
                  style={{ 
                    fontSize: 18, 
                    color: hasAppointment ? '#2ecc71' : '#D1B078', 
                    border: 'none', 
                    background: 'none', 
                    cursor: 'pointer' 
                  }}
                >
                  <i className="bi bi-bell-fill" />
                  {hasPendingNotification && <span className="bell-badge" />}
                </button>
              )}
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
              { icon: 'book-fill',      label: 'Central Schemes Brochure', action: 'brochure',   desc: 'Official Central Welfare Schemes Booklet' },
            ].map((item) => {
              const isComingSoon = false
              const locked = !isDone || (item.action === 'appreciation_letter' && referredCount < 5)
              const itemHasNotif =
                (item.action === 'volunteer' && hasVolunteerNotif) ||
                (item.action === 'booth_agent' && hasBoothAgentNotif)
              const notifStatus =
                item.action === 'volunteer' ? volunteerStatus :
                item.action === 'booth_agent' ? boothAgentStatus : null
              return (
                <div
                  key={item.action}
                  className={`left-chat-item option-item ${locked ? 'locked' : ''}`}
                  role="button"
                  tabIndex={locked ? -1 : 0}
                  aria-disabled={locked}
                  onClick={() => !locked && handleSidebarAction(item.action)}
                  onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !locked) { e.preventDefault(); handleSidebarAction(item.action) } }}
                  title={isComingSoon ? t('Coming Soon') : (item.action === 'appreciation_letter' && referredCount < 5) ? t('Invite 5 members to unlock appreciation letter') : locked ? t('Complete registration to unlock') : t(item.desc)}
                >
                  <div className="left-chat-avatar option-avatar">
                    <i className={`bi bi-${item.icon}`} />
                  </div>
                  <div className="left-chat-details">
                    <div className="left-chat-name-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span className="left-chat-name">{t(item.label)}</span>
                        {isComingSoon && <span className="coming-soon-badge">{t('Coming Soon')}</span>}
                        {itemHasNotif && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            background: notifStatus === 'confirmed' ? 'rgba(46,204,113,0.15)' : 'rgba(229,57,53,0.15)',
                            color: notifStatus === 'confirmed' ? '#2ecc71' : '#e53935',
                            border: `1px solid ${notifStatus === 'confirmed' ? '#2ecc71' : '#e53935'}`,
                            borderRadius: 20, padding: '1px 7px', fontSize: 10, fontWeight: 700
                          }}>
                            {notifStatus === 'confirmed'
                              ? <><i className="bi bi-check-circle-fill" /> {t('Accepted')}</>
                              : <><i className="bi bi-x-circle-fill" /> {t('Rejected')}</>}
                          </span>
                        )}
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
          {activeView === 'scheme_status' ? (
            <SchemeStatusView
              scheme={NT_SCHEMES.find(s => s.id === selectedSchemeId)}
              ntCode={cardRef.current?.bjp_code}
              onBack={() => setActiveView('my_schemes')}
            />
          ) : activeView === 'add_schemes' ? (
            <AddSchemesPanel
              registeredIds={cardRef.current?.selected_scheme_ids || []}
              onSubmit={handleAddSchemesSubmit}
              onBack={() => setActiveView('my_schemes')}
            />
          ) : activeView === 'my_schemes' ? (
            <MySchemePanel
              epicNo={epicRef.current || cardRef.current?.epic_no || profileRef.current?.epic_no}
              mobile={mobileRef.current || cardRef.current?.mobile || profileRef.current?.mobile}
              onBack={() => setActiveView('chat')}
            />
          ) : activeView === 'brochure' ? (
            <BrochurePanel
              epicNo={epicRef.current || cardRef.current?.epic_no || profileRef.current?.epic_no}
              mobile={mobileRef.current || cardRef.current?.mobile || profileRef.current?.mobile}
              onBack={() => setActiveView('chat')}
            />
          ) : activeView === 'booth_info' ? (
            <FullBoothPanel 
              epicNo={epicRef.current || cardRef.current?.epic_no || profileRef.current?.epic_no} 
              onBack={() => setActiveView('chat')} 
            />
          ) : activeView === 'profile' ? (
            <FullProfilePanel 
              epicNo={epicRef.current || cardRef.current?.epic_no || profileRef.current?.epic_no} 
              mobile={mobileRef.current || cardRef.current?.mobile || profileRef.current?.mobile} 
              referredCount={referredCount} 
              onBack={() => setActiveView('chat')} 
            />
          ) : activeView === 'my_card' ? (
            <FullCardPanel card={cardRef.current} onBack={() => setActiveView('chat')} />
          ) : activeView === 'welcome_letter' ? (
            <FullLetterPanel 
              type="welcome" 
              name={cardRef.current?.name || cardRef.current?.voter_name || profileRef.current?.name || 'Member'}
              date={
                createdAt
                  ? new Date(createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                  : (cardRef.current?.created_at || profileRef.current?.created_at || cardRef.current?.generated_at || profileRef.current?.generated_at)
                    ? new Date(cardRef.current?.created_at || profileRef.current?.created_at || cardRef.current?.generated_at || profileRef.current?.generated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
              }
              refCode={cardRef.current?.bjp_code || cardRef.current?.ptc_code || profileRef.current?.bjp_code || profileRef.current?.ptc_code}
              epicNo={epicRef.current || cardRef.current?.epic_no || profileRef.current?.epic_no}
              onBack={() => setActiveView('chat')} 
            />
          ) : activeView === 'appreciation_letter' ? (
            <FullLetterPanel 
              type="appreciation" 
              name={cardRef.current?.name || cardRef.current?.voter_name || profileRef.current?.name || 'Member'}
              date={
                appreciationEarnedAt
                  ? new Date(appreciationEarnedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                  : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
              }
              refCode={cardRef.current?.bjp_code || cardRef.current?.ptc_code || profileRef.current?.bjp_code || profileRef.current?.ptc_code}
              epicNo={epicRef.current || cardRef.current?.epic_no || profileRef.current?.epic_no}
              onBack={() => setActiveView('chat')} 
            />
          ) : activeView === 'referral' ? (
            <FullReferralPanel
              link={cardRef.current?.referral_link || ''}
              onBack={() => setActiveView('chat')}
            />
          ) : activeView === 'best_performers' ? (
            <BestPerformersPanel onBack={() => setActiveView('chat')} />
          ) : activeView === 'volunteer' ? (
            <FullFormPanel title="Be a BJP Organizer" icon="hand-thumbs-up-fill" onBack={() => setActiveView('chat')}>
              <SelectWingMsg
                bjpCode={cardRef.current?.bjp_code || cardRef.current?.ptc_code || profileRef.current?.bjp_code || profileRef.current?.ptc_code}
                epicNo={epicRef.current}
                isLatest={true}
              />
            </FullFormPanel>
          ) : activeView === 'booth_agent' ? (
            <FullFormPanel title="Be a Booth Agent" icon="building-fill-check" onBack={() => setActiveView('chat')}>
              <BoothAgentSetupMsg
                bjpCode={cardRef.current?.bjp_code || cardRef.current?.ptc_code || profileRef.current?.bjp_code || profileRef.current?.ptc_code}
                epicNo={epicRef.current}
                isLatest={true}
              />
            </FullFormPanel>
          ) : activeView === 'local_body' ? (
            <LocalBodyPanel 
              onBack={() => setActiveView('chat')} 
              localBodyInterest={localBodyInterest}
              handleLocalBodyInterestSubmit={handleLocalBodyInterestSubmit}
            />
          ) : activeView === 'my_members' ? (
            <FullMyMembersPanel 
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
                  {chatState === S.GENERATING ? (
                    <><span className="status-dot-pulsing" /> {t('Generating membership card...')}</>
                  ) : isDone ? (
                    <><span className="status-dot-green" /> {t('Online')}</>
                  ) : (
                    <><span className="status-dot-green" /> {t('Registration in progress')}</>
                  )}
                </div>
              </div>
              <div className="chat-header-actions" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {isDone && (
                  <button
                    className={`chat-header-btn bell-alert-btn ${
                      hasPendingNotification ? 'pulsing-vibrate' : ''
                    } ${hasAppointment ? 'bell-booked-btn' : ''}`}
                    onClick={handleBellClick}
                    title={
                      hasAppointment 
                        ? 'Meeting Scheduled! Click to view details' 
                        : 'Milestone Achieved! Click to Schedule Meeting with President'
                    }
                    style={{ 
                      fontSize: 18, 
                      color: hasAppointment ? '#2ecc71' : '#D1B078', 
                      border: 'none', 
                      background: 'none', 
                      cursor: 'pointer' 
                    }}
                  >
                    <i className="bi bi-bell-fill" />
                    {hasPendingNotification && <span className="bell-badge" />}
                  </button>
                )}
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
                const isLatest = messages[messages.length - 1]?.id === msg.id
                const isPhotoRequest = isLatest && chatState === S.AWAIT_PHOTO && msg.from === 'bot' && msg.type === 'text'

                if (isPhotoRequest) {
                  const safeHtml = String(msg.text || '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
                  return (
                    <div key={msg.id} className="msg-row bot">
                      <div className="msg-avatar" aria-hidden="true">
                        <img src="/bjp_logo.svg" alt="BJP" onError={(e) => { e.target.onerror = null; e.target.src = '/bjp_logo.png' }} />
                      </div>
                      <div className="msg-bubble msg-bubble-interactive">
                        <div className="interactive-body">
                          <span dangerouslySetInnerHTML={{ __html: safeHtml }} />
                          <div className="msg-time" style={{ marginTop: 8 }}>
                            {fmtTime(msg.ts)}
                          </div>
                        </div>
                        <div className="interactive-buttons">
                          <button className="interactive-btn" onClick={() => fileInputRef.current?.click()}>
                            <i className="bi bi-cloud-upload-fill" /> {t('Upload Image')}
                          </button>
                          <button className="interactive-btn" onClick={() => cameraInputRef.current?.click()}>
                            <i className="bi bi-camera-fill" /> {t('Take Photo')}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                }

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

            {/* Input area */}
            <footer className="chat-input-area">
              {chatState === S.CONFIRM ? (
                null
              ) : chatState === S.SELECT_SCHEMES ? (
                null
              ) : isDone && !inputCfg ? (
                <div className="chat-form done-bar">
                  <div className="chat-input-wrapper">
                    <span className="done-status">
                      <i className="bi bi-shield-fill-check text-success" />
                      {t('Registration Successful')}
                    </span>
                  </div>
                  <button className="chat-send-btn menu-btn" onClick={handleSidebarOpen} title={t('Menu')} style={{ position: 'relative' }}>
                    <i className="bi bi-grid-3x3-gap-fill" />
                    {hasSidebarNotification && <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: '50%', background: '#e53935', display: 'block' }} />}
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
                { icon: 'person-circle',       label: 'My Profile',        action: 'profile' },
                { icon: 'link-45deg',          label: 'Referral Link',     action: 'referral' },
                { icon: 'book-fill',           label: 'Central Schemes Brochure', action: 'brochure' },
              ].map((item) => {
                const isComingSoon = false
                const isLocked = item.action === 'appreciation_letter' && referredCount < 5
                const itemHasNotif =
                  (item.action === 'volunteer' && hasVolunteerNotif) ||
                  (item.action === 'booth_agent' && hasBoothAgentNotif)
                const notifStatus =
                  item.action === 'volunteer' ? volunteerStatus :
                  item.action === 'booth_agent' ? boothAgentStatus : null
                return (
                  <button
                    key={item.action}
                    className={`sidebar-nav-item ${isComingSoon || isLocked ? 'locked' : ''}`}
                    onClick={() => !isComingSoon && !isLocked && handleSidebarAction(item.action)}
                    style={isComingSoon || isLocked ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <i className={`bi bi-${item.icon}`} />
                        <span>{t(item.label)}</span>
                        {isComingSoon && <span className="coming-soon-badge">{t('Coming Soon')}</span>}
                        {itemHasNotif && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            background: notifStatus === 'confirmed' ? 'rgba(46,204,113,0.15)' : 'rgba(229,57,53,0.15)',
                            color: notifStatus === 'confirmed' ? '#2ecc71' : '#e53935',
                            border: `1px solid ${notifStatus === 'confirmed' ? '#2ecc71' : '#e53935'}`,
                            borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700,
                            animation: 'pulse 1.5s infinite'
                          }}>
                            {notifStatus === 'confirmed'
                              ? <><i className="bi bi-check-circle-fill" /> {t('Accepted')}</>  
                              : <><i className="bi bi-x-circle-fill" /> {t('Rejected')}</>}
                          </span>
                        )}
                      </div>
                      {(isComingSoon || isLocked) && <i className="bi bi-lock-fill" style={{ fontSize: 12, opacity: 0.8 }} />}
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

      {/* Crop Modal */}
      {cropOpen && cropSrc && (
        <CropModal
          src={cropSrc}
          onCrop={handleCropComplete}
          onCancel={() => { setCropOpen(false); setCropSrc('') }}
        />
      )}

      {/* Card Full View Modal */}
      {modalCard && (
        <CardModal
          cardData={modalCard}
          onClose={() => setModalCard(null)}
        />
      )}

      {/* Appointment Booking Modal */}
      {showModal && (
        <div className="appointment-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="appointment-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowModal(false)}>&times;</button>
            
            {bookingStep === 1 && (
              <div className="modal-step-congrats">
                <div className="modal-icon-wrapper congrats">
                  <i className="bi bi-trophy-fill congrats-icon" />
                </div>
                <h2>{t('Congratulations! 🎉')}</h2>
                <p className="congrats-text" dangerouslySetInnerHTML={{ __html: t('You have successfully completed *5 referrals*! As a token of appreciation for your outstanding support, you have earned a special opportunity to meet the State President. Are you interested in scheduling a meeting?').replace(/\*(.*?)\*/g, '<strong>$1</strong>') }} />
                {bookingError && <p className="modal-error-text" style={{ color: '#ff3b30', fontSize: 12, marginBottom: 16 }}>⚠️ {bookingError}</p>}
                <div className="modal-actions-row" style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                  <button 
                    className="btn-modal-action btn-schedule" 
                    style={{ flex: 1 }}
                    onClick={() => handleMeetingInterestSubmit('interested')}
                    disabled={isBooking}
                  >
                    {isBooking ? t('Saving...') : t('Interested')}
                  </button>
                  <button 
                    className="btn-modal-action btn-cancel" 
                    style={{ flex: 1, border: '1px solid var(--border-dim)' }}
                    onClick={() => handleMeetingInterestSubmit('not_interested')}
                    disabled={isBooking}
                  >
                    {isBooking ? t('Saving...') : t('Not Interested')}
                  </button>
                </div>
              </div>
            )}

            {bookingStep === 3 && (
              <div className="modal-step-success">
                <div className="modal-icon-wrapper success">
                  <i className="bi bi-check-circle-fill success-icon" />
                </div>
                <h2>{t('Preference Saved! 🗓️')}</h2>
                <p className="success-text">
                  {meetingInterest === 'interested'
                    ? t('Thanks for your interest! Your request to meet the State President has been recorded. Our team will contact you soon.')
                    : t('Thank you for your response. Your preference has been successfully recorded.')
                  }
                </p>
                <div className="modal-actions-row">
                  <button className="btn-modal-action btn-schedule" onClick={() => setShowModal(false)}>
                    {t('Done')}
                  </button>
                </div>
              </div>
            )}

            {bookingStep === 4 && (
              <div className="modal-step-local-body">
                <div className="modal-icon-wrapper congrats" style={{ background: 'rgba(209, 176, 120, 0.12)' }}>
                  <i className="bi bi-building congrats-icon" style={{ color: '#D1B078' }} />
                </div>
                <h2>{t('Local Body Elections 🗳️')}</h2>
                <p className="congrats-text" style={{ fontSize: 13, lineHeight: '1.5' }}>
                  {t('Are you interested in participating or contesting in the upcoming Local Body Elections? BJP Tamil Nadu is planning candidate profiles and coordinators for each ward/panchayat. Let us know your interest below:')}
                </p>
                {bookingError && <p className="modal-error-text" style={{ color: '#ff3b30', fontSize: 12, marginBottom: 16 }}>⚠️ {bookingError}</p>}
                <div className="modal-actions-row" style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                  <button 
                    className="btn-modal-action btn-schedule" 
                    style={{ flex: 1 }}
                    onClick={() => handleLocalBodyInterestSubmit('interested')}
                    disabled={isBooking}
                  >
                    {isBooking ? t('Saving...') : t('Interested')}
                  </button>
                  <button 
                    className="btn-modal-action btn-cancel" 
                    style={{ flex: 1, border: '1px solid var(--border-dim)' }}
                    onClick={() => handleLocalBodyInterestSubmit('not_interested')}
                    disabled={isBooking}
                  >
                    {isBooking ? t('Saving...') : t('Not Interested')}
                  </button>
                </div>
              </div>
            )}

            {bookingStep === 5 && (
              <div className="modal-step-success">
                <div className="modal-icon-wrapper success">
                  <i className="bi bi-check-circle-fill success-icon" />
                </div>
                <h2>{t('Thank You! 🙏')}</h2>
                <p className="success-text" style={{ fontSize: 13, lineHeight: '1.5' }}>
                  {localBodyInterest === 'interested' 
                    ? t('Thanks for your interest! Your preference has been recorded. Our team will reach out to you with further updates.')
                    : t('Thank you for your response. Your preference has been successfully recorded.')
                  }
                </p>
                <div className="modal-actions-row" style={{ marginTop: 20 }}>
                  <button className="btn-modal-action btn-schedule" onClick={() => {
                    setShowModal(false);
                    // If they have met milestones (referredCount >= 5) and don't have an appointment yet, route them back to step 1
                    if (referredCount >= 5 && !hasAppointment) {
                      setBookingStep(1);
                    }
                  }}>
                    {t('Close')}
                  </button>
                </div>
              </div>
            )}

            {bookingStep === 6 && (
              <div className="modal-step-success">
                <div className="modal-icon-wrapper success" style={{ backgroundColor: 'rgba(46, 125, 50, 0.12)' }}>
                  <i className="bi bi-patch-check-fill success-icon" style={{ color: '#2e7d32' }} />
                </div>
                <h2>{t('Congratulations Organizer! 🎉')}</h2>
                <p className="success-text" style={{ fontSize: 13, lineHeight: '1.5' }}>
                  {t('Your application to become a BJP Organizer has been accepted by the State Administrator. Thank you for your leadership and dedication to the party!')}
                </p>
                <div className="modal-actions-row" style={{ marginTop: 20 }}>
                  <button className="btn-modal-action btn-schedule" style={{ backgroundColor: '#2e7d32' }} onClick={() => handleAcknowledgeStatus('volunteer', 'confirmed')}>
                    {t('Done')}
                  </button>
                </div>
              </div>
            )}

            {bookingStep === 7 && (
              <div className="modal-step-success">
                <div className="modal-icon-wrapper success" style={{ backgroundColor: 'rgba(198, 40, 40, 0.12)' }}>
                  <i className="bi bi-x-circle-fill success-icon" style={{ color: '#c62828' }} />
                </div>
                <h2>{t('Organizer Application ℹ️')}</h2>
                <p className="success-text" style={{ fontSize: 13, lineHeight: '1.5' }}>
                  {t('Your application to become a BJP Organizer has been reviewed and rejected by the State Administrator at this time. Thank you for your interest; you can continue to participate and refer new members.')}
                </p>
                <div className="modal-actions-row" style={{ marginTop: 20 }}>
                  <button className="btn-modal-action btn-schedule" style={{ backgroundColor: '#c62828' }} onClick={() => handleAcknowledgeStatus('volunteer', 'rejected')}>
                    {t('Done')}
                  </button>
                </div>
              </div>
            )}

            {bookingStep === 8 && (
              <div className="modal-step-success">
                <div className="modal-icon-wrapper success" style={{ backgroundColor: 'rgba(21, 101, 192, 0.12)' }}>
                  <i className="bi bi-shield-fill-check success-icon" style={{ color: '#1565c0' }} />
                </div>
                <h2>{t('Congratulations Booth Agent! 🗳️')}</h2>
                <p className="success-text" style={{ fontSize: 13, lineHeight: '1.5' }}>
                  {t('Your application to become a BJP Booth Agent has been confirmed by the State Administrator. You are now officially assigned to your booth! Thank you for your valuable support.')}
                </p>
                <div className="modal-actions-row" style={{ marginTop: 20 }}>
                  <button className="btn-modal-action btn-schedule" style={{ backgroundColor: '#1565c0' }} onClick={() => handleAcknowledgeStatus('booth_agent', 'confirmed')}>
                    {t('Done')}
                  </button>
                </div>
              </div>
            )}

            {bookingStep === 9 && (
              <div className="modal-step-success">
                <div className="modal-icon-wrapper success" style={{ backgroundColor: 'rgba(198, 40, 40, 0.12)' }}>
                  <i className="bi bi-x-circle-fill success-icon" style={{ color: '#c62828' }} />
                </div>
                <h2>{t('Booth Agent Application ℹ️')}</h2>
                <p className="success-text" style={{ fontSize: 13, lineHeight: '1.5' }}>
                  {t('Your application to become a BJP Booth Agent has been reviewed and rejected by the State Administrator at this time. Thank you for your interest.')}
                </p>
                <div className="modal-actions-row" style={{ marginTop: 20 }}>
                  <button className="btn-modal-action btn-schedule" style={{ backgroundColor: '#c62828' }} onClick={() => handleAcknowledgeStatus('booth_agent', 'rejected')}>
                    {t('Done')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
