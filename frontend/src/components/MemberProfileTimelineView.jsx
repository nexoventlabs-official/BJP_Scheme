import React, { useState, useEffect } from 'react';
import API from '../utils/api';
import StatusBadge from './StatusBadge';
import { BJP_SCHEMES } from '../utils/constants';
import {
  ArrowLeft, User, Phone, MapPin, Award, Calendar, CheckCircle2, Clock, PhoneCall, RefreshCw, AlertCircle, Share2, ChevronRight, Users, Copy, Check
} from 'lucide-react';

export const formatSchemeName = (schemeName, schemeId) => {
  if (!schemeName) return 'BJP Scheme';
  const str = String(schemeName).trim();
  if (/^\d+$/.test(str)) {
    const found = BJP_SCHEMES.find(s => s.id === parseInt(str));
    if (found) return found.name;
  }
  if (schemeId && /^\d+$/.test(String(schemeId))) {
    const found = BJP_SCHEMES.find(s => s.id === parseInt(schemeId));
    if (found && (str === String(schemeId) || !isNaN(str))) return found.name;
  }
  return schemeName;
};

export const formatAppliedDateTime = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (e) {
    return '—';
  }
};

import { CLOUDINARY_SCHEME_IMAGES, optimizeCloudinaryUrl } from '../utils/cloudinarySchemes';

export const getSchemeBgImage = (schemeIdOrName) => {
  if (!schemeIdOrName) return null;
  const name = formatSchemeName(schemeIdOrName);
  let rawUrl = CLOUDINARY_SCHEME_IMAGES[name];
  if (!rawUrl) {
    const lower = name.toLowerCase().trim();
    for (const [key, path] of Object.entries(CLOUDINARY_SCHEME_IMAGES)) {
      if (key.toLowerCase() === lower || lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
        rawUrl = path;
        break;
      }
    }
  }
  return optimizeCloudinaryUrl(rawUrl);
};





