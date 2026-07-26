import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, User as UserIcon, Shield } from 'lucide-react';

const Navbar = ({ activeTab, setActiveTab }) => {
  const { user, logoutUser, admin, logoutAdmin } = useAuth();

  return (
    <header style={{
      background: 'transparent',
      borderBottom: 'none',
      boxShadow: 'none',
      position: 'relative',
      zIndex: 100,
      padding: '14px 0'
    }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        
        {/* BJP Brand Logo & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => setActiveTab && setActiveTab('schemes')}>
          <img
            src="/bjp_logo.svg"
            alt="BJP Logo"
            style={{ height: '38px', width: 'auto', flexShrink: 0 }}
          />
          <div>
            <div style={{ fontSize: '17px', fontWeight: '700', color: 'var(--color-midnight-ink)', letterSpacing: '-0.3px' }}>
              BJP Nalam Thittam
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-slate)' }}>
              Direct Benefit Transfer Automation
            </div>
          </div>
        </div>

        {/* Navigation Tabs (9999px Pill buttons) */}
        {user && (
          <nav style={{ display: 'flex', gap: '6px', background: 'rgba(245, 245, 245, 0.85)', backdropFilter: 'blur(8px)', padding: '4px', borderRadius: '9999px', border: '1px solid rgba(240, 240, 240, 0.6)' }}>
            <button
              onClick={() => setActiveTab('schemes')}
              className={`tab-btn ${activeTab === 'schemes' ? 'active' : ''}`}
            >
              20 Schemes
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
            >
              My Profile
            </button>
            <button
              onClick={() => setActiveTab('requests')}
              className={`tab-btn ${activeTab === 'requests' ? 'active' : ''}`}
            >
              My Requests
            </button>
            <button
              onClick={() => setActiveTab('referrals')}
              className={`tab-btn ${activeTab === 'referrals' ? 'active' : ''}`}
            >
              Referral Link
            </button>
          </nav>
        )}

        {/* User Pill / Admin Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {user ? (
            <>
              <div className="tag-pill tag-sunlit" style={{ padding: '6px 14px', fontSize: '13px', background: '#fef3c7' }}>
                <UserIcon size={14} color="var(--color-campfire-orange)" />
                <span style={{ fontWeight: '600', color: 'var(--color-midnight-ink)' }}>{user.voterName}</span>
                <span style={{ color: 'var(--color-slate)', fontSize: '11px' }}>({user.epicNo})</span>
              </div>

              <button
                onClick={logoutUser}
                className="btn btn-ghost"
                title="Logout to restart flow"
                style={{ padding: '6px 14px', fontSize: '13px', background: 'rgba(255, 255, 255, 0.7)' }}
              >
                <LogOut size={14} />
                Logout
              </button>
            </>
          ) : admin ? (
            <>
              <div className="tag-pill tag-active" style={{ padding: '6px 14px', fontSize: '13px' }}>
                <Shield size={14} />
                <span>{admin.role} ({admin.username})</span>
              </div>

              <button
                onClick={logoutAdmin}
                className="btn btn-ghost"
                style={{ padding: '6px 14px', fontSize: '13px', background: 'rgba(255, 255, 255, 0.7)' }}
              >
                <LogOut size={14} />
                Admin Logout
              </button>
            </>
          ) : null}
        </div>

      </div>
    </header>
  );
};

export default Navbar;
