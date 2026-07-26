import React, { useState } from 'react';
import StatusBadge from './StatusBadge';
import {
  X, User, Phone, MapPin, Award, Calendar, CheckCircle2, Clock, PhoneCall, RefreshCw, AlertCircle, FileText, ChevronRight
} from 'lucide-react';

const MemberProfileTimelineModal = ({ voterData, onClose, onUpdateAppStatus, onOpenCallModal }) => {
  if (!voterData) return null;

  // voterData structure: { epicNo, voterName, mobile, district, assemblyName, boothNo, applications: [...] }
  const { voterName, epicNo, mobile, district, assemblyName, boothNo, applications = [] } = voterData;

  const [appsState, setAppsState] = useState(applications);
  const [selectedAppId, setSelectedAppId] = useState(applications[0]?._id);
  const [notesState, setNotesState] = useState({});
  const [savingAppId, setSavingAppId] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  const statusOptions = ['Pending', 'Submitted', 'Processing', 'Completed', 'Called', 'Verified', 'Rejected'];

  const handleStatusChange = async (appId, newStatus) => {
    try {
      const note = notesState[appId] || '';
      if (onUpdateAppStatus) {
        await onUpdateAppStatus(appId, { status: newStatus, notes: note });
      }
      setAppsState(prev => prev.map(a => a._id === appId ? { ...a, status: newStatus } : a));
      setToastMsg(`Status updated to ${newStatus}`);
      setTimeout(() => setToastMsg(''), 3000);
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const handleSaveNotes = async (appId) => {
    setSavingAppId(appId);
    try {
      const app = appsState.find(a => a._id === appId);
      const note = notesState[appId] || app?.adminRemarks || '';
      if (onUpdateAppStatus) {
        await onUpdateAppStatus(appId, { status: app?.status || 'Pending', notes: note });
      }
      setToastMsg('Remarks saved successfully');
      setTimeout(() => setToastMsg(''), 3000);
    } catch (err) {
      console.error('Error saving notes:', err);
    } finally {
      setSavingAppId(null);
    }
  };

  // Helper to build Flipkart Delivery-Style Timeline Steps based on application status & statusHistory
  const getTimelineSteps = (app) => {
    const status = app.status || 'Pending';
    const appliedTime = new Date(app.appliedAt || Date.now()).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const lastCallTime = app.lastCalledAt ? new Date(app.lastCalledAt).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : null;

    // Timeline Steps Definition (Flipkart Delivery Tracker Style)
    const isPending = status === 'Pending';
    const isSubmitted = status === 'Submitted' || status === 'Pending';
    const isProcessing = ['Processing', 'In Progress', 'Called', 'Verified', 'Completed', 'Approved'].includes(status);
    const isVerified = ['Verified', 'Completed', 'Approved'].includes(status);
    const isCompleted = ['Completed', 'Approved'].includes(status);
    const isRejected = status === 'Rejected';

    return [
      {
        title: 'Application Submitted',
        subtitle: `Directive submitted via BJP Nalam Thittam Portal`,
        time: appliedTime,
        status: 'done', // always done upon submission
        icon: CheckCircle2
      },
      {
        title: 'Tele-calling & Member Verification',
        subtitle: lastCallTime ? `Tele-caller contacted member at ${lastCallTime}` : 'Assigned to Booth & Assembly Admin for tele-verification',
        time: lastCallTime || (isProcessing ? 'In Verification' : 'Pending Verification'),
        status: isRejected ? 'error' : isProcessing ? 'done' : 'current',
        icon: PhoneCall
      },
      {
        title: 'Beneficiary Document Processing',
        subtitle: 'DBT Eligibility checks & Beneficiary record validation',
        time: isVerified ? 'Verified' : isProcessing ? 'In Progress' : 'Pending Process',
        status: isRejected ? 'error' : isVerified ? 'done' : (isProcessing ? 'current' : 'upcoming'),
        icon: RefreshCw
      },
      {
        title: isRejected ? 'Application Rejected' : 'Benefit Directives Approved & Delivered',
        subtitle: isRejected ? 'Request rejected after verification' : 'Government Welfare benefit directive approved and active',
        time: isCompleted ? 'Completed' : (isRejected ? 'Rejected' : 'Final Stage'),
        status: isRejected ? 'error' : isCompleted ? 'done' : 'upcoming',
        icon: isRejected ? AlertCircle : Award
      }
    ];
  };

  const selectedApp = appsState.find(a => a._id === selectedAppId) || appsState[0];

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div className="campsite-card" style={{
        maxWidth: '860px',
        width: '100%',
        maxHeight: '92vh',
        overflowY: 'auto',
        padding: '28px',
        background: 'var(--color-paper-white)',
        borderRadius: '16px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        boxSizing: 'border-box'
      }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-linen)', paddingBottom: '16px', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="tag-pill tag-sunlit" style={{ fontSize: '11px' }}>MEMBER PROFILE</span>
              <span className="tag-pill tag-active" style={{ fontSize: '11px' }}>{applications.length} Schemes Applied</span>
            </div>
            <h2 className="text-heading" style={{ fontSize: '22px', margin: '4px 0 0', color: 'var(--color-midnight-ink)' }}>
              {voterName}
            </h2>
            <div style={{ fontSize: '13px', color: 'var(--color-slate)', marginTop: '2px' }}>
              EPIC: <strong style={{ fontFamily: 'var(--font-ui-monospace)' }}>{epicNo}</strong> • Mobile: <strong>{mobile}</strong>
            </div>
          </div>

          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '8px', borderRadius: '9999px' }}>
            <X size={20} />
          </button>
        </div>

        {toastMsg && (
          <div className="tag-pill tag-success" style={{ width: '100%', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px' }}>
            <CheckCircle2 size={14} /> {toastMsg}
          </div>
        )}

        {/* Member Demographic Bar */}
        <div style={{ background: 'var(--color-fog-gray)', borderRadius: '12px', padding: '14px 18px', marginBottom: '24px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MapPin size={16} color="var(--color-campfire-orange)" />
            <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-midnight-ink)' }}>
              {district} • {assemblyName} • <span style={{ color: 'var(--color-campfire-orange)' }}>Polling Booth #{boothNo}</span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              if (onOpenCallModal && selectedApp) onOpenCallModal(selectedApp);
            }}
            className="btn btn-filled"
            style={{ padding: '6px 16px', fontSize: '12px' }}
          >
            <PhoneCall size={14} /> Call Voter ({mobile})
          </button>
        </div>

        {/* Main Content Grid: Left List of Schemes, Right Flipkart-Style Delivery Tracker */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(340px, 1.6fr)', gap: '20px', boxSizing: 'border-box' }}>
          
          {/* Left Column: Applied Schemes Selector */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-slate)', textTransform: 'uppercase', marginBottom: '10px' }}>
              Applied BJP Schemes ({appsState.length})
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {appsState.map((app) => {
                const isSelected = app._id === selectedAppId;
                return (
                  <div
                    key={app._id}
                    onClick={() => setSelectedAppId(app._id)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: isSelected ? '2px solid var(--color-campfire-orange)' : '1px solid var(--color-linen)',
                      background: isSelected ? 'var(--color-sunlit-cream)' : 'var(--color-paper-white)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--color-midnight-ink)' }}>{app.schemeName}</span>
                      <StatusBadge status={app.status} />
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-slate)' }}>{app.benefit}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Flipkart-Style Order & Application Status Timeline Tracker */}
          {selectedApp && (
            <div style={{ border: '1px solid var(--color-linen)', borderRadius: '12px', padding: '20px', background: 'var(--color-paper-white)' }}>
              
              {/* Selected Scheme Header */}
              <div style={{ borderBottom: '1px solid var(--color-linen)', paddingBottom: '14px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <span className="tag-pill tag-sunlit" style={{ fontSize: '10px', marginBottom: '4px' }}>{selectedApp.clusterName}</span>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-midnight-ink)', margin: 0 }}>
                      {selectedApp.schemeName}
                    </h3>
                    <div style={{ fontSize: '13px', color: 'var(--color-forest-pulse)', fontWeight: '600', marginTop: '2px' }}>
                      {selectedApp.benefit}
                    </div>
                  </div>
                  
                  {/* Inline Status Dropdown */}
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--color-slate)', display: 'block', marginBottom: '2px' }}>
                      Update Status
                    </label>
                    <select
                      value={selectedApp.status || 'Pending'}
                      onChange={(e) => handleStatusChange(selectedApp._id, e.target.value)}
                      className="form-control"
                      style={{ padding: '6px 10px', fontSize: '12px', fontWeight: '700', borderRadius: '8px' }}
                    >
                      {statusOptions.map(st => (
                        <option key={st} value={st}>
                          {st === 'Processing' ? 'Processing (In Progress)' : st === 'Completed' ? 'Completed (Approved)' : st}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Flipkart Delivery Style Vertical Timeline Component */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-midnight-ink)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Award size={16} color="var(--color-campfire-orange)" /> Flipkart-style Directive Tracker Timeline
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', paddingLeft: '28px' }}>
                  
                  {/* Vertical Connecting Line */}
                  <div style={{
                    position: 'absolute',
                    left: '11px',
                    top: '12px',
                    bottom: '12px',
                    width: '3px',
                    background: 'var(--color-linen)',
                    zIndex: 1
                  }} />

                  {getTimelineSteps(selectedApp).map((step, idx) => {
                    let dotBg = '#e2e8f0';
                    let dotBorder = '#cbd5e1';
                    let dotColor = '#64748b';

                    if (step.status === 'done') {
                      dotBg = '#22c55e';
                      dotBorder = '#16a34a';
                      dotColor = '#ffffff';
                    } else if (step.status === 'current') {
                      dotBg = '#ff6b1a';
                      dotBorder = '#ea580c';
                      dotColor = '#ffffff';
                    } else if (step.status === 'error') {
                      dotBg = '#ef4444';
                      dotBorder = '#dc2626';
                      dotColor = '#ffffff';
                    }

                    const StepIcon = step.icon;

                    return (
                      <div key={idx} style={{ position: 'relative', zIndex: 2 }}>
                        {/* Timeline Step Dot / Icon */}
                        <div style={{
                          position: 'absolute',
                          left: '-28px',
                          top: '2px',
                          width: '24px',
                          height: '24px',
                          borderRadius: '9999px',
                          background: dotBg,
                          border: `2px solid ${dotBorder}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: dotColor,
                          boxShadow: step.status === 'current' ? '0 0 0 4px rgba(255, 107, 26, 0.2)' : 'none'
                        }}>
                          <StepIcon size={12} />
                        </div>

                        {/* Step Details */}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: '700', fontSize: '14px', color: step.status === 'upcoming' ? 'var(--color-slate)' : 'var(--color-midnight-ink)' }}>
                              {step.title}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--color-slate)', fontWeight: '500' }}>
                              {step.time}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--color-slate)', marginTop: '2px' }}>
                            {step.subtitle}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                </div>
              </div>

              {/* Admin Verification Remarks Section */}
              <div style={{ borderTop: '1px solid var(--color-linen)', paddingTop: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-midnight-ink)', display: 'block', marginBottom: '6px' }}>
                  Admin Remarks & Verification History
                </label>
                <textarea
                  rows={2}
                  value={notesState[selectedApp._id] !== undefined ? notesState[selectedApp._id] : (selectedApp.adminRemarks || '')}
                  onChange={(e) => setNotesState({ ...notesState, [selectedApp._id]: e.target.value })}
                  placeholder="Enter remarks for this scheme..."
                  className="form-control"
                  style={{ fontSize: '12px', marginBottom: '8px' }}
                />
                <button
                  type="button"
                  onClick={() => handleSaveNotes(selectedApp._id)}
                  disabled={savingAppId === selectedApp._id}
                  className="btn btn-ghost"
                  style={{ fontSize: '12px', padding: '4px 12px' }}
                >
                  {savingAppId === selectedApp._id ? 'Saving Remarks...' : 'Save Remarks for Scheme'}
                </button>
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px', borderTop: '1px solid var(--color-linen)', paddingTop: '16px' }}>
          <button onClick={onClose} className="btn btn-filled" style={{ padding: '8px 24px' }}>
            Close Member Profile
          </button>
        </div>

      </div>
    </div>
  );
};

export default MemberProfileTimelineModal;
