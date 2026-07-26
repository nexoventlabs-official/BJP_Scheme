import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { useLang } from '../i18n/LanguageContext'

/**
 * FlipCard3D
 * ----------
 * Props:
 *  cardData  — voter/card data object
 *  backUrl   — Cloudinary URL of back card image (black_original1.png)
 *  width     — display width in px (default 320)
 *  autoFlip  — auto-rotates to back briefly after mount
 *  showActions — show download/view buttons
 */
export const FlipCard3D = forwardRef(function FlipCard3D(
  { cardData, backUrl, width = 320, autoFlip = false, showActions = true, onCardClick = null, showDownloadIcon = false },
  ref
) {
  const { t } = useLang()
  const [flipped, setFlipped]     = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [loading, setLoading] = useState(true)
  // iOS: preview overlay { url, blob, filename } — reliable save on all iOS browsers
  const [iosPreview, setIosPreview] = useState(null)
  const iframeRef = useRef(null)

  // Card original dimensions
  const ORIG_W = 1576
  const ORIG_H = 998
  const scale  = width / ORIG_W
  const height = Math.round(ORIG_H * scale)

  // Auto-flip: disabled for front-side only card
  useEffect(() => {}, [])

  useImperativeHandle(ref, () => ({
    flip:     () => {},
    download: () => handleDownload(),
  }))

  // ── Fill the iframe with card data ──────────────────────────────
  const handleIframeLoad = () => {
    const iframe = iframeRef.current
    if (!iframe || !cardData) return
    try {
      const doc = iframe.contentDocument || iframe.contentWindow.document
      if (!doc) return

      // Hide the form panel
      const formPanel = doc.querySelector('.form-panel')
      if (formPanel) formPanel.style.display = 'none'

      // Remove all body/html padding so card fills the iframe exactly
      doc.documentElement.style.cssText = 'margin:0;padding:0;overflow:hidden;height:998px'
      doc.body.style.cssText = 'margin:0;padding:0;overflow:hidden;background:transparent;display:block;min-height:0'

      // Remove card-wrap scaling — show at true 1:1 so iframe clip works
      const cardWrap = doc.querySelector('.card-wrap')
      if (cardWrap) {
        cardWrap.style.cssText = 'transform:none;margin:0;padding:0;flex-shrink:0'
      }

      // Populate fields
      const set = (id, val) => { const el = doc.getElementById(id); if (el) el.value = val }
      const name     = String(cardData.name || cardData.voter_name || cardData.VOTER_NAME || '')
                        .replace(/-/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()
      const epic     = String(cardData.epic_no || cardData.EPIC_NO || '').toUpperCase()
      const assembly = String(cardData.assembly_name || cardData.assembly || cardData.ASSEMBLY_NAME || '').toUpperCase()
      const booth    = String(cardData.part_no || cardData.booth_no || cardData.PART_NO || '')
      const district = String(cardData.district || cardData.DISTRICT || cardData.DISTRICT_NAME || '').toUpperCase()
      const bjpCode  = cardData.bjp_code || cardData.ptc_code || ''
      const midVal   = (bjpCode || (epic ? `BJP-${epic.slice(-6)}` : '')).toUpperCase()
      const photoUrl = cardData.photo_url || cardData.PHOTO_URL || ''

      set('f-name', name); set('f-epic', epic); set('f-asm', assembly)
      set('f-booth', booth); set('f-dist', district); set('f-mid', midVal)

      const photoImg = doc.getElementById('member-photo-img')
      const photoBox = doc.getElementById('photo-box')
      if (photoImg && photoUrl) {
        photoImg.crossOrigin = 'anonymous';
        photoImg.src = photoUrl
        photoImg.style.display = 'block'
        if (photoBox) {
          const svg  = photoBox.querySelector('svg')
          const span = photoBox.querySelector('span')
          if (svg)  svg.style.display  = 'none'
          if (span) span.style.display = 'none'
        }
      }

      const qrImg = doc.getElementById('qr-img')
      if (qrImg && epic) {
        let qrData = cardData.referral_link || '';
        if (!qrData && bjpCode && cardData.referral_id) {
          qrData = `${window.location.origin}/refer/${bjpCode}/${cardData.referral_id}`;
        }
        if (!qrData) {
          qrData = `${window.location.origin}/verify/${bjpCode || epic}`;
        }
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&ecc=H&data=${encodeURIComponent(qrData)}`;
      }

      if (typeof iframe.contentWindow.generate === 'function') {
        iframe.contentWindow.generate()
      }

      // Hide first field-row decorators (icon/label/colon)
      const firstRow = doc.querySelector('.fields .field-row')
      if (firstRow) {
        ;['.field-icon', '.field-label', '.field-colon'].forEach(cls => {
          const el = firstRow.querySelector(cls)
          if (el) el.style.display = 'none'
        })
        const val = firstRow.querySelector('.field-value')
        if (val) val.style.maxWidth = '600px'
      }
      setLoading(false)
    } catch (e) {
      console.error('FlipCard3D iframe error:', e)
      setLoading(false)
    }
  }

  // ── Download: front (html2canvas) + back (image) side-by-side ──
  const handleDownload = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      const iframe = iframeRef.current
      if (!iframe?.contentWindow) throw new Error('iframe not ready')

      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document
      const cardEl    = iframeDoc?.getElementById('card')
      if (!cardEl) throw new Error('card element not found')

      // Ensure html2canvas is loaded in the iframe
      const h2c = iframe.contentWindow.html2canvas
      if (!h2c) throw new Error('html2canvas not loaded')

      // Capture front card via html2canvas (full res 1576×998)
      // Temporarily remove scaling so it captures at full size
      const wrap = iframeDoc.querySelector('.card-wrap')
      if (wrap) { wrap.style.transform = 'none'; wrap.style.margin = '0' }

      // Wait for the card's web fonts (Poppins / Barlow / Great Vibes) to finish
      // loading INSIDE the iframe before capturing. Otherwise html2canvas can
      // snapshot with a fallback system font on slow/rural connections → wrong
      // font + broken text spacing. Capped so a stuck font never hangs download.
      try {
        if (iframeDoc.fonts && iframeDoc.fonts.ready) {
          await Promise.race([
            iframeDoc.fonts.ready,
            new Promise((resolve) => setTimeout(resolve, 3000)),
          ])
        }
      } catch { /* proceed with capture regardless */ }

      const frontCanvas = await h2c(cardEl, {
        scale: 3,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#F9F8F6',
        width:  ORIG_W,
        height: ORIG_H,
      })

      const epic     = String(cardData?.epic_no || cardData?.EPIC_NO || 'member').toUpperCase()
      const filename = `BJP_Card_${epic}.png`

      // Get a PNG blob (works better than a data URL for large images)
      const blob = await new Promise((resolve) => frontCanvas.toBlob(resolve, 'image/png', 1.0))
      if (!blob) throw new Error('blob generation failed')

      // iOS / iPadOS: WebKit ignores the <a download> attribute (this is true
      // for Chrome/Firefox on iOS too — they're all WebKit). Use the Web Share
      // API so the user can "Save to Photos"; fall back to opening the image.
      const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

      if (isIOS) {
        // Show an in-app preview overlay. This is reliable across ALL iOS
        // browsers (Safari, Chrome/CriOS, Firefox) because it doesn't depend on
        // the <a download> attribute, popups, or a live user-activation window
        // (html2canvas takes ~1-2s, after which Chrome-iOS blocks share/popup).
        // The overlay's Save button fires on a FRESH tap, so navigator.share
        // works; long-press on the image also saves to Photos.
        const url = URL.createObjectURL(blob)
        setIosPreview((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url)
          return { url, blob, filename }
        })
        return
      }

      // Desktop / Android: standard blob download
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      console.error('Download failed:', err)
      // Fallback: use iframe's own downloadPNG if our method fails
      const iframe = iframeRef.current
      if (iframe?.contentWindow?.downloadPNG) iframe.contentWindow.downloadPNG()
    } finally {
      setDownloading(false)
    }
  }

  // iOS overlay: "Save / Share" fires on a fresh tap → valid user activation,
  // so navigator.share works even on Chrome-iOS. Falls back to opening the image.
  const handleIosSave = async () => {
    if (!iosPreview) return
    const file = new File([iosPreview.blob], iosPreview.filename, { type: 'image/png' })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'BJP Member ID Card' })
        return
      } catch (e) {
        if (e && e.name === 'AbortError') return  // user cancelled — leave overlay open
      }
    }
    // No file-share support → open the image in a new tab for long-press save
    window.open(iosPreview.url, '_blank')
  }

  const closeIosPreview = () => {
    setIosPreview((prev) => {
      if (prev?.url) setTimeout(() => URL.revokeObjectURL(prev.url), 500)
      return null
    })
  }

  const cardStyle = { width: `${width}px`, height: `${height}px` }

  return (
    <div className="flip-card-wrapper" style={{ width: `${width}px` }}>
      <style>{`
        .card-skeleton {
          position: absolute;
          inset: 0;
          background: #f9f8f6;
          border-radius: 12px;
          padding: 16px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          z-index: 10;
          border: 1px solid rgba(0, 0, 0, 0.08);
          overflow: hidden;
          transition: opacity 0.3s ease;
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

      {/* Card Display Container */}
      <div
        style={cardStyle}
      >
        {/* FRONT ONLY */}
        <div style={{ width: `${width}px`, height: `${height}px`, overflow: 'hidden', borderRadius: 12, position: 'relative', background: '#F9F8F6', boxShadow: 'var(--shadow-card)' }}>
          {/* Tap-to-open-full-view overlay (chat card only) */}
          {onCardClick && (
            <div
              role="button"
              aria-label={t('Full View')}
              onClick={onCardClick}
              style={{ position: 'absolute', inset: 0, zIndex: 11, cursor: 'pointer' }}
            />
          )}
          {/* Top-right download icon (chat card only) */}
          {showDownloadIcon && (
            <button
              type="button"
              aria-label={t('Download')}
              title={t('Download')}
              disabled={downloading}
              onClick={(e) => { e.stopPropagation(); handleDownload() }}
              style={{
                position: 'absolute', top: 8, right: 8, zIndex: 12,
                width: 34, height: 34, borderRadius: '50%',
                border: 'none', cursor: downloading ? 'default' : 'pointer',
                background: 'rgba(242, 101, 34, 0.95)', color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)', fontSize: 15,
              }}
            >
              {downloading
                ? <span className="spinner-border spinner-border-sm" style={{ width: 14, height: 14, borderWidth: 2 }} />
                : <i className="bi bi-download" />}
            </button>
          )}
          {loading && (
            <div className="card-skeleton">
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
          <iframe
            ref={iframeRef}
            src="/bjp_card_design.html?v=2"
            title="Card Front"
            style={{
              position: 'absolute', left: 0, top: 0,
              width: `${ORIG_W}px`, height: `${ORIG_H}px`,
              border: 'none',
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              pointerEvents: 'none',
              maxWidth: 'none',
              opacity: loading ? 0 : 1,
              transition: 'opacity 0.3s ease'
            }}
            onLoad={handleIframeLoad}
          />
        </div>
      </div>

      {showActions && (
        <div className="flip-card-actions">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flip-action-btn flip-action-download"
          >
            {downloading
              ? <><span className="spinner-border spinner-border-sm" style={{ width: 12, height: 12, borderWidth: 2 }} /> {t('Preparing…')}</>
              : <><i className="bi bi-download" /> {t('Download')}</>
            }
          </button>
          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent('show-card-modal', { detail: cardData }))
            }}
            className="flip-action-btn"
          >
            <i className="bi bi-eye" /> {t('Full View')}
          </button>
        </div>
      )}

      {/* iOS save overlay — long-press the image OR tap Save to Photos */}
      {iosPreview && (
        <div
          onClick={closeIosPreview}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 20, gap: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, maxWidth: 520, width: '100%' }}
          >
            <p style={{ color: '#fff', fontSize: 14, textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
              Press &amp; hold the card and tap <b>“Save to Photos”</b>, or use the button below.
            </p>
            <img
              src={iosPreview.url}
              alt="BJP Member ID Card"
              style={{ width: '100%', height: 'auto', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}
            />
            <div style={{ display: 'flex', gap: 12, width: '100%' }}>
              <button
                onClick={handleIosSave}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 10, border: 'none',
                  background: '#F26522', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <i className="bi bi-download" /> Save to Photos
              </button>
              <button
                onClick={closeIosPreview}
                style={{
                  padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.4)',
                  background: 'transparent', color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
