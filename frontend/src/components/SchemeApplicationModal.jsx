import React, { useState } from 'react';
import { X, CheckCircle2, Award, User, ShieldAlert, ArrowRight, Trash2 } from 'lucide-react';

const SchemeApplicationModal = ({ selectedSchemes, user, onClose, onConfirmSubmit, isSubmitting }) => {
  if (!selectedSchemes || selectedSchemes.length === 0) return null;

  const [schemesList, setSchemesList] = useState(selectedSchemes);

  const handleRemoveScheme = (schemeId) => {
    const updated = schemesList.filter(s => s.id !== schemeId);
    setSchemesList(updated);
    if (updated.length === 0) {
      onClose();
    }
  };

  const handleFinalSubmit = () => {
    if (onConfirmSubmit) {
      onConfirmSubmit(schemesList);
    }
  };

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.4)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div className="campsite-card" style={{
        maxWidth: '640px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '28px',
        background: 'var(--color-paper-white)',
        borderRadius: '16px',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
        boxSizing: 'border-box'
      }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-linen)', paddingBottom: '16px', marginBottom: '20px' }}>
          <div>
            <span className="tag-pill tag-sunlit" style={{ fontSize: '11px', marginBottom: '4px' }}>CONFIRM APPLICATION</span>
            <h2 className="text-heading" style={{ fontSize: '20px', margin: 0 }}>
              Selected Welfare Schemes ({schemesList.length})
            </h2>
            <div style={{ fontSize: '13px', color: 'var(--color-slate)', marginTop: '2px' }}>
              Review your selected BJP Nalam Thittam schemes before submitting
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '6px', borderRadius: '9999px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Voter Profile Snapshot */}
        <div style={{ background: 'var(--color-fog-gray)', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '9999px', background: 'var(--color-sunlit-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={18} color="var(--color-campfire-orange)" />
            </div>
            <div>
              <div style={{ fontWeight: '700', color: 'var(--color-midnight-ink)', fontSize: '14px' }}>{user?.voterName}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-slate)' }}>EPIC: {user?.epicNo} • Mobile: {user?.mobile}</div>
            </div>
          </div>
          <div className="tag-pill tag-active" style={{ fontSize: '12px' }}>
            {user?.district} • Booth #{user?.boothNo}
          </div>
        </div>

        {/* Selected Schemes List */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-slate)', textTransform: 'uppercase', marginBottom: '12px' }}>
            Selected Scheme Directives ({schemesList.length})
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {schemesList.map((scheme) => (
              <div
                key={scheme.id}
                style={{
                  padding: '14px 16px',
                  background: 'var(--color-paper-white)',
                  border: '1px solid var(--color-linen)',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <Award size={16} color="var(--color-campfire-orange)" />
                    <span style={{ fontWeight: '700', color: 'var(--color-midnight-ink)', fontSize: '15px' }}>{scheme.name}</span>
                    <span className="tag-pill tag-sunlit" style={{ fontSize: '10px' }}>{scheme.cluster}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--color-slate)', paddingLeft: '24px' }}>
                    Benefit: <strong style={{ color: 'var(--color-forest-pulse)' }}>{scheme.benefit}</strong>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveScheme(scheme.id)}
                  className="btn btn-ghost"
                  title="Remove scheme"
                  style={{ padding: '6px', color: 'var(--color-ember-crimson)' }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--color-linen)', paddingTop: '16px' }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '8px 18px' }}>
            Cancel
          </button>
          
          <button
            onClick={handleFinalSubmit}
            disabled={isSubmitting || schemesList.length === 0}
            className="btn btn-filled"
            style={{ padding: '10px 24px', fontSize: '14px', borderRadius: '9999px' }}
          >
            {isSubmitting ? 'Submitting Directives...' : `Submit Applications (${schemesList.length})`}
            <ArrowRight size={16} />
          </button>
        </div>

      </div>
    </div>
  );
};

export default SchemeApplicationModal;
