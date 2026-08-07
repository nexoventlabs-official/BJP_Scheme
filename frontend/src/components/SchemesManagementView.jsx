import React, { useState, useEffect, useRef, useCallback } from 'react';
import API from '../utils/api';
import { loadSchemes } from '../utils/schemesData';
import { Plus, Pencil, Trash2, X, UploadCloud, RefreshCw, ImageIcon, Check } from 'lucide-react';

const REQUIRED_W = 1100;
const REQUIRED_H = 385;

const EMPTY_FORM = {
  name: '', fullName: '', cluster: '', clusterShort: '', benefit: '', icon: '📄', highlight: '',
  overview: '', eligibility: '', howToApply: '', link: '',
  tags: '', documents: '', steps: '', keys: '',
  name_ta: '', fullName_ta: '', cluster_ta: '', benefit_ta: '', highlight_ta: '',
  overview_ta: '', eligibility_ta: '', howToApply_ta: '', tags_ta: '', documents_ta: '',
  order: '', active: true,
};

const csvToArr = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const arrToCsv = (a) => (Array.isArray(a) ? a.join(', ') : (a || ''));

const SchemesManagementView = () => {
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null); // scheme.id when editing, null when adding
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageBase64, setImageBase64] = useState(null); // new upload data URI
  const [imagePreview, setImagePreview] = useState('');  // preview (existing or new)
  const [imageError, setImageError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const fileRef = useRef(null);

  const fetchSchemes = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/admin/schemes');
      if (data.success) setSchemes(data.schemes || []);
    } catch (err) {
      console.error('Failed to load schemes:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSchemes(); }, [fetchSchemes]);

  const flashToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setImageBase64(null);
    setImagePreview('');
    setImageError('');
    setShowForm(true);
  };

  const openEdit = (s) => {
    setEditingId(s.id);
    setForm({
      name: s.name || '', fullName: s.fullName || '', cluster: s.cluster || '', clusterShort: s.clusterShort || '',
      benefit: s.benefit || '', icon: s.icon || '📄', highlight: s.highlight || '',
      overview: s.overview || '', eligibility: s.eligibility || '', howToApply: s.howToApply || '', link: s.link || '',
      tags: arrToCsv(s.tags), documents: arrToCsv(s.documents), steps: arrToCsv(s.steps), keys: arrToCsv(s.keys),
      name_ta: s.name_ta || '', fullName_ta: s.fullName_ta || '', cluster_ta: s.cluster_ta || '',
      benefit_ta: s.benefit_ta || '', highlight_ta: s.highlight_ta || '', overview_ta: s.overview_ta || '',
      eligibility_ta: s.eligibility_ta || '', howToApply_ta: s.howToApply_ta || '',
      tags_ta: arrToCsv(s.tags_ta), documents_ta: arrToCsv(s.documents_ta),
      order: s.order != null ? String(s.order) : '', active: s.active !== false,
    });
    setImageBase64(null);
    setImagePreview(s.backgroundImage || '');
    setImageError('');
    setShowForm(true);
  };

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleImagePick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImageError('');
    if (!file.type.startsWith('image/')) { setImageError('Please choose an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setImageError('Image must be under 5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      // Any image is accepted — it is auto-resized to REQUIRED_W x REQUIRED_H
      // on the server (Cloudinary incoming transformation).
      setImageBase64(reader.result);
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const buildPayload = () => {
    const p = {
      name: form.name.trim(),
      fullName: form.fullName.trim(),
      cluster: form.cluster.trim(),
      clusterShort: (form.clusterShort || form.cluster.replace(/^Cluster\s*\d+\s*[—-]\s*/i, '').replace(/^Foundation Layer$/i, 'Foundation')).trim(),
      benefit: form.benefit.trim(),
      icon: form.icon.trim() || '📄',
      highlight: form.highlight.trim(),
      overview: form.overview.trim(),
      eligibility: form.eligibility.trim(),
      howToApply: form.howToApply.trim(),
      link: form.link.trim(),
      tags: csvToArr(form.tags),
      documents: csvToArr(form.documents),
      steps: csvToArr(form.steps),
      keys: csvToArr(form.keys),
      name_ta: form.name_ta.trim(),
      fullName_ta: form.fullName_ta.trim(),
      cluster_ta: form.cluster_ta.trim(),
      benefit_ta: form.benefit_ta.trim(),
      highlight_ta: form.highlight_ta.trim(),
      overview_ta: form.overview_ta.trim(),
      eligibility_ta: form.eligibility_ta.trim(),
      howToApply_ta: form.howToApply_ta.trim(),
      tags_ta: csvToArr(form.tags_ta),
      documents_ta: csvToArr(form.documents_ta),
      active: !!form.active,
    };
    if (form.order !== '' && !isNaN(Number(form.order))) p.order = Number(form.order);
    if (imageBase64) p.imageBase64 = imageBase64;
    return p;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { flashToast('Scheme name is required.'); return; }
    if (!editingId && !imageBase64) { setImageError(`A ${REQUIRED_W} × ${REQUIRED_H}px scheme image is required.`); return; }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (editingId) {
        await API.put(`/admin/schemes/${editingId}`, payload);
        flashToast('Scheme updated successfully.');
      } else {
        await API.post('/admin/schemes', payload);
        flashToast('Scheme created successfully.');
      }
      setShowForm(false);
      await fetchSchemes();
      loadSchemes(true); // refresh the public/runtime catalog cache
    } catch (err) {
      flashToast(err.response?.data?.message || 'Failed to save scheme.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s) => {
    if (!confirm(`Delete "${s.name}"? Existing applications for this scheme are kept, but it will no longer be selectable.`)) return;
    try {
      await API.delete(`/admin/schemes/${s.id}`);
      flashToast('Scheme deleted.');
      await fetchSchemes();
      loadSchemes(true);
    } catch (err) {
      flashToast(err.response?.data?.message || 'Failed to delete scheme.');
    }
  };

  const inputStyle = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box', outline: 'none' };
  const labelStyle = { fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.03em' };
  const field = (label, key, opts = {}) => (
    <div style={{ marginBottom: 10 }}>
      <label style={labelStyle}>{label}{opts.required && <span style={{ color: '#dc2626' }}> *</span>}</label>
      {opts.textarea ? (
        <textarea rows={opts.rows || 2} value={form[key]} onChange={(e) => setField(key, e.target.value)} placeholder={opts.ph || ''} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
      ) : (
        <input type="text" value={form[key]} onChange={(e) => setField(key, e.target.value)} placeholder={opts.ph || ''} style={inputStyle} />
      )}
    </div>
  );

  // Cluster suggestions derived from the actual schemes in the DB, so the list
  // always reflects the clusters your schemes really belong to (admins can also
  // type a brand-new cluster).
  const clusterSuggestions = [...new Set(schemes.map((s) => (s.cluster || '').trim()).filter(Boolean))].sort();

  // Required fields — the Create/Save button stays locked until all are filled
  // (a new scheme also requires an image).
  const REQUIRED_FIELDS = ['name', 'fullName', 'cluster', 'benefit', 'overview'];
  const missingRequired = REQUIRED_FIELDS.filter((k) => !String(form[k] || '').trim());
  const needsImage = !editingId && !imageBase64;
  const isFormValid = missingRequired.length === 0 && !needsImage;

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1d1d1f' }}>Manage Schemes</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            {schemes.length} scheme{schemes.length === 1 ? '' : 's'} · shown in the chatbot, registration & all dashboards
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchSchemes} className="btn-action btn-view" style={{ padding: '9px 14px', fontSize: 13 }}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={openAdd} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: 'none', background: '#FF9933', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <Plus size={16} /> Add Scheme
          </button>
        </div>
      </div>

      {toast && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Check size={15} /> {toast}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 24px', gap: 14 }}>
          <div style={{ width: 36, height: 36, border: '4px solid #f1f5f9', borderTopColor: '#FF9933', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <div style={{ fontSize: 14, color: '#64748b' }}>Loading schemes...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {schemes.map((s) => (
            <div key={s.id} style={{ border: '1px solid #e5e5ea', borderRadius: 16, overflow: 'hidden', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ position: 'relative', width: '100%', aspectRatio: `${REQUIRED_W} / ${REQUIRED_H}`, background: s.backgroundImage ? `url("${encodeURI(s.backgroundImage)}") center / cover no-repeat` : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {!s.backgroundImage && <ImageIcon size={28} color="#94a3b8" />}
                {s.active === false && (
                  <span style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(220,38,38,0.9)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>INACTIVE</span>
                )}
              </div>
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1d1d1f', lineHeight: 1.2 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>#{s.id} · {s.clusterShort || s.cluster || '—'}</div>
                  </div>
                </div>
                {s.benefit && <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.4 }}>{s.benefit}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 8 }}>
                  <button onClick={() => openEdit(s)} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                    <Pencil size={13} /> Edit
                  </button>
                  <button onClick={() => handleDelete(s)} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
          <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 720, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#1d1d1f' }}>{editingId ? 'Edit Scheme' : 'Add New Scheme'}</h3>
              <button type="button" onClick={() => setShowForm(false)} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
            </div>

            <div style={{ padding: 20, maxHeight: '72vh', overflowY: 'auto' }}>
              {/* Image uploader */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Scheme Image{!editingId && <span style={{ color: '#dc2626' }}> *</span>} — auto-resized to {REQUIRED_W} × {REQUIRED_H}px on upload (any image works)</label>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ width: 264, aspectRatio: `${REQUIRED_W} / ${REQUIRED_H}`, borderRadius: 12, border: '1px dashed #94a3b8', background: imagePreview ? `url("${imagePreview}") center / cover no-repeat` : '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {!imagePreview && <ImageIcon size={26} color="#94a3b8" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <input type="file" ref={fileRef} accept="image/*" onChange={handleImagePick} style={{ display: 'none' }} />
                    <button type="button" onClick={() => fileRef.current?.click()} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      <UploadCloud size={15} /> {imagePreview ? 'Replace Image' : 'Upload Image'}
                    </button>
                    <p style={{ fontSize: 11.5, color: '#94a3b8', margin: '8px 0 0', lineHeight: 1.5 }}>
                      PNG or JPG, up to 5 MB. Uploaded to Cloudinary and automatically resized to {REQUIRED_W} × {REQUIRED_H}px — any image size works.
                    </p>
                    {imageError && <p style={{ fontSize: 12, color: '#dc2626', margin: '8px 0 0', fontWeight: 600 }}>{imageError}</p>}
                  </div>
                </div>
              </div>

              {/* English fields */}
              <div style={{ fontSize: 12, fontWeight: 800, color: '#FF9933', margin: '4px 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>English</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {field('Short Name', 'name', { ph: 'e.g. PMSBY', required: true })}
                {field('Full Title', 'fullName', { ph: 'PMSBY — Suraksha Bima Yojana', required: true })}
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Cluster<span style={{ color: '#dc2626' }}> *</span></label>
                <input
                  list="scheme-cluster-list"
                  value={form.cluster}
                  onChange={(e) => setField('cluster', e.target.value)}
                  placeholder="Select an existing cluster or type a new one"
                  style={inputStyle}
                />
                <datalist id="scheme-cluster-list">
                  {clusterSuggestions.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              {field('Benefit (short line)', 'benefit', { ph: '₹2L accident insurance — ₹20/year', required: true })}
              {field('Highlight badge', 'highlight', { ph: '₹2L ACCIDENT COVER — ₹20/YR' })}
              {field('Overview', 'overview', { textarea: true, rows: 3, required: true })}
              {field('Eligibility', 'eligibility', { textarea: true, rows: 2 })}
              {field('How to Apply', 'howToApply', { textarea: true, rows: 2 })}
              {field('Official Link', 'link', { ph: 'https://...' })}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {field('Tags (comma separated)', 'tags', { ph: 'Accident, ₹2 Lakh' })}
                {field('Documents (comma separated)', 'documents', { ph: 'Aadhaar, Bank Passbook' })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {field('Steps (comma separated)', 'steps')}
                {field('Search keys (comma separated)', 'keys', { ph: 'pmsby, suraksha' })}
              </div>

              {/* Tamil fields */}
              <div style={{ fontSize: 12, fontWeight: 800, color: '#FF9933', margin: '14px 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em', borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>தமிழ் (Tamil)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {field('Short Name (TA)', 'name_ta')}
                {field('Full Title (TA)', 'fullName_ta')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {field('Cluster (TA)', 'cluster_ta')}
                {field('Benefit (TA)', 'benefit_ta')}
              </div>
              {field('Highlight (TA)', 'highlight_ta')}
              {field('Overview (TA)', 'overview_ta', { textarea: true, rows: 3 })}
              {field('Eligibility (TA)', 'eligibility_ta', { textarea: true, rows: 2 })}
              {field('How to Apply (TA)', 'howToApply_ta', { textarea: true, rows: 2 })}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {field('Tags (TA, comma separated)', 'tags_ta')}
                {field('Documents (TA, comma separated)', 'documents_ta')}
              </div>

              {/* Meta */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end', marginTop: 6 }}>
                {field('Display order', 'order', { ph: 'e.g. 24' })}
                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>Status</label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '9px 0' }}>
                    <input type="checkbox" checked={form.active} onChange={(e) => setField('active', e.target.checked)} style={{ width: 16, height: 16 }} />
                    Active (visible to users)
                  </label>
                </div>
              </div>
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, position: 'sticky', bottom: 0, background: '#fff' }}>
              <span style={{ fontSize: 12, color: isFormValid ? '#16a34a' : '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {isFormValid
                  ? (<><Check size={14} /> All required fields filled</>)
                  : <>Fill all required fields (<span style={{ color: '#dc2626', fontWeight: 700 }}>*</span>) to enable</>}
              </span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={saving || !isFormValid} style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: '#FF9933', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: (saving || !isFormValid) ? 'not-allowed' : 'pointer', opacity: (saving || !isFormValid) ? 0.55 : 1 }}>
                  {saving ? 'Saving…' : (editingId ? 'Save Changes' : 'Create Scheme')}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default SchemesManagementView;
