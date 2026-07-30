import React from 'react';
import { Share2, ChevronRight } from 'lucide-react';

/**
 * Shared Top Referral Champions card — Apple (España) style reference.
 */
const TopReferrersCard = ({ topReferrers = [], scopeLabel = '', onViewProfile }) => {
  const MEDAL = ['🥇', '🥈', '🥉'];

  return (
    <div className="campsite-card" style={{
      width: '100%',
      padding: '28px',
      marginTop: '28px',
      boxSizing: 'border-box',
      borderRadius: '28px',
      backgroundColor: '#ffffff',
      border: 'none'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h3 style={{
            fontFamily: 'var(--font-sf-pro-display)',
            fontSize: '24px',
            fontWeight: '600',
            color: 'var(--color-primary-ink)',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            letterSpacing: '0.007em'
          }}>
            <Share2 size={22} color="var(--color-electric-blue)" />
            Top 5 Referral Champions{scopeLabel ? ` — ${scopeLabel}` : ''}
          </h3>
          <div style={{ fontSize: '14px', color: 'var(--color-mid-gray)', marginTop: '4px' }}>
            Members who referred the highest number of registrations
          </div>
        </div>
        <span className="tag-pill tag-active" style={{ fontSize: '13px', background: 'var(--color-canvas)', color: 'var(--color-primary-ink)' }}>
          Referral Leaderboard
        </span>
      </div>

      {!topReferrers || topReferrers.length === 0 ? (
        <div style={{
          padding: '36px',
          textAlign: 'center',
          color: 'var(--color-mid-gray)',
          background: 'var(--color-canvas)',
          borderRadius: '28px',
          fontSize: '15px'
        }}>
          No referral activity recorded yet for this scope.
        </div>
      ) : (
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px 16px' }}>Rank &amp; Member</th>
                <th style={{ padding: '12px 16px' }}>EPIC ID</th>
                <th style={{ padding: '12px 16px' }}>District / Assembly</th>
                <th style={{ padding: '12px 16px' }}>Total Referrals</th>
                {onViewProfile && <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {topReferrers.map((ref, idx) => (
                <tr key={ref.epicNo || ref.referralCode || idx}>
                  <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '980px',
                        background: idx === 0 ? '#fef3c7' : idx === 1 ? '#e8e8ed' : idx === 2 ? '#f0e4d3' : 'var(--color-canvas)',
                        color: 'var(--color-primary-ink)',
                        fontWeight: '600',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {MEDAL[idx] || `#${idx + 1}`}
                      </span>
                      <span style={{ fontWeight: '500', color: 'var(--color-primary-ink)', fontSize: '15px' }}>
                        {ref.voterName || `Referrer (${ref.epicNo})`}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '16px', fontFamily: 'var(--font-ui-monospace)', fontWeight: '500', color: 'var(--color-mid-gray)', fontSize: '13px' }}>
                    {ref.epicNo || ref.referralCode || '—'}
                  </td>
                  <td style={{ padding: '16px', fontSize: '14px', color: 'var(--color-mid-gray)' }}>
                    {ref.district ? (
                      <>
                        <div style={{ fontWeight: '500', color: 'var(--color-primary-ink)' }}>{ref.district}</div>
                        <div style={{ fontSize: '13px' }}>{ref.assemblyName || ''}</div>
                      </>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '16px' }}>
                    <span className="badge-status badge-confirmed" style={{ fontSize: '13px', padding: '6px 14px' }}>
                      {ref.referralCount} referred
                    </span>
                  </td>
                  {onViewProfile && (
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => onViewProfile(ref)}
                        className="btn-action btn-view"
                        style={{ padding: '8px 16px', fontSize: '13px' }}
                      >
                        View Profile <ChevronRight size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TopReferrersCard;
