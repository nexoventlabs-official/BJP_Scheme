import React from 'react';
import {
  LayoutDashboard, Users, Shield, Building, Award, LogOut, ChevronLeft, ChevronRight, FileText, Database
} from 'lucide-react';

/**
 * AdminSidebar — Reusable Apple (España) styled sidebar for all admin dashboards
 */
const AdminSidebar = ({
  activeTab = 'dashboard',
  onSelectTab,
  admin = {},
  isCollapsed = false,
  onToggleCollapse,
  onLogout
}) => {

  const getNavItems = () => {
    const role = admin?.role || 'SUPER_ADMIN';
    const items = [
      { id: 'dashboard', label: 'Overview Dashboard', icon: LayoutDashboard }
    ];

    if (role === 'SUPER_ADMIN') {
      items.push(
        { id: 'voters', label: 'Voter Applications', icon: Users },
        { id: 'reports', label: 'Analytics Reports', icon: FileText },
        { id: 'logins', label: 'Logins & Access', icon: Database }
      );
    } else if (role === 'STATE_ADMIN') {
      items.push(
        { id: 'districts', label: 'District Management', icon: Building },
        { id: 'voters', label: 'Voter Applications', icon: Users },
        { id: 'reports', label: 'Reports', icon: FileText },
        { id: 'logins', label: 'Credentials', icon: Database }
      );
    } else if (role === 'DISTRICT_ADMIN') {
      items.push(
        { id: 'assemblies', label: 'Assembly Breakdown', icon: Building },
        { id: 'voters', label: 'Voter Applications', icon: Users },
        { id: 'logins', label: 'Booth Logins', icon: Database }
      );
    } else if (role === 'ASSEMBLY_ADMIN') {
      items.push(
        { id: 'booths', label: 'Booth Breakdown', icon: Building },
        { id: 'voters', label: 'Voter Applications', icon: Users },
        { id: 'logins', label: 'Booth Logins', icon: Database }
      );
    } else if (role === 'BOOTH_ADMIN') {
      items.push(
        { id: 'voters', label: 'Booth Members', icon: Users }
      );
    }

    return items;
  };

  const navItems = getNavItems();

  return (
    <aside className={`admin-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Header */}
      <div className="admin-sidebar-header">
        <img src="/bjp_logo.svg" alt="BJP Logo" className="admin-logo" />
        {!isCollapsed && (
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="admin-brand">BJP Nalam Thittam</div>
            <div className="admin-tagline">{admin?.role?.replace('_', ' ') || 'Admin Portal'}</div>
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="admin-toggle-btn"
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          style={{ marginLeft: 'auto' }}
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="admin-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

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
            >
              <Icon size={18} />
              {!isCollapsed && <span>{item.label}</span>}
            </a>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="admin-sidebar-footer">
        {admin?.username && !isCollapsed && (
          <div style={{
            fontSize: '12px',
            color: 'var(--color-mid-gray)',
            marginBottom: '10px',
            padding: '0 4px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            Logged in as <strong style={{ color: 'var(--color-primary-ink)' }}>{admin.username}</strong>
          </div>
        )}

        <button
          type="button"
          onClick={onLogout}
          className="admin-logout-btn"
          title="Logout"
        >
          <LogOut size={16} />
          {!isCollapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
};

export default AdminSidebar;
