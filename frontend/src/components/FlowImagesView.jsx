import React, { useState, useEffect, useRef, useCallback } from 'react';
import API from '../utils/api';
import { UploadCloud, Trash2, RefreshCw, ImageIcon, Check, MessageCircle } from 'lucide-react';

const fileToDataUri = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

// A single image slot with preview + upload + delete.
function ImageSlot({ label, url, onUpload, onDelete, aspect = '16 / 9' }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please choose an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5 MB.'); return; }
    setBusy(true);
    try { await onUpload(await fileToDataUri(file)); } finally { setBusy(false); }
  };

  return (
    <div style={{ border: '1px solid #e5e5ea', borderRadius: 12, padding: 12, background: '#fff' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 8 }}>{label}</div>
      <div style={{ width: '100%', aspectRatio: aspect, borderRadius: 8, border: '1px dashed #cbd5e1', background: url ? `url("${url}") center / cover no-repeat` : '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        {!url && <ImageIcon size={22} color="#94a3b8" />}
      </div>
      <input type="file" ref={ref} accept="image/*" onChange={pick} style={{ display: 'none' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => ref.current?.click()} disabled={busy} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', fontSize: 12, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>
          <UploadCloud size={13} /> {busy ? 'Uploading…' : (url ? 'Replace' : 'Upload')}
        </button>
        {url && (
          <button onClick={onDelete} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 10px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

const FlowImagesView = () => {
  const [globals, setGlobals] = useState([]);
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/admin/flow-images');
      if (data.success) { setGlobals(data.globals || []); setSchemes(data.schemes || []); }
    } catch (err) {
      console.error('Failed to load flow images:', err);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  const uploadGlobal = async (key, dataUri) => {
    try { await API.post(`/admin/flow-images/global/${key}`, { imageBase64: dataUri }); flash('Image updated.'); await fetchAll(); }
    catch (err) { alert(err.response?.data?.message || 'Upload failed.'); }
  };
  const deleteGlobal = async (key) => {
    if (!confirm('Remove this image?')) return;
    try { await API.delete(`/admin/flow-images/global/${key}`); flash('Removed.'); await fetchAll(); }
    catch (err) { alert(err.response?.data?.message || 'Delete failed.'); }
  };
  const uploadScheme = async (id, type, dataUri) => {
    try { await API.post(`/admin/flow-images/scheme/${id}/${type}`, { imageBase64: dataUri }); flash('Scheme image updated.'); await fetchAll(); }
    catch (err) { alert(err.response?.data?.message || 'Upload failed.'); }
  };
  const deleteScheme = async (id, type) => {
    if (!confirm('Remove this image?')) return;
    try { await API.delete(`/admin/flow-images/scheme/${id}/${type}`); flash('Removed.'); await fetchAll(); }
    catch (err) { alert(err.response?.data?.message || 'Delete failed.'); }
  };

  const groupLabels = { headers: 'Message Headers', banners: 'Flow Banners', icons: 'Icons', service_icons: 'Service Icons' };
  const grouped = globals.reduce((acc, g) => { (acc[g.group] = acc[g.group] || []).push(g); return acc; }, {});

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1d1d1f', display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageCircle size={20} color="#25D366" /> WhatsApp Flow Images
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Headers, banners, service icons and per-scheme WhatsApp logo/banner used in the WhatsApp bot.</p>
        </div>
        <button onClick={fetchAll} className="btn-action btn-view" style={{ padding: '9px 14px', fontSize: 13 }}><RefreshCw size={14} /> Refresh</button>
      </div>

      {toast && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Check size={15} /> {toast}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px', gap: 14 }}>
          <div style={{ width: 36, height: 36, border: '4px solid #f1f5f9', borderTopColor: '#FF9933', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <div style={{ fontSize: 14, color: '#64748b' }}>Loading…</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <>
          {Object.keys(grouped).map((group) => (
            <div key={group} style={{ marginBottom: 22 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#FF9933', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>{groupLabels[group] || group}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
                {grouped[group].map((g) => (
                  <ImageSlot
                    key={g.key}
                    label={g.label}
                    url={g.url}
                    aspect={g.group === 'banners' ? '8 / 1' : g.group.includes('icon') ? '1 / 1' : '16 / 9'}
                    onUpload={(dataUri) => uploadGlobal(g.key, dataUri)}
                    onDelete={() => deleteGlobal(g.key)}
                  />
                ))}
              </div>
            </div>
          ))}

          <div style={{ marginBottom: 22 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#FF9933', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Per-Scheme WhatsApp Images</h3>
            <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 12px' }}>Logo appears in the scheme list; banner appears on the scheme details screen (WhatsApp only — separate from the web image).</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {schemes.map((s) => (
                <div key={s.id} style={{ border: '1px solid #e5e5ea', borderRadius: 12, padding: 14, background: '#fff' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#1d1d1f', marginBottom: 10 }}>#{s.id} · {s.name}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>
                    <ImageSlot label="Logo (list icon)" url={s.waLogo} aspect="1 / 1" onUpload={(d) => uploadScheme(s.id, 'logo', d)} onDelete={() => deleteScheme(s.id, 'logo')} />
                    <ImageSlot label="Details Banner" url={s.waBanner} aspect="8 / 1" onUpload={(d) => uploadScheme(s.id, 'banner', d)} onDelete={() => deleteScheme(s.id, 'banner')} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FlowImagesView;
