import React, { useState } from 'react';
import { PhoneCall, X, Save } from 'lucide-react';

const AdminCallModal = ({ application, onClose, onUpdateStatus }) => {
  const [status, setStatus] = useState(application.status || 'Pending');
  const [remarks, setRemarks] = useState(application.adminRemarks || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e, isCallOnly = false) => {
    if (e) e.preventDefault();
    setIsSubmitting(true);
    await onUpdateStatus(application._id, {
      status: isCallOnly ? 'Called' : status,
      remarks,
      isCallAction: isCallOnly
    });
    setIsSubmitting(false);
    onClose();
  };

  const handleTriggerPhoneCall = () => {
    window.open(`tel:${application.mobile}`, '_self');
    handleSubmit(null, true);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '560px' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: '600', color: 'var(--color-midnight-ink)', margin: 0 }}>
              Update Application Status
            </h2>
            <div style={{ fontSize: '13px', color: 'var(--color-slate)' }}>
              Applicant: <strong style={{ color: 'var(--color-midnight-ink)' }}>{application.voterName}</strong> ({application.epicNo})
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-slate)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Applicant Details */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          padding: '14px',
          background: 'var(--color-fog-gray)',
          borderRadius: '8px',
          fontSize: '13px',
          marginBottom: '20px'
        }}>
          <div>
            <div style={{ color: 'var(--color-slate)' }}>Scheme:</div>
            <div style={{ color: 'var(--color-midnight-ink)', fontWeight: '600' }}>{application.schemeName}</div>
          </div>
          <div>
            <div style={{ color: 'var(--color-slate)' }}>Mobile:</div>
            <div style={{ color: 'var(--color-midnight-ink)', fontWeight: '600' }}>{application.mobile}</div>
          </div>
          <div>
            <div style={{ color: 'var(--color-slate)' }}>District / Assembly:</div>
            <div style={{ color: 'var(--color-midnight-ink)' }}>{application.district} / {application.assemblyName}</div>
          </div>
          <div>
            <div style={{ color: 'var(--color-slate)' }}>Booth Number:</div>
            <div style={{ color: 'var(--color-midnight-ink)' }}>Booth {application.boothNo}</div>
          </div>
        </div>

        {/* Direct Follow-up Call Button */}
        <div style={{ marginBottom: '20px', padding: '12px 16px', background: 'var(--color-sunlit-cream)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: '600', color: 'var(--color-ember-brown)', fontSize: '14px' }}>Direct Follow-up Call</div>
            <div style={{ fontSize: '12px', color: 'var(--color-stone)' }}>Triggers phone dialer and logs call timestamp.</div>
          </div>
          <button
            type="button"
            onClick={handleTriggerPhoneCall}
            className="btn btn-orange"
            style={{ padding: '6px 14px', fontSize: '13px' }}
          >
            <PhoneCall size={14} /> Call {application.mobile}
          </button>
        </div>

        <form onSubmit={(e) => handleSubmit(e, false)}>
          
          {/* Status Select */}
          <div className="form-group">
            <label className="form-label">Update Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="form-control"
            >
              <option value="Submitted">Submitted</option>
              <option value="Pending">Pending Review</option>
              <option value="Called">Called / Followed Up</option>
              <option value="In Progress">In Progress</option>
              <option value="Verified">Documents Verified</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>

          {/* Admin Remarks */}
          <div className="form-group">
            <label className="form-label">Admin Remarks / Notes</label>
            <textarea
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Enter follow up notes or verification status comments..."
              className="form-control"
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} className="btn btn-ghost" disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-filled" disabled={isSubmitting}>
              <Save size={14} /> Save Status
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

export default AdminCallModal;
