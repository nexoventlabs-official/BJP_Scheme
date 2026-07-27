import React from 'react';
import { Share2, ChevronRight } from 'lucide-react';

/**
 * Shared Top Referral Champions card — reusable across all admin dashboards.
 */
const TopReferrersCard = ({ topReferrers = [], scopeLabel = '', onViewProfile }) => {
  const MEDAL = ['🥇', '🥈', '🥉'];

  return (
    <div className="campsite-card" style={{ width: '100%', padding: '24px', marginTop: '24px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-midnight-ink)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Share2 size={20} color="var(--color-campfire-orange)" />
            Top 5 Referral Champions{scopeLabel ? ` — ${scopeLabel}` : ''}
          </h3>
          <div style={{ fontSize: '13px', color: 'var(--color-slate)', marginTop: '3px' }}>
            Members who referred the highest number of registrations
          </div>
        </div>
        <span className="tag-pill tag-sunlit" style={{ fontSize: '11px' }}>Referral Leaderboard</span>
      </div>

      {!topReferrers || topReferrers.length === 0 ? (
        <div style={{ padding: '28px', textAlign: 'center', color: 'var(--color-slate)', background: 'var(--color-fog-gray)', borderRadius: '10px', fontSize: '14px' }}>
          No referral activity recorded yet for this scope.
        </div>
      ) : (
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-linen)', color: 'var(--color-slate)', textAlign: 'left', background: 'var(--color-fog-gray)' }}>
                <th style={{ padding: '10px 12px' }}>RANK &amp; MEMBER</th>
                <th style={{ padding: '10px 12px' }}>EPIC ID</th>
                <th style={{ padding: '10px 12px' }}>DISTRICT / ASSEMBLY</th>
                <th style={{ padding: '10px 12px' }}>TOTAL REFERRALS</th>
                {onViewProfile && <th style={{ padding: '10px 12px', textAlign: 'right' }}>ACTION</th>}
              </tr>
            </thead>
            <tbody>
              {topReferrers.map((ref, idx) => (
                <tr key={ref.epicNo || ref.referralCode || idx}
                  style={{ borderBottom: '1px solid var(--color-linen)', transition: 'background 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-fog-gray)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ width: '28px', height: '28px', borderRadius: '9999px',
                        background: idx === 0 ? '#fef3c7' : idx === 1 ? '#f3f4f6' : idx === 2 ? '#fef9c3' : 'var(--color-fog-gray)',
                        color: idx === 0 ? '#d97706' : idx === 1 ? '#6b7280' : idx === 2 ? '#92400e' : 'var(--color-midnight-ink)',
                        fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {MEDAL[idx] || '#' + (idx + 1)}
                      </span>
                      <span style={{ fontWeight: '700', color: 'var(--color-midnight-ink)', fontSize: '14px' }}>
                        {ref.voterName || 'Referrer (' + ref.epicNo + ')'}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '12px', fontFamily: 'monospace', fontWeight: '600', color: 'var(--color-slate)', fontSize: '12px' }}>
                    {ref.epicNo || ref.referralCode || '—'}
                  </td>
                  <td style={{ padding: '12px', fontSize: '12px', color: 'var(--color-slate)' }}>
                    {ref.district ? (
                      <><div style={{ fontWeight: '600', color: 'var(--color-midnight-ink)' }}>{ref.district}</div>
                      <div>{ref.assemblyName || ''}</div></>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px',
                      background: 'rgba(34, 197, 94, 0.12)', color: '#15803d',
                      padding: '4px 10px', borderRadius: '999px', fontWeight: '700', fontSize: '13px' }}>
                      {ref.referralCount} referred
                    </span>
                  </td>
                  {onViewProfile && (
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <button type="button" onClick={() => onViewProfile(ref)} className="btn btn-ghost"
                        style={{ padding: '6px 14px', fontSize: '12px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
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