const MemberProfileTimelineView = ({ voterData, onBack, onUpdateAppStatus, onSelectVoter, targetSchemeName }) => {
  if (!voterData) return null;

  const { voterName, epicNo, mobile, district, assemblyName, boothNo, referralCode, applications = [] } = voterData;

  const [appsState, setAppsState] = useState(applications);
  const [selectedAppId, setSelectedAppId] = useState(() => {
    if (targetSchemeName && applications?.length) {
      const match = applications.find(a => 
        a.schemeName && a.schemeName.toLowerCase().includes(targetSchemeName.toLowerCase())
      );
      if (match) return match._id;
    }
    return applications[0]?._id;
  });

  const [notesState, setNotesState] = useState({});
  const [savingAppId, setSavingAppId] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  // Referred voters state
  const [referredVoters, setReferredVoters] = useState([]);
  const [loadingReferrals, setLoadingReferrals] = useState(true);

  const statusOptions = ['Pending', 'Submitted', 'Processing', 'Completed', 'Called', 'Verified', 'Rejected'];

  useEffect(() => {
    setAppsState(applications);
    if (targetSchemeName && applications?.length) {
      const match = applications.find(a => 
        a.schemeName && a.schemeName.toLowerCase().includes(targetSchemeName.toLowerCase())
      );
      if (match) setSelectedAppId(match._id);
      else if (applications[0]) setSelectedAppId(applications[0]._id);
    } else if (applications[0]) {
      setSelectedAppId(applications[0]._id);
    }
  }, [targetSchemeName, voterData]);

  useEffect(() => {
    const fetchReferrals = async () => {
      setLoadingReferrals(true);
      try {
        const codeQuery = referralCode || epicNo;
        const res = await API.get(`/admin/member-referrals?referralCode=${codeQuery}&epicNo=${epicNo}&mobile=${mobile}`);
        if (res.data.success) {
          setReferredVoters(res.data.referredVoters);
        }
      } catch (err) {
        console.error('Error loading member referrals:', err);
      } finally {
        setLoadingReferrals(false);
      }
    };

    fetchReferrals();
  }, [epicNo, referralCode, mobile]);

  const handleDirectCall = async () => {
    const selectedApp = appsState.find(a => a._id === selectedAppId) || appsState[0];
    
    // 1. Trigger phone dialer
    window.location.href = `tel:${mobile}`;

    // 2. Automatically log the call in backend DB
    if (selectedApp && onUpdateAppStatus) {
      try {
        await onUpdateAppStatus(selectedApp._id, {
          status: 'Called',
          notes: `Follow-up call placed to ${voterName} (${mobile})`,
          isCallAction: true
        });
        setAppsState(prev => prev.map(a => a._id === selectedApp._id ? { ...a, status: 'Called', lastCalledAt: new Date() } : a));
        setToastMsg(`Dialing ${mobile}... Call logged in timeline.`);
        setTimeout(() => setToastMsg(''), 4000);
      } catch (err) {
        console.error('Call log error:', err);
      }
    }
  };

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

  // Helper to build Flipkart Delivery-Style Timeline Steps
  const getTimelineSteps = (app) => {
    const status = app.status || 'Pending';
    const appliedTime = new Date(app.appliedAt || Date.now()).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const lastCallTime = app.lastCalledAt ? new Date(app.lastCalledAt).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : null;

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
        status: 'done',
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
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      
      {/* Top Back Navigation Bar */}
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={onBack}
          className="btn btn-ghost"
          style={{ padding: '8px 16px', fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <ArrowLeft size={18} /> Back to Applications List
        </button>

        {/* Direct Call Button */}
        <button
          type="button"
          onClick={handleDirectCall}
          className="btn btn-filled"
          style={{ padding: '10px 22px', fontSize: '14px', fontWeight: '700', borderRadius: '9999px', background: 'var(--color-midnight-ink)' }}
        >
          <PhoneCall size={16} /> Call Voter ({mobile})
        </button>
      </div>

      {toastMsg && (
        <div className="tag-pill tag-success" style={{ width: '100%', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px' }}>
          <CheckCircle2 size={14} /> {toastMsg}
        </div>
      )}

      {/* Main Full Page Card */}
      <div className="campsite-card" style={{ width: '100%', padding: '28px', boxSizing: 'border-box', marginBottom: '30px' }}>
        
        {/* Header Profile Section */}
        <div style={{ borderBottom: '1px solid var(--color-linen)', paddingBottom: '20px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span className="tag-pill tag-sunlit" style={{ fontSize: '11px' }}>MEMBER PROFILE PAGE</span>
                <span className="tag-pill tag-active" style={{ fontSize: '11px' }}>{applications.length} Schemes Applied</span>
                <span className="tag-pill tag-muted" style={{ fontSize: '11px', background: 'var(--color-sunlit-cream)', color: 'var(--color-ember-brown)', fontWeight: '700' }}>
                  <Share2 size={12} /> {loadingReferrals ? 'Loading...' : `${referredVoters.length} Member(s) Referred`}
                </span>
              </div>
              <h1 className="text-heading" style={{ fontSize: '26px', margin: 0, color: 'var(--color-midnight-ink)' }}>
                {voterName}
              </h1>
              <div style={{ fontSize: '14px', color: 'var(--color-slate)', marginTop: '4px' }}>
                EPIC ID: <strong style={{ fontFamily: 'var(--font-ui-monospace)', color: 'var(--color-midnight-ink)' }}>{epicNo}</strong> • Mobile: <strong style={{ color: 'var(--color-midnight-ink)' }}>{mobile}</strong>
              </div>
            </div>

            {/* Jurisdiction Badge */}
            <div style={{ background: 'var(--color-fog-gray)', padding: '12px 18px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <MapPin size={18} color="var(--color-campfire-orange)" />
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-midnight-ink)' }}>
                {district} • {assemblyName}
                <div style={{ fontSize: '12px', color: 'var(--color-campfire-orange)', fontWeight: '700' }}>
                  Polling Booth #{boothNo}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2-Column Full Page Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(440px, 1.8fr)', gap: '24px', boxSizing: 'border-box' }}>
          
          {/* Left Column: Applied BJP Schemes Selector */}
          <div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-slate)', textTransform: 'uppercase', marginBottom: '14px' }}>
              Applied Schemes ({appsState.length})
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px' }}>
              {appsState.map((app) => {
                const isSelected = app._id === selectedAppId;
                return (
                  <div
                    key={app._id}
                    onClick={() => setSelectedAppId(app._id)}
                    style={{
                      padding: '16px',
                      borderRadius: '12px',
                      border: isSelected ? '2px solid var(--color-campfire-orange)' : '1px solid var(--color-linen)',
                      background: isSelected ? 'var(--color-sunlit-cream)' : 'var(--color-paper-white)',
                      cursor: 'pointer',
                      boxShadow: isSelected ? '0 4px 12px rgba(255, 107, 26, 0.1)' : 'none',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--color-midnight-ink)' }}>
                        {formatSchemeName(app.schemeName, app.schemeId)}
                      </span>
                      <StatusBadge status={app.status} />
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--color-slate)' }}>{app.benefit}</div>
                  </div>
                );
              })}
            </div>

            {/* Member's Unique Referral Code & Link Box */}
            <div style={{
              background: '#fff7ed',
              border: '1.5px dashed var(--color-saffron)',
              borderRadius: '12px',
              padding: '14px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-midnight-ink)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Share2 size={14} color="var(--color-campfire-orange)" />
                  Member Referral Link
                </div>
                <span className="tag-pill tag-sunlit" style={{ fontSize: '11px', fontWeight: '700' }}>
                  {referralCode || epicNo}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}/r/${referralCode || epicNo}`}
                  className="form-control"
                  style={{ fontSize: '11px', padding: '6px 8px', fontFamily: 'var(--font-ui-monospace)', background: '#fff' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const link = `${window.location.origin}/r/${referralCode || epicNo}`;
                    navigator.clipboard.writeText(link);
                    setToastMsg('Referral link copied to clipboard!');
                    setTimeout(() => setToastMsg(''), 3000);
                  }}
                  className="btn btn-ghost"
                  style={{ padding: '6px 10px', fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Copy size={13} /> Copy Link
                </button>
              </div>
            </div>

            {/* Referrals Section inside Left Column */}
            <div style={{ borderTop: '1px solid var(--color-linen)', paddingTop: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-midnight-ink)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={16} color="var(--color-campfire-orange)" />
                Voters Referred by {voterName.split(' ')[0]} ({loadingReferrals ? '...' : referredVoters.length})
              </div>

              {loadingReferrals ? (
                <div style={{ fontSize: '12px', color: 'var(--color-slate)' }}>Loading referral history...</div>
              ) : referredVoters.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--color-slate)', background: 'var(--color-fog-gray)', padding: '12px', borderRadius: '8px' }}>
                  No members registered under {voterName}'s referral code yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {referredVoters.map((ref) => (
                    <div
                      key={ref.epicNo || ref.id}
                      style={{
                        padding: '12px',
                        background: 'var(--color-paper-white)',
                        borderRadius: '10px',
                        border: '1px solid var(--color-linen)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                        <div>
                          <div style={{ fontWeight: '700', fontSize: '13px', color: 'var(--color-midnight-ink)' }}>{ref.voterName}</div>
                          <div style={{ fontSize: '11px', color: 'var(--color-slate)', fontFamily: 'var(--font-ui-monospace)' }}>{ref.epicNo}</div>
                        </div>
                        <span className="tag-pill tag-sunlit" style={{ fontSize: '10px', fontWeight: '700', flexShrink: 0 }}>
                          {ref.applications?.length || 0} Scheme(s)
                        </span>
                      </div>

                      <div style={{ fontSize: '11px', color: 'var(--color-slate)', marginTop: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
                        <span>District: <strong style={{ color: 'var(--color-midnight-ink)' }}>{ref.district || '—'}</strong></span>
                        <span>Assembly: <strong style={{ color: 'var(--color-midnight-ink)' }}>{ref.assemblyName || '—'}</strong></span>
                        <span>Booth: <strong style={{ color: 'var(--color-midnight-ink)' }}>{ref.boothNo || '—'}</strong></span>
                        <span>Mobile: <strong style={{ color: 'var(--color-midnight-ink)' }}>{ref.mobile}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Flipkart-Style Order & Application Status Timeline Tracker */}
          {selectedApp && (
            <div style={{ border: '1px solid var(--color-linen)', borderRadius: '14px', padding: '24px', background: 'var(--color-paper-white)', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              
              {/* Selected Scheme Details Header */}
              <div style={{ borderBottom: '1px solid var(--color-linen)', paddingBottom: '16px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <span className="tag-pill tag-sunlit" style={{ fontSize: '11px', marginBottom: '4px' }}>{selectedApp.clusterName}</span>
                    <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-midnight-ink)', margin: 0 }}>
                      {formatSchemeName(selectedApp.schemeName, selectedApp.schemeId)}
                    </h3>
                    <div style={{ fontSize: '14px', color: 'var(--color-forest-pulse)', fontWeight: '600', marginTop: '2px' }}>
                      {selectedApp.benefit}
                    </div>
                  </div>
                  
                  {/* Inline Status Dropdown */}
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--color-slate)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>
                      Update Status
                    </label>
                    <select
                      value={selectedApp.status || 'Pending'}
                      onChange={(e) => handleStatusChange(selectedApp._id, e.target.value)}
                      className="form-control"
                      style={{ padding: '8px 12px', fontSize: '13px', fontWeight: '700', borderRadius: '8px', background: 'var(--color-fog-gray)' }}
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
              <div style={{ marginBottom: '28px' }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-midnight-ink)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Award size={18} color="var(--color-campfire-orange)" /> Flipkart-style Application Delivery Tracker
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative', paddingLeft: '32px' }}>
                  
                  {/* Vertical Connecting Line */}
                  <div style={{
                    position: 'absolute',
                    left: '12px',
                    top: '14px',
                    bottom: '14px',
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
                          left: '-32px',
                          top: '2px',
                          width: '26px',
                          height: '26px',
                          borderRadius: '9999px',
                          background: dotBg,
                          border: `2px solid ${dotBorder}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: dotColor,
                          boxShadow: step.status === 'current' ? '0 0 0 4px rgba(255, 107, 26, 0.2)' : 'none'
                        }}>
                          <StepIcon size={14} />
                        </div>

                        {/* Step Details */}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                            <span style={{ fontWeight: '700', fontSize: '15px', color: step.status === 'upcoming' ? 'var(--color-slate)' : 'var(--color-midnight-ink)' }}>
                              {step.title}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--color-slate)', fontWeight: '600' }}>
                              {step.time}
                            </span>
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--color-slate)', marginTop: '4px' }}>
                            {step.subtitle}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                </div>
              </div>

              {/* Admin Verification Remarks Section */}
              <div style={{ borderTop: '1px solid var(--color-linen)', paddingTop: '20px' }}>
                <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-midnight-ink)', display: 'block', marginBottom: '8px' }}>
                  Admin Verification Remarks & Log Notes
                </label>
                <textarea
                  rows={3}
                  value={notesState[selectedApp._id] !== undefined ? notesState[selectedApp._id] : (selectedApp.adminRemarks || '')}
                  onChange={(e) => setNotesState({ ...notesState, [selectedApp._id]: e.target.value })}
                  placeholder="Enter remarks for this scheme..."
                  className="form-control"
                  style={{ fontSize: '13px', marginBottom: '10px' }}
                />
                <button
                  type="button"
                  onClick={() => handleSaveNotes(selectedApp._id)}
                  disabled={savingAppId === selectedApp._id}
                  className="btn btn-ghost"
                  style={{ fontSize: '13px', padding: '6px 16px' }}
                >
                  {savingAppId === selectedApp._id ? 'Saving Remarks...' : 'Save Remarks for Scheme'}
                </button>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};

export default MemberProfileTimelineView;
