import React from 'react';
import {
  LayoutDashboard, Users, Building, Shield, LogOut, ChevronLeft, ChevronRight, KeyRound, BarChart3, MapPin, FileText, ShieldCheck
} from 'lucide-react';

/**
 * AdminSidebar — Bulletproof Vertical Left Sidebar for Apple (España) Admin Portal
 */
const AdminSidebar = ({
  activeTab = 'dashboard',
  onSelectTab,
  admin = {},
  isCollapsed = false,
  onToggleCollapse,
  onLogout
}) => {
  const role = admin?.role || 'SUPER_ADMIN';

  const getNavItems = () => {
    switch (role) {
      case 'SUPER_ADMIN':
        return [
          { id: 'dashboard', label: 'Overview Dashboard', icon: LayoutDashboard },
          { id: 'applications', label: 'Scheme Applications', icon: Users },
          { id: 'booth_presidents', label: 'Booth President Requests', icon: ShieldCheck },
          { id: 'reports', label: 'Analytics & Reports', icon: BarChart3 },
          { id: 'logins', label: 'Admin Credentials', icon: KeyRound },
          { id: 'districts', label: 'District Stats', icon: Building },
          { id: 'assemblies', label: 'Assembly Stats', icon: MapPin },
          { id: 'booths', label: 'Booth Stats', icon: Shield }
        ];

      case 'STATE_ADMIN':
        return [
          { id: 'dashboard', label: 'Overview Dashboard', icon: LayoutDashboard },
          { id: 'districts', label: 'District Breakdown', icon: Building },
          { id: 'applications', label: 'Scheme Applications', icon: Users },
          { id: 'booth_presidents', label: 'Booth President Requests', icon: ShieldCheck },
          { id: 'reports', label: 'Reports', icon: BarChart3 },
          { id: 'logins', label: 'Assembly Logins', icon: KeyRound }
        ];

      case 'DISTRICT_ADMIN':
        return [
          { id: 'dashboard', label: 'Overview Dashboard', icon: LayoutDashboard },
          { id: 'assemblies', label: 'Assembly Breakdown', icon: Building },
          { id: 'applications', label: 'Scheme Applications', icon: Users },
          { id: 'booth_presidents', label: 'Booth President Requests', icon: ShieldCheck },
          { id: 'logins', label: 'Booth Logins', icon: KeyRound }
        ];

      case 'ASSEMBLY_ADMIN':
        return [
          { id: 'dashboard', label: 'Overview Dashboard', icon: LayoutDashboard },
          { id: 'booths', label: 'Booth Breakdown', icon: Building },
          { id: 'applications', label: 'Scheme Applications', icon: Users },
          { id: 'booth_presidents', label: 'Booth President Requests', icon: ShieldCheck },
          { id: 'logins', label: 'Booth Logins', icon: KeyRound }
        ];

      case 'BOOTH_ADMIN':
        return [
          { id: 'dashboard', label: 'Overview Dashboard', icon: LayoutDashboard },
          { id: 'applications', label: 'Application Requests', icon: FileText },
          { id: 'voter_stats', label: 'My Voter Stats', icon: Users }
        ];

      default:
        return [
          { id: 'dashboard', label: 'Overview Dashboard', icon: LayoutDashboard },
          { id: 'applications', label: 'Applications', icon: Users }
        ];
    }
  };

  const navItems = getNavItems();

  return (
    <aside
      className={`admin-sidebar ${isCollapsed ? 'collapsed' : ''}`}
      style={{
        width: isCollapsed ? '68px' : '240px',
        minWidth: isCollapsed ? '68px' : '240px',
        height: '100vh',
        maxHeight: '100vh',
        position: 'relative',
        top: 0,
        left: 0,
        backgroundColor: '#ffffff',
        borderRight: '1px solid var(--color-cool-wash, #e8e8ed)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        zIndex: 200,
        boxSizing: 'border-box',
        transition: 'width 0.25s ease, min-width 0.25s ease'
      }}
    >
      {/* Header */}
      <div
        className="admin-sidebar-header"
        style={{
          padding: isCollapsed ? '16px 8px' : '16px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          gap: isCollapsed ? '8px' : '12px',
          borderBottom: '1px solid var(--color-cool-wash, #e8e8ed)',
          minHeight: '72px',
          boxSizing: 'border-box'
        }}
      >
        {isCollapsed ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              width: '100%'
            }}
            onClick={onToggleCollapse}
            title="Click to Expand Sidebar"
          >
            <img
              src="/bjp_logo.svg"
              alt="BJP Logo"
              className="admin-logo"
              style={{
                width: '32px',
                height: '32px',
                objectFit: 'contain'
              }}
            />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
              className="admin-toggle-btn"
              title="Expand Sidebar"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'var(--color-canvas, #f5f5f7)',
                border: '1px solid #d2d2d7',
                color: 'var(--color-electric-blue, #0071e3)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                padding: 0
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          <>
            <img
              src="/bjp_logo.svg"
              alt="BJP Logo"
              className="admin-logo"
              style={{
                width: '36px',
                height: '36px',
                maxWidth: '36px',
                maxHeight: '36px',
                objectFit: 'contain',
                flexShrink: 0
              }}
            />
            <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
              <div
                className="admin-brand"
                style={{
                  fontFamily: 'var(--font-sf-pro-display)',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: 'var(--color-primary-ink, #1d1d1f)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                BJP Nalam Thittam
              </div>
              <div
                className="admin-tagline"
                style={{
                  fontSize: '11px',
                  color: 'var(--color-electric-blue, #0071e3)',
                  whiteSpace: 'nowrap',
                  fontWeight: '500'
                }}
              >
                {role.replace('_', ' ')}
              </div>
            </div>
            <button
              type="button"
              onClick={onToggleCollapse}
              className="admin-toggle-btn"
              title="Collapse Sidebar"
              style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '980px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-deep-gray, #474747)',
                flexShrink: 0
              }}
            >
              <ChevronLeft size={18} />
            </button>
          </>
        )}
      </div>



      {/* Navigation Links — Vertical Stack */}
      <nav
        className="admin-nav"
        style={{
          flex: 1,
          padding: '16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          overflowY: 'auto'
        }}
      >
        {!isCollapsed && (
          <div style={{
            fontSize: '11px',
            fontWeight: '600',
            color: 'var(--color-mid-gray, #707070)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '4px',
            paddingLeft: '6px'
          }}>
            Navigation
          </div>
        )}

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id || (activeTab === 'districtStats' && item.id === 'districts') || (activeTab === 'assemblyStats' && item.id === 'assemblies') || (activeTab === 'boothStats' && item.id === 'booths');

          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                if (onSelectTab) onSelectTab(item.id);
              }}
              className={`admin-nav-item ${isActive ? 'active' : ''}`}
              title={isCollapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 14px',
                borderRadius: '980px',
                fontSize: '14px',
                fontWeight: isActive ? '500' : '400',
                color: isActive ? '#ffffff' : 'var(--color-deep-gray, #474747)',
                backgroundColor: isActive ? 'var(--color-primary-ink, #1d1d1f)' : 'transparent',
                textDecoration: 'none',
                transition: 'all 0.18s ease',
                whiteSpace: 'nowrap',
                overflow: 'hidden'
              }}
            >
              <Icon size={18} style={{ flexShrink: 0 }} />
              {!isCollapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
            </a>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        className="admin-sidebar-footer"
        style={{
          padding: '16px 14px',
          borderTop: '1px solid var(--color-cool-wash, #e8e8ed)',
          boxSizing: 'border-box'
        }}
      >
        {admin?.username && !isCollapsed && (
          <div style={{
            fontSize: '12px',
            color: 'var(--color-mid-gray, #707070)',
            marginBottom: '12px',
            padding: '0 4px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            Signed in as <strong style={{ color: 'var(--color-primary-ink, #1d1d1f)' }}>{admin.username}</strong>
          </div>
        )}

        <button
          type="button"
          onClick={onLogout}
          className="admin-logout-btn"
          title="Sign Out"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '10px 16px',
            width: '100%',
            backgroundColor: 'var(--color-canvas, #f5f5f7)',
            border: 'none',
            borderRadius: '980px',
            color: 'var(--color-primary-ink, #1d1d1f)',
            fontSize: '14px',
            fontWeight: '400',
            cursor: 'pointer',
            transition: 'all 0.18s ease'
          }}
        >
          <LogOut size={16} />
          {!isCollapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
};

export default AdminSidebar;
