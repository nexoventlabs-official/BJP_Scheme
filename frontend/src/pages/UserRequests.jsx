import React, { useState, useEffect } from 'react';
import API from '../utils/api';
import StatusBadge from '../components/StatusBadge';
import { RefreshCw, FileText } from 'lucide-react';

const UserRequests = () => {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = async () => {
    try {
      const res = await API.get('/schemes/my-requests');
      if (res.data.success) {
        setApplications(res.data.applications);
      }
    } catch (err) {
      console.error('Error fetching my requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 className="text-heading" style={{ margin: 0 }}>
            My Scheme Requests
          </h1>
          <p className="text-subheading" style={{ fontSize: '14px', marginTop: '2px' }}>
            Track application status and admin follow-up history
          </p>
        </div>

        <button onClick={fetchRequests} className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: '13px' }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-slate)' }}>
          Loading your scheme applications...
        </div>
      ) : applications.length === 0 ? (
        <div className="campsite-card" style={{ padding: '48px', textAlign: 'center' }}>
          <FileText size={42} color="var(--color-slate)" style={{ marginBottom: '12px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--color-midnight-ink)', marginBottom: '6px' }}>
            No Scheme Applications Found
          </h3>
          <p style={{ fontSize: '14px', color: 'var(--color-slate)', maxWidth: '400px', margin: '0 auto' }}>
            You haven't submitted any BJP Nalam Thittam scheme applications yet. Browse the 20 schemes to apply now!
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {applications.map((app) => (
            <div key={app._id} className="campsite-card" style={{ padding: '20px 24px' }}>
              
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <div className="tag-pill tag-sunlit" style={{ marginBottom: '6px' }}>
                    {app.clusterName}
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--color-midnight-ink)', margin: 0 }}>
                    {app.schemeName}
                  </h3>
                  <div style={{ fontSize: '13px', color: 'var(--color-slate)', marginTop: '2px' }}>
                    Benefit: <span style={{ color: 'var(--color-ember-brown)', fontWeight: '500' }}>{app.benefit}</span>
                  </div>
                </div>

                <StatusBadge status={app.status} />
              </div>

              {/* Admin Note */}
              <div style={{
                padding: '10px 14px',
                background: 'var(--color-fog-gray)',
                borderRadius: '8px',
                borderLeft: '3px solid var(--color-midnight-ink)',
                fontSize: '13px',
                color: 'var(--color-midnight-ink)',
                marginBottom: '12px'
              }}>
                📢 <strong>Admin Note:</strong> {app.adminRemarks || 'Application submitted successfully.'}
              </div>

              {/* Footer details */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', fontSize: '12px', color: 'var(--color-slate)', borderTop: '1px solid var(--color-linen)', paddingTop: '10px' }}>
                <div>
                  Applied On: <strong>{new Date(app.appliedAt).toLocaleDateString()} {new Date(app.appliedAt).toLocaleTimeString()}</strong>
                </div>
                <div>
                  Assigned Booth: <strong>Booth {app.boothNo} ({app.assemblyName})</strong>
                </div>
                {app.lastCalledAt && (
                  <div style={{ color: 'var(--color-campfire-orange)', fontWeight: '500' }}>
                    📞 Admin Called: {new Date(app.lastCalledAt).toLocaleTimeString()}
                  </div>
                )}
              </div>

            </div>
          ))}
        </div>
      )}

    </div>
  );
};

export default UserRequests;
