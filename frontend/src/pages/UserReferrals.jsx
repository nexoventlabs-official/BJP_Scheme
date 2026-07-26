import React, { useState, useEffect } from 'react';
import API from '../utils/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import { Copy, Check, Users, Gift, UserCheck, ArrowLeft, MapPin, Award, Calendar, ChevronRight } from 'lucide-react';

const UserReferrals = () => {
  const { user } = useAuth();
  const [referralData, setReferralData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);

  useEffect(() => {
    const fetchReferralStats = async () => {
      try {
        const res = await API.get('/referrals/my-referrals');
        if (res.data.success) {
          setReferralData(res.data);
        }
      } catch (err) {
        console.error('Error fetching referral stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchReferralStats();
  }, []);

  const referralLink = user
    ? `${window.location.origin}/?ref=${user.referralCode}`
    : '';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  // If a referred member is clicked, show their full Details Page View!
  if (selectedMember) {
    return (
      <div style={{ maxWidth: '850px', margin: '0 auto' }}>
        
        {/* Back Button */}
        <button
          type="button"
          onClick={() => setSelectedMember(null)}
          className="btn btn-ghost"
          style={{ marginBottom: '20px', padding: '8px 16px', fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <ArrowLeft size={18} /> Back to Referred Members List
        </button>

        {/* Referred Member Header Card */}
        <div className="campsite-card" style={{ padding: '28px', marginBottom: '24px', background: 'var(--color-paper-white)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--color-linen)', paddingBottom: '20px', marginBottom: '20px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span className="tag-pill tag-sunlit" style={{ fontSize: '11px' }}>REFERRED MEMBER DETAILS</span>
                <span className="tag-pill tag-active" style={{ fontSize: '11px' }}>
                  {selectedMember.schemeCount} Scheme(s) Applied
                </span>
              </div>
              <h1 className="text-heading" style={{ fontSize: '24px', margin: 0, color: 'var(--color-midnight-ink)' }}>
                {selectedMember.voterName}
              </h1>
              <div style={{ fontSize: '14px', color: 'var(--color-slate)', marginTop: '4px' }}>
                EPIC ID: <strong style={{ fontFamily: 'var(--font-ui-monospace)', color: 'var(--color-midnight-ink)' }}>{selectedMember.epicNo}</strong> • Mobile: <strong>{selectedMember.mobileMasked}</strong>
              </div>
            </div>

            {/* Jurisdiction Badge */}
            <div style={{ background: 'var(--color-fog-gray)', padding: '12px 16px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <MapPin size={18} color="var(--color-campfire-orange)" />
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-midnight-ink)' }}>
                {selectedMember.district} • {selectedMember.assemblyName}
                <div style={{ fontSize: '12px', color: 'var(--color-campfire-orange)', fontWeight: '700' }}>
                  Polling Booth #{selectedMember.boothNo}
                </div>
              </div>
            </div>
          </div>

          <div style={{ fontSize: '13px', color: 'var(--color-slate)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={14} /> Registered under your referral link on: <strong>{new Date(selectedMember.joinedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
          </div>
        </div>

        {/* Applied Schemes Section */}
        <div className="campsite-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--color-midnight-ink)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Award size={18} color="var(--color-campfire-orange)" />
            Schemes Applied by {selectedMember.voterName} ({selectedMember.applications?.length || 0})
          </h3>

          {!selectedMember.applications || selectedMember.applications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--color-slate)', background: 'var(--color-fog-gray)', borderRadius: '10px' }}>
              No welfare schemes applied by {selectedMember.voterName} yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {selectedMember.applications.map((app) => (
                <div
                  key={app._id}
                  style={{
                    padding: '16px',
                    background: 'var(--color-fog-gray)',
                    borderRadius: '10px',
                    border: '1px solid var(--color-linen)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--color-campfire-orange)', fontWeight: '700', marginBottom: '2px' }}>
                      {app.clusterName}
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--color-midnight-ink)' }}>
                      {app.schemeName}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--color-slate)', marginTop: '2px' }}>
                      {app.benefit}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <StatusBadge status={app.status || 'Pending'} />
                    <div style={{ fontSize: '11px', color: 'var(--color-ash-gray)', marginTop: '6px' }}>
                      Applied: {new Date(app.appliedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    );
  }

  return (
    <div style={{ maxWidth: '850px', margin: '0 auto' }}>
      
      {/* Referral Link Generator Banner */}
      <div className="campsite-card" style={{ padding: '32px', marginBottom: '24px', background: 'var(--color-paper-white)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '9999px',
            background: 'var(--color-sunlit-cream)',
            color: 'var(--color-ember-brown)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px'
          }}>
            🎁
          </div>
          <div>
            <h1 className="text-heading" style={{ margin: 0 }}>
              Referral Program
            </h1>
            <p className="text-subheading" style={{ fontSize: '14px', marginTop: '2px' }}>
              Share your unique referral link to help family and neighbors access 20 government welfare schemes.
            </p>
          </div>
        </div>

        {/* Copy Link Input Group */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Your Unique Referral Link</label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              readOnly
              value={referralLink}
              className="form-control"
              style={{ fontWeight: '500', color: 'var(--color-midnight-ink)', background: 'var(--color-fog-gray)' }}
            />
            <button onClick={handleCopyLink} className="btn btn-filled" style={{ whiteSpace: 'nowrap' }}>
              {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Referral Link</>}
            </button>
          </div>
        </div>
      </div>

      {/* Referred Members Stats Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        
        <div className="stat-card">
          <div className="stat-icon">
            <Users size={20} />
          </div>
          <div>
            <div className="stat-number">{referralData?.totalReferred || 0}</div>
            <div className="stat-label">Total Referred Members</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--color-fog-gray)', color: 'var(--color-midnight-ink)' }}>
            <Gift size={20} />
          </div>
          <div>
            <div className="stat-number" style={{ fontSize: '18px' }}>{user?.referralCode}</div>
            <div className="stat-label">Your Referral Code</div>
          </div>
        </div>

      </div>

      {/* Referred Members List */}
      <div className="campsite-card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--color-midnight-ink)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UserCheck size={18} color="var(--color-midnight-ink)" />
          Referred Members & Details
        </h3>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--color-slate)' }}>Loading referred members...</div>
        ) : !referralData?.referredMembers || referralData.referredMembers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px', color: 'var(--color-slate)' }}>
            No members have registered using your referral link yet. Share your referral link to get started!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {referralData.referredMembers.map((member) => (
              <div
                key={member.id}
                onClick={() => setSelectedMember(member)}
                style={{
                  padding: '16px',
                  background: 'var(--color-paper-white)',
                  borderRadius: '10px',
                  border: '1px solid var(--color-linen)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-campfire-orange)';
                  e.currentTarget.style.background = 'var(--color-sunlit-cream)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-linen)';
                  e.currentTarget.style.background = 'var(--color-paper-white)';
                }}
              >
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--color-midnight-ink)' }}>
                    {member.voterName}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-slate)', marginTop: '2px' }}>
                    District: <strong>{member.district}</strong> • Assembly: <strong>{member.assemblyName}</strong> • Booth {member.boothNo}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <span className="tag-pill tag-sunlit" style={{ fontWeight: '700', fontSize: '12px' }}>
                      {member.schemeCount} Scheme(s) Applied
                    </span>
                    <div style={{ fontSize: '11px', color: 'var(--color-ash-gray)', marginTop: '4px' }}>
                      Joined: {new Date(member.joinedAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div style={{ color: 'var(--color-campfire-orange)', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', marginRight: '2px' }}>View Details</span>
                    <ChevronRight size={16} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};

export default UserReferrals;
