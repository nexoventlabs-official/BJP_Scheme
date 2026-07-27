import React, { useState, useEffect } from 'react';
import API from '../utils/api';
import { BJP_SCHEMES, CLUSTERS } from '../utils/constants';
import SchemeCard from '../components/SchemeCard';
import SchemeApplyModal from '../components/SchemeApplyModal';
import { Send, CheckCircle2, Sparkles } from 'lucide-react';

const UserHome = () => {
  const [selectedCluster, setSelectedCluster] = useState('All Schemes');
  const [selectedIds, setSelectedIds] = useState([]);
  const [userApplications, setUserApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  const fetchMyRequests = async () => {
    try {
      const res = await API.get('/schemes/my-requests');
      if (res.data.success) {
        setUserApplications(res.data.applications);
      }
    } catch (err) {
      console.error('Error loading my requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyRequests();
  }, []);

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSubmitApplications = async () => {
    if (selectedIds.length === 0) return;
    setSubmitting(true);
    try {
      const res = await API.post('/schemes/apply', { schemeIds: selectedIds });
      if (res.data.success) {
        setToastMsg(`Successfully applied for ${res.data.appliedCount} scheme(s)!`);
        setSelectedIds([]);
        setShowModal(false);
        await fetchMyRequests();
      }
    } catch (err) {
      setToastMsg('Failed to submit applications. Please try again.');
    } finally {
      setSubmitting(false);
      setTimeout(() => setToastMsg(null), 5000);
    }
  };

  const appliedSchemeIds = userApplications.map((app) => app.schemeId);

  const filteredSchemes = BJP_SCHEMES.filter((scheme) => {
    if (selectedCluster === 'All Schemes') return true;
    return scheme.cluster === selectedCluster;
  });

  const getCleanClusterTitle = (clusterName) => {
    if (clusterName === 'All Schemes') return 'All 23 Schemes';
    return clusterName.replace(/^Cluster \d+ — /, '');
  };

  return (
    <div style={{ paddingBottom: '100px' }}>
      
      {/* Edge-to-Edge Hero Section extending behind transparent navbar */}
      <div style={{
        position: 'relative',
        width: '100vw',
        marginLeft: 'calc(-50vw + 50%)',
        marginRight: 'calc(-50vw + 50%)',
        marginTop: '-95px',
        marginBottom: '28px',
        padding: '110px 6% 60px 6%',
        backgroundImage: "url('/hero.svg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundRepeat: 'no-repeat',
        minHeight: '560px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        boxSizing: 'border-box'
      }}>
        
        {/* Left Aligned Hero Content Box */}
        <div style={{ maxWidth: '620px', textAlign: 'left', zIndex: 2 }}>
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-start' }}>
            <span className="notification-pill" style={{ background: 'var(--color-midnight-ink)' }}>
              <span className="new-tag" style={{ background: 'var(--color-campfire-orange)', color: '#ffffff' }}>CATALOG</span>
              <span>23 Central BJP Welfare Schemes — BJP Nalam Thittam</span>
            </span>
          </div>

          <h1 className="text-display" style={{ margin: '0 0 14px 0', fontSize: '44px', lineHeight: '1.15', color: 'var(--color-midnight-ink)' }}>
            Select and Apply for Direct Benefits.
          </h1>
          
          <p className="text-subheading" style={{ margin: '0 0 24px 0', fontSize: '16px', color: 'var(--color-graphite)', fontWeight: '500' }}>
            Multi-select welfare schemes across Insurance, Credit, Farming, Women & Families, Youth Skills, and DBT Foundation Layer.
          </p>

          {/* Quick Metrics Bar */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start' }}>
            <span className="tag-pill tag-sunlit" style={{ padding: '8px 18px', fontSize: '13px', fontWeight: '700', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
              ✨ {userApplications.length} Applied
            </span>
            <span className="tag-pill tag-active" style={{ padding: '8px 18px', fontSize: '13px', fontWeight: '700', background: '#ffffff', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
              🎯 {BJP_SCHEMES.length - userApplications.length} Available to Apply
            </span>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMsg && (
        <div className="tag-pill tag-success" style={{ width: '100%', padding: '12px 18px', borderRadius: '8px', fontSize: '14px', marginBottom: '24px', justifyContent: 'center' }}>
          <CheckCircle2 size={18} />
          <div>{toastMsg}</div>
        </div>
      )}

      {/* Continuous Marquee Ticker for Category Clusters (Right to Left) */}
      <div style={{ marginBottom: '28px', width: '100%', overflow: 'hidden' }}>
        <marquee
          direction="left"
          scrollamount="6"
          style={{ width: '100%', padding: '8px 0' }}
          onMouseOver={(e) => e.target.stop && e.target.stop()}
          onMouseOut={(e) => e.target.start && e.target.start()}
        >
          <div style={{ display: 'inline-flex', gap: '14px', alignItems: 'center' }}>
            {CLUSTERS.map((cluster) => {
              const cleanTitle = getCleanClusterTitle(cluster);
              const isActive = selectedCluster === cluster;

              return (
                <button
                  key={cluster}
                  type="button"
                  onClick={() => setSelectedCluster(cluster)}
                  className={`tab-btn ${isActive ? 'active' : ''}`}
                  style={{
                    cursor: 'pointer',
                    padding: '10px 22px',
                    fontSize: '14px',
                    fontWeight: '700',
                    borderRadius: '9999px',
                    whiteSpace: 'nowrap',
                    boxShadow: isActive ? '0 4px 12px rgba(255, 107, 26, 0.2)' : '0 2px 6px rgba(0,0,0,0.04)',
                    border: isActive ? '2px solid var(--color-campfire-orange)' : '1px solid var(--color-linen)',
                    background: isActive ? 'var(--color-sunlit-cream)' : 'var(--color-paper-white)',
                    color: isActive ? 'var(--color-ember-brown)' : 'var(--color-midnight-ink)'
                  }}
                >
                  {cleanTitle}
                </button>
              );
            })}
          </div>
        </marquee>
      </div>

      {/* Showing count indicator */}
      <div style={{ marginBottom: '20px', fontSize: '13px', color: 'var(--color-slate)' }}>
        Showing <strong>{filteredSchemes.length}</strong> scheme(s) for <strong style={{ color: 'var(--color-midnight-ink)' }}>{getCleanClusterTitle(selectedCluster)}</strong>
      </div>

      {/* 20 Scheme Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
        {filteredSchemes.map((scheme) => {
          const isAlreadyApplied = appliedSchemeIds.includes(scheme.id);
          const existingApp = userApplications.find((app) => app.schemeId === scheme.id);
          const isSelected = selectedIds.includes(scheme.id);

          return (
            <SchemeCard
              key={scheme.id}
              scheme={scheme}
              isSelected={isSelected}
              onToggleSelect={handleToggleSelect}
              isAlreadyApplied={isAlreadyApplied}
              existingApplication={existingApp}
            />
          );
        })}
      </div>

      {/* Floating Bottom Bar when Schemes Selected */}
      {selectedIds.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 90,
            background: 'var(--color-paper-white)',
            border: '1px solid var(--color-linen)',
            borderRadius: '9999px',
            padding: '10px 24px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '20px'
          }}
        >
          <div>
            <div style={{ color: 'var(--color-midnight-ink)', fontWeight: '600', fontSize: '14px' }}>
              {selectedIds.length} Scheme(s) Selected
            </div>
            <div style={{ color: 'var(--color-slate)', fontSize: '12px' }}>
              Click Apply to review and submit
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setSelectedIds([])}
              className="btn btn-ghost"
              style={{ padding: '6px 14px', fontSize: '13px' }}
            >
              Clear
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="btn btn-filled"
              style={{ padding: '8px 20px', fontSize: '14px' }}
            >
              <Send size={14} /> Apply Now ({selectedIds.length})
            </button>
          </div>
        </div>
      )}

      {/* Submission Confirmation Modal */}
      {showModal && (
        <SchemeApplyModal
          selectedIds={selectedIds}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmitApplications}
          isSubmitting={submitting}
        />
      )}

    </div>
  );
};

export default UserHome;
