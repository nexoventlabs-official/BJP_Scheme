import React, { useState } from 'react';
import StatusBadge from './StatusBadge';
import { X, User, Phone, MapPin, Award, Calendar, FileText, CheckCircle2, PhoneCall } from 'lucide-react';

const AdminViewDetailsModal = ({ application, onClose, onUpdateStatus, onOpenCallModal }) => {
  if (!application) return null;

  const [currentStatus, setCurrentStatus] = useState(application.status || 'Pending');
  const [adminNote, setAdminNote] = useState(application.adminNotes || '');
  const [savingNote, setSavingNote] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const statusOptions = ['Pending', 'Submitted', 'Processing', 'Completed', 'Called', 'Verified', 'Rejected'];

  const handleStatusChange = async (newStatus) => {
    setCurrentStatus(newStatus);
    if (onUpdateStatus) {
      await onUpdateStatus(application._id, { status: newStatus, notes: adminNote });
      setSuccessMsg(`Status updated to ${newStatus}`);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  };

  const handleSaveNote = async () => {
    setSavingNote(true);
    if (onUpdateStatus) {
      await onUpdateStatus(application._id, { status: currentStatus, notes: adminNote });
      setSuccessMsg('Member notes saved successfully');
      setTimeout(() => setSuccessMsg(''), 3000);
    }
    setSavingNote(false);
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
        maxWidth: '680px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '28px',
        background: 'var(--color-paper-white)',
        borderRadius: '16px',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
        boxSizing: 'border-box'
      }}>
        
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-linen)', paddingBottom: '16px', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="tag-pill tag-sunlit" style={{ fontSize: '11px' }}>APPLICATION DETAILS</span>
              <StatusBadge status={currentStatus} />
            </div>
            <h2 className="text-heading" style={{ fontSize: '20px', margin: '4px 0 0' }}>
              Member Scheme Request Profile
            </h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '6px', borderRadius: '9999px' }}>
            <X size={18} />
          </button>
        </div>

        {successMsg && (
          <div className="tag-pill tag-success" style={{ width: '100%', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px' }}>
            <CheckCircle2 size={14} /> {successMsg}
          </div>
        )}

        {/* Member & Voter Information */}
        <div style={{ background: 'var(--color-fog-gray)', borderRadius: '12px', padding: '18px', marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-slate)', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <User size={14} color="var(--color-campfire-orange)" /> Member Demographic Profile
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', fontSize: '13px' }}>
            <div>
              <div style={{ color: 'var(--color-slate)', fontSize: '11px' }}>Voter Full Name</div>
              <div style={{ fontWeight: '700', color: 'var(--color-midnight-ink)', fontSize: '15px' }}>{application.voterName}</div>
            </div>
            <div>
              <div style={{ color: 'var(--color-slate)', fontSize: '11px' }}>EPIC ID Number</div>
              <div style={{ fontWeight: '700', color: 'var(--color-midnight-ink)', fontFamily: 'var(--font-ui-monospace)' }}>{application.epicNo}</div>
            </div>
            <div>
              <div style={{ color: 'var(--color-slate)', fontSize: '11px' }}>Mobile Contact</div>
              <div style={{ fontWeight: '600', color: 'var(--color-midnight-ink)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Phone size={12} color="var(--color-campfire-orange)" /> {application.mobile}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--color-slate)', fontSize: '11px' }}>Jurisdiction Location</div>
              <div style={{ fontWeight: '600', color: 'var(--color-midnight-ink)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <MapPin size={12} color="var(--color-campfire-orange)" /> {application.district} • {application.assemblyName}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--color-slate)', fontSize: '11px' }}>Polling Booth / Part No</div>
              <div style={{ fontWeight: '700', color: 'var(--color-midnight-ink)' }}>Booth #{application.boothNo}</div>
            </div>
            <div>
              <div style={{ color: 'var(--color-slate)', fontSize: '11px' }}>Application Date</div>
              <div style={{ color: 'var(--color-midnight-ink)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={12} /> {new Date(application.createdAt || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>
          </div>
        </div>

        {/* Scheme Requested Details */}
        <div style={{ background: 'var(--color-fog-gray)', borderRadius: '12px', padding: '18px', marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-slate)', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Award size={14} color="var(--color-campfire-orange)" /> Requested Scheme Benefit
          </div>

          <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--color-midnight-ink)', marginBottom: '4px' }}>
            {application.schemeName}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--color-slate)', marginBottom: '8px' }}>
            Benefit Directive: <strong style={{ color: 'var(--color-forest-pulse)' }}>{application.benefit}</strong>
          </div>
        </div>

        {/* Status Update & Remarks Action Panel */}
        <div style={{ border: '1px solid var(--color-linen)', borderRadius: '12px', padding: '18px', marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-slate)', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={14} color="var(--color-campfire-orange)" /> Update Application Status & Notes
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-midnight-ink)', display: 'block', marginBottom: '6px' }}>
                Update Request Status
              </label>
              <select
                value={currentStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="form-control"
                style={{ fontWeight: '600', color: 'var(--color-midnight-ink)', background: 'var(--color-paper-white)' }}
              >
                {statusOptions.map((st) => (
                  <option key={st} value={st}>
                    {st === 'Processing' ? 'Processing (In Progress)' : st === 'Completed' ? 'Completed (Approved)' : st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-midnight-ink)', display: 'block', marginBottom: '6px' }}>
                Quick Phone Tele-calling
              </label>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (onOpenCallModal) onOpenCallModal(application);
                }}
                className="btn btn-filled"
                style={{ width: '100%', padding: '9px', fontSize: '13px' }}
              >
                <PhoneCall size={14} /> Call Voter & Log Result
              </button>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-midnight-ink)', display: 'block', marginBottom: '6px' }}>
              Admin Member Remarks / Verification Notes
            </label>
            <textarea
              rows={3}
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder="Enter internal verification remarks, document checks, or tele-calling responses..."
              className="form-control"
              style={{ fontSize: '13px' }}
            />
            <button
              type="button"
              onClick={handleSaveNote}
              disabled={savingNote}
              className="btn btn-ghost"
              style={{ marginTop: '10px', fontSize: '12px', padding: '6px 14px' }}
            >
              {savingNote ? 'Saving...' : 'Save Remarks & Notes'}
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '8px 20px' }}>
            Close Details
          </button>
        </div>

      </div>
    </div>
  );
};

export default AdminViewDetailsModal;
