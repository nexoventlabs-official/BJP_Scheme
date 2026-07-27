import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import StatusBadge from './StatusBadge';
import MemberProfileTimelineView from './MemberProfileTimelineView';
import {
  Shield, Users, Building, PhoneCall, RefreshCw, Search, Eye, Award,
  FileText, LayoutDashboard, Database, MapPin, Key, LogOut, Bell, ChevronRight, CheckCircle2, AlertCircle, Clock
} from 'lucide-react';
import '../styles/maxton-dashboard.css';

const MaxtonDashboardLayout = ({
  roleTitle = 'Governance Dashboard',
  roleBadge = 'ADMIN',
  activeScopeText = 'Full Statewide Governance',
  statsData,
  loadingStats,
  voters = [],
  loadingVoters = false,
  totalVoters = 0,
  totalPages = 1,
  currentPage = 1,
  onPageChange,
  // Filters
  searchQuery = '',
  setSearchQuery,
  statusFilter = '',
  setStatusFilter,
  districtFilter = '',
  setDistrictFilter,
  assemblyFilter = '',
  setAssemblyFilter,
  boothFilter = '',
  setBoothFilter,
  // Dropdown Metadata
  districts = [],
  assemblies = [],
  booths = [],
  // Refresh & Call handlers
  onRefresh,
  handleUpdateAppStatus,
  handleDirectCallVoter,
  selectedVoterTimeline,
  setSelectedVoterTimeline,
  // Login credentials tab data
  districtCredentials = [],
  assemblyCredentials = [],
  boothCredentialsData = null,
  selectedAssemblyNo = '1',
  setSelectedAssemblyNo,
  assembliesList = [],
  fetchBoothCredentials,
  subPage = 'dashboard',
  setSubPage
}) => {
  const { admin, logoutAdmin } = useAuth();
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [boothSearchQuery, setBoothSearchQuery] = useState('');

  // Calculate real percentages for Donut Chart
  const statusMap = statsData?.overview?.statusBreakdown || {};
  const totalApps = statsData?.overview?.totalApplications || 0;
  const approvedCount = statusMap.Approved || 0;
  const pendingCount = (statusMap.Submitted || 0) + (statusMap.Pending || 0);
  const inProgressCount = statusMap['In Progress'] || statusMap.Called || 0;
  const rejectedCount = statusMap.Rejected || 0;

  const approvedPct = totalApps > 0 ? Math.round((approvedCount / totalApps) * 100) : 68;
  const pendingPct = totalApps > 0 ? Math.round((pendingCount / totalApps) * 100) : 22;
  const inProgressPct = totalApps > 0 ? Math.round((inProgressCount / totalApps) * 100) : 7;
  const rejectedPct = totalApps > 0 ? Math.round((rejectedCount / totalApps) * 100) : 3;

  const navItems = [
    { key: 'dashboard', label: 'Overview Dashboard', icon: <LayoutDashboard size={18} /> },
    { key: 'applications', label: 'Scheme Applications', icon: <FileText size={18} />, badge: totalVoters },
    { key: 'logins', label: 'Jurisdiction Credentials', icon: <Key size={18} /> },
    { key: 'districts', label: 'District Stats', icon: <Building size={18} /> },
    { key: 'assemblies', label: 'Assembly Stats', icon: <Database size={18} /> },
    { key: 'booths', label: 'Booth Stats', icon: <MapPin size={18} /> },
  ];

  const filteredNavItems = navItems.filter(item =>
    item.label.toLowerCase().includes(sidebarSearch.toLowerCase())
  );

  const getPageRange = () => {
    const range = [];
    const delta = 2;
    const left = Math.max(1, currentPage - delta);
    const right = Math.min(totalPages, currentPage + delta);
    if (left > 1) { range.push(1); if (left > 2) range.push('...'); }
    for (let i = left; i <= right; i++) range.push(i);
    if (right < totalPages) { if (right < totalPages - 1) range.push('...'); range.push(totalPages); }
    return range;
  };

  const filteredBooths = boothCredentialsData?.boothLogins?.filter(b => {
    if (!boothSearchQuery) return true;
    return (
      b.boothNo.includes(boothSearchQuery) ||
      b.username.toLowerCase().includes(boothSearchQuery.toLowerCase()) ||
      b.passcode.includes(boothSearchQuery)
    );
  }) || [];

  return (
    <div className="maxton-wrapper">
      {/* ══════════════════════════════════════════ */}
      {/* LEFT SIDEBAR NAVIGATION                    */}
      {/* ══════════════════════════════════════════ */}
      <aside className="maxton-sidebar">
        <div className="maxton-sidebar-brand">
          <div className="maxton-logo-icon">🪷</div>
          <div>
            <div className="maxton-brand-text">Maxton Admin</div>
            <div style={{ fontSize: '11px', color: 'var(--mx-primary)', fontWeight: '700' }}>
              {roleBadge} PORTAL
            </div>
          </div>
        </div>

        <div className="maxton-sidebar-search">
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--mx-text-muted)' }} />
            <input
              type="text"
              placeholder="Search menu..."
              className="maxton-sidebar-search-input"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="maxton-menu-section">
          <div className="maxton-menu-label">Main Dashboard</div>
          {filteredNavItems.map(item => (
            <button
              key={item.key}
              onClick={() => {
                setSubPage(item.key);
                if (setSelectedVoterTimeline) setSelectedVoterTimeline(null);
              }}
              className={`maxton-nav-item ${subPage === item.key ? 'active' : ''}`}
            >
              <div className="maxton-nav-item-content">
                {item.icon}
                <span>{item.label}</span>
              </div>
              {item.badge != null && item.badge > 0 && (
                <span className="maxton-nav-badge">{item.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* Sidebar Footer User Info */}
        <div className="maxton-user-profile-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #FF9933 0%, #00a040 100%)',
              color: '#fff', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {(admin?.username || 'A')[0].toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {admin?.username || 'Admin User'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--mx-text-muted)' }}>
                {roleBadge}
              </div>
            </div>
          </div>

          <button
            onClick={logoutAdmin}
            title="Logout"
            style={{
              background: 'transparent', border: 'none', color: '#ef4444',
              cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center'
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* ══════════════════════════════════════════ */}
      {/* MAIN CONTENT CANVAS                        */}
      {/* ══════════════════════════════════════════ */}
      <main className="maxton-main">
        {/* Topbar Navigation */}
        <header className="maxton-topbar">
          <div className="maxton-topbar-left">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--mx-text-muted)' }}>
              <span>Governance</span>
              <ChevronRight size={14} />
              <span style={{ color: '#fff', fontWeight: '600' }}>{roleTitle}</span>
              <ChevronRight size={14} />
              <span style={{ color: 'var(--mx-primary)', fontWeight: '700', textTransform: 'capitalize' }}>{subPage}</span>
            </div>
          </div>

          <div className="maxton-topbar-right">
            <div className="maxton-global-search">
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--mx-text-muted)' }} />
              <input
                type="text"
                placeholder="Search EPIC, Mobile, Member Name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <button
              onClick={onRefresh}
              className="maxton-icon-btn"
              title="Refresh Data"
            >
              <RefreshCw size={18} />
            </button>

            <div className="maxton-icon-btn" title="Notifications">
              <Bell size={18} />
              <span className="maxton-badge-dot" />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '8px' }}>
              <span style={{
                display: 'inline-block', width: '8px', height: '8px',
                borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 8px #10b981'
              }} />
              <span style={{ fontSize: '12px', color: '#10b981', fontWeight: '700' }}>Live DB</span>
            </div>
          </div>
        </header>

        {/* Dashboard Content Container */}
        <div className="maxton-content-padding">

          {/* ══════════════════════════════════════════ */}
          {/* TAB 1: OVERVIEW DASHBOARD                  */}
          {/* ══════════════════════════════════════════ */}
          {subPage === 'dashboard' && (
            loadingStats ? (
              <div style={{ textAlign: 'center', padding: '80px', color: 'var(--mx-text-muted)' }}>
                <RefreshCw size={36} className="animate-spin" style={{ margin: '0 auto 16px auto', color: 'var(--mx-primary)' }} />
                <div style={{ fontSize: '15px', fontWeight: '600' }}>Loading real-time Maxton analytics...</div>
              </div>
            ) : (
              <>
                {/* HERO CONGRATULATIONS CARD */}
                <div className="maxton-hero-card">
                  <div>
                    <h2 className="maxton-hero-title">
                      Congratulations {admin?.username || 'Admin'}! 🎉
                    </h2>
                    <p className="maxton-hero-sub">
                      You are governing <strong>{activeScopeText}</strong>. All Directives &amp; Member Applications are synced in real-time.
                    </p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginBottom: '20px' }}>
                      <div className="maxton-hero-metric">
                        {totalApps.toLocaleString()}
                      </div>
                      <span style={{ fontSize: '13px', color: '#10b981', fontWeight: '700' }}>
                        ⚡ {approvedPct}% Approval Directives Target
                      </span>
                    </div>

                    <button
                      onClick={() => setSubPage('applications')}
                      className="maxton-hero-btn"
                    >
                      <span>View Directives</span>
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  <div className="maxton-gift-icon-container">
                    🎁
                  </div>
                </div>

                {/* 4 STAT METRIC CARDS WITH SPARKLINE GRAPHS */}
                <div className="maxton-stats-grid">
                  {/* Card 1: Total Voters in Roll */}
                  <div className="maxton-stat-card">
                    <div className="maxton-stat-header">
                      <div className="maxton-stat-icon-box" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
                        👥
                      </div>
                      <span className="maxton-stat-growth up">+24% ▲</span>
                    </div>
                    <div className="maxton-stat-value">
                      {statsData?.overview?.totalVotersInRoll != null
                        ? (statsData.overview.totalVotersInRoll / 1000).toFixed(1) + 'k'
                        : '248k'}
                    </div>
                    <div className="maxton-stat-label">Total Voters in Roll</div>
                    {/* SVG Curve Sparkline */}
                    <svg className="maxton-sparkline-svg" viewBox="0 0 100 30">
                      <path d="M0,25 Q15,5 30,20 T60,10 T90,22 T100,5" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  </div>

                  {/* Card 2: Enrolled Members */}
                  <div className="maxton-stat-card">
                    <div className="maxton-stat-header">
                      <div className="maxton-stat-icon-box" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                        💵
                      </div>
                      <span className="maxton-stat-growth up">+14% ▲</span>
                    </div>
                    <div className="maxton-stat-value">
                      {statsData?.overview?.totalVotersRequested != null
                        ? statsData.overview.totalVotersRequested.toLocaleString()
                        : '47.6k'}
                    </div>
                    <div className="maxton-stat-label">Enrolled Members</div>
                    {/* SVG Green Sparkline */}
                    <svg className="maxton-sparkline-svg" viewBox="0 0 100 30">
                      <path d="M0,28 L20,18 L40,25 L60,12 L80,19 L100,6" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  </div>

                  {/* Card 3: Applications Submitted */}
                  <div className="maxton-stat-card">
                    <div className="maxton-stat-header">
                      <div className="maxton-stat-icon-box" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4' }}>
                        📄
                      </div>
                      <span className="maxton-stat-growth down">-35% ▼</span>
                    </div>
                    <div className="maxton-stat-value">
                      {totalApps > 0 ? (totalApps / 1000).toFixed(1) + 'k' : '189k'}
                    </div>
                    <div className="maxton-stat-label">Total Directives</div>
                    {/* SVG Cyan Sparkline */}
                    <svg className="maxton-sparkline-svg" viewBox="0 0 100 30">
                      <path d="M0,10 L25,25 L50,12 L75,22 L100,8" fill="none" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  </div>

                  {/* Card 4: Directives Approval Rate */}
                  <div className="maxton-stat-card">
                    <div className="maxton-stat-header">
                      <div className="maxton-stat-icon-box" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
                        📊
                      </div>
                      <span className="maxton-stat-growth up">+18% ▲</span>
                    </div>
                    <div className="maxton-stat-value">
                      {approvedPct}%
                    </div>
                    <div className="maxton-stat-label">Approval Rate</div>
                    {/* SVG Orange Bar Sparklines */}
                    <svg className="maxton-sparkline-svg" viewBox="0 0 100 30">
                      <rect x="5" y="15" width="8" height="15" rx="2" fill="#f59e0b" />
                      <rect x="25" y="8" width="8" height="22" rx="2" fill="#f59e0b" />
                      <rect x="45" y="12" width="8" height="18" rx="2" fill="#f59e0b" />
                      <rect x="65" y="5" width="8" height="25" rx="2" fill="#f59e0b" />
                      <rect x="85" y="10" width="8" height="20" rx="2" fill="#f59e0b" />
                    </svg>
                  </div>
                </div>

                {/* MIDDLE ROW: DONUT CHART + BAR CHART ANALYTICS */}
                <div className="maxton-analytics-grid">
                  {/* LEFT: DONUT CHART (APPLICATION STATUS BREAKDOWN) */}
                  <div className="maxton-card">
                    <div className="maxton-card-header">
                      <h3 className="maxton-card-title">Directive Status Breakdown</h3>
                      <button style={{ background: 'none', border: 'none', color: 'var(--mx-text-muted)', cursor: 'pointer' }}>⋮</button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0', position: 'relative' }}>
                      <svg width="210" height="210" viewBox="0 0 42 42" className="maxton-donut-svg">
                        <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#232a3b" strokeWidth="4.5" />
                        {/* Approved Slice (Green) */}
                        <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#10b981" strokeWidth="4.5"
                          strokeDasharray={`${approvedPct} ${100 - approvedPct}`} strokeDashoffset="25" />
                        {/* Pending Slice (Orange) */}
                        <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#f59e0b" strokeWidth="4.5"
                          strokeDasharray={`${pendingPct} ${100 - pendingPct}`} strokeDashoffset={`${25 - approvedPct}`} />
                        {/* In Progress Slice (Cyan) */}
                        <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#06b6d4" strokeWidth="4.5"
                          strokeDasharray={`${inProgressPct} ${100 - inProgressPct}`} strokeDashoffset={`${25 - approvedPct - pendingPct}`} />
                      </svg>

                      <div style={{
                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '26px', fontWeight: '900', color: '#ffffff' }}>{approvedPct}%</div>
                        <div style={{ fontSize: '11px', color: 'var(--mx-text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Directives Approved</div>
                      </div>
                    </div>

                    <div className="maxton-legend-list">
                      <div className="maxton-legend-item">
                        <div className="maxton-legend-left">
                          <span className="maxton-legend-dot" style={{ background: '#10b981' }} />
                          <span style={{ color: '#ffffff', fontWeight: '600' }}>Approved</span>
                        </div>
                        <span style={{ fontWeight: '700', color: '#10b981' }}>{approvedCount} ({approvedPct}%)</span>
                      </div>

                      <div className="maxton-legend-item">
                        <div className="maxton-legend-left">
                          <span className="maxton-legend-dot" style={{ background: '#f59e0b' }} />
                          <span style={{ color: '#ffffff', fontWeight: '600' }}>Pending Verification</span>
                        </div>
                        <span style={{ fontWeight: '700', color: '#f59e0b' }}>{pendingCount} ({pendingPct}%)</span>
                      </div>

                      <div className="maxton-legend-item">
                        <div className="maxton-legend-left">
                          <span className="maxton-legend-dot" style={{ background: '#06b6d4' }} />
                          <span style={{ color: '#ffffff', fontWeight: '600' }}>In Progress / Called</span>
                        </div>
                        <span style={{ fontWeight: '700', color: '#06b6d4' }}>{inProgressCount} ({inProgressPct}%)</span>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT: BAR CHART (APPLICATIONS VS APPROVALS ANALYTICS) */}
                  <div className="maxton-card">
                    <div className="maxton-card-header">
                      <h3 className="maxton-card-title">Applications &amp; Approvals Analytics</h3>
                      <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
                        <span style={{ color: '#f59e0b', fontWeight: '700' }}>■ Applications</span>
                        <span style={{ color: '#06b6d4', fontWeight: '700' }}>■ Approved</span>
                      </div>
                    </div>

                    {/* SVG Multi Column Chart */}
                    <div style={{ width: '100%', height: '200px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--mx-border)' }}>
                      {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'].map((month, idx) => {
                        const h1 = [30, 20, 75, 25, 50, 35, 45, 30, 55][idx];
                        const h2 = [25, 15, 60, 20, 40, 28, 60, 22, 42][idx];
                        return (
                          <div key={month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '80%' }}>
                              <div style={{ width: '12px', height: `${h1}%`, background: '#f59e0b', borderRadius: '4px 4px 0 0' }} />
                              <div style={{ width: '12px', height: `${h2}%`, background: '#06b6d4', borderRadius: '4px 4px 0 0' }} />
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--mx-text-muted)', marginTop: '8px' }}>{month}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Bottom Summary Indicators */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '20px' }}>
                      <div style={{ padding: '16px', background: 'var(--mx-bg-input)', borderRadius: '12px', border: '1px solid var(--mx-border)' }}>
                        <div style={{ fontSize: '12px', color: 'var(--mx-text-muted)', fontWeight: '600' }}>Monthly Target</div>
                        <div style={{ fontSize: '22px', fontWeight: '900', color: '#ffffff', margin: '4px 0' }}>65,127</div>
                        <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '700' }}>+16.5% 55.21 USD</span>
                      </div>

                      <div style={{ padding: '16px', background: 'var(--mx-bg-input)', borderRadius: '12px', border: '1px solid var(--mx-border)' }}>
                        <div style={{ fontSize: '12px', color: 'var(--mx-text-muted)', fontWeight: '600' }}>Yearly Target</div>
                        <div style={{ fontSize: '22px', fontWeight: '900', color: '#ffffff', margin: '4px 0' }}>984,246</div>
                        <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '700' }}>+24.9% 267.35 USD</span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )
          )}

          {/* ══════════════════════════════════════════ */}
          {/* TAB 2: SCHEME APPLICATIONS (MEMBERS TABLE) */}
          {/* ══════════════════════════════════════════ */}
          {subPage === 'applications' && (
            <div className="maxton-card">
              <div className="maxton-card-header" style={{ flexWrap: 'wrap', gap: '16px' }}>
                <h3 className="maxton-card-title">
                  Scheme Member Applications ({totalVoters})
                </h3>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {/* District Filter */}
                  {districts.length > 0 && (
                    <select
                      value={districtFilter}
                      onChange={(e) => setDistrictFilter(e.target.value)}
                      style={{ background: 'var(--mx-bg-input)', color: '#fff', border: '1px solid var(--mx-border)', borderRadius: '10px', padding: '8px 12px', fontSize: '12px' }}
                    >
                      <option value="">All Districts</option>
                      {districts.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  )}

                  {/* Status Filter */}
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ background: 'var(--mx-bg-input)', color: '#fff', border: '1px solid var(--mx-border)', borderRadius: '10px', padding: '8px 12px', fontSize: '12px' }}
                  >
                    <option value="">All Statuses</option>
                    <option value="Submitted">Submitted</option>
                    <option value="Approved">Approved</option>
                    <option value="Called">Called</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
              </div>

              {selectedVoterTimeline ? (
                <MemberProfileTimelineView
                  voter={selectedVoterTimeline}
                  onBack={() => setSelectedVoterTimeline(null)}
                  onStatusUpdated={() => onPageChange(currentPage)}
                />
              ) : loadingVoters ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--mx-text-muted)' }}>
                  <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px auto' }} />
                  <div>Loading member applications...</div>
                </div>
              ) : (
                <>
                  <div className="maxton-table-container">
                    <table className="maxton-table">
                      <thead>
                        <tr>
                          <th>VOTER / MEMBER NAME</th>
                          <th>EPIC / MOBILE</th>
                          <th>JURISDICTION (DISTRICT / ASSEMBLY / BOOTH)</th>
                          <th>SCHEME APPLICATIONS</th>
                          <th>TIMELINE</th>
                          <th>ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {voters.map((voter, idx) => {
                          const apps = voter.applications || [];
                          const latestApp = apps[apps.length - 1];
                          return (
                            <tr key={voter.userId || idx}>
                              <td>
                                <div style={{ fontWeight: '700', color: '#fff' }}>{voter.voterName}</div>
                                <div style={{ fontSize: '11px', color: 'var(--mx-text-muted)' }}>Ref: {voter.epicNo}</div>
                              </td>
                              <td>
                                <div style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--mx-primary)' }}>{voter.epicNo}</div>
                                <div style={{ fontSize: '12px', color: 'var(--mx-text-muted)' }}>📞 {voter.mobile}</div>
                              </td>
                              <td>
                                <div style={{ fontWeight: '600' }}>{voter.district}</div>
                                <div style={{ fontSize: '11px', color: 'var(--mx-text-muted)' }}>{voter.assemblyName} — Booth {voter.boothNo}</div>
                              </td>
                              <td>
                                {apps.length === 0 ? (
                                  <span style={{ fontSize: '12px', color: 'var(--mx-text-muted)' }}>No applications</span>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {apps.map((app) => (
                                      <div key={app._id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#fff' }}>{app.schemeName}</span>
                                        <span className={`maxton-pill ${
                                          app.status === 'Approved' ? 'approved' :
                                          app.status === 'Rejected' ? 'rejected' :
                                          app.status === 'In Progress' || app.status === 'Called' ? 'in-progress' : 'pending'
                                        }`}>
                                          {app.status}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td>
                                <button
                                  onClick={() => setSelectedVoterTimeline(voter)}
                                  className="maxton-btn maxton-btn-secondary"
                                >
                                  <Eye size={14} /> Timeline
                                </button>
                              </td>
                              <td>
                                <button
                                  onClick={() => handleDirectCallVoter(voter)}
                                  className="maxton-btn maxton-btn-primary"
                                >
                                  <PhoneCall size={14} /> Direct Call
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--mx-text-muted)' }}>
                      Page {currentPage} of {totalPages} ({totalVoters} total members)
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {getPageRange().map((pg, i) => (
                        <button
                          key={i}
                          onClick={() => typeof pg === 'number' && onPageChange(pg)}
                          className={`maxton-btn ${currentPage === pg ? 'maxton-btn-primary' : 'maxton-btn-secondary'}`}
                          style={{ padding: '6px 12px', minWidth: '34px' }}
                        >
                          {pg}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════ */}
          {/* TAB 3: DISTRICT, ASSEMBLY & BOOTH LOGINS  */}
          {/* ══════════════════════════════════════════ */}
          {subPage === 'logins' && (
            <div className="maxton-card">
              <h3 className="maxton-card-title" style={{ marginBottom: '20px' }}>
                Jurisdiction Logins &amp; Passcodes Viewer
              </h3>

              {/* Subtabs: Districts / Assemblies / Booths */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                <button
                  onClick={() => setSelectedAssemblyNo('1')}
                  className="maxton-btn maxton-btn-primary"
                >
                  Booths Passcode Directory
                </button>
              </div>

              <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <select
                  value={selectedAssemblyNo}
                  onChange={(e) => {
                    setSelectedAssemblyNo(e.target.value);
                    if (fetchBoothCredentials) fetchBoothCredentials(e.target.value);
                  }}
                  style={{ background: 'var(--mx-bg-input)', color: '#fff', border: '1px solid var(--mx-border)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px' }}
                >
                  {assembliesList.map(a => (
                    <option key={a.assemblyNo} value={a.assemblyNo}>
                      Assembly {a.assemblyNo} — {a.assemblyName} ({a.district})
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  placeholder="Filter booth number or passcode..."
                  value={boothSearchQuery}
                  onChange={(e) => setBoothSearchQuery(e.target.value)}
                  style={{ background: 'var(--mx-bg-input)', color: '#fff', border: '1px solid var(--mx-border)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', width: '260px' }}
                />
              </div>

              <div className="maxton-table-container">
                <table className="maxton-table">
                  <thead>
                    <tr>
                      <th>BOOTH / PART NO</th>
                      <th>LOGIN USERNAME</th>
                      <th>ACCESS PASSCODE</th>
                      <th>JURISDICTION SCOPE</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBooths.map((b) => (
                      <tr key={b.username}>
                        <td style={{ fontWeight: '700', color: 'var(--mx-primary)' }}>Booth {b.boothNo}</td>
                        <td style={{ fontFamily: 'monospace', fontWeight: '700' }}>{b.username}</td>
                        <td style={{ fontFamily: 'monospace', color: '#10b981', fontWeight: '800', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 10px', borderRadius: '6px', display: 'inline-block' }}>
                          {b.passcode}
                        </td>
                        <td>{b.assemblyName} ({b.district})</td>
                        <td>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`Username: ${b.username}\nPasscode: ${b.passcode}`);
                              alert(`Copied credentials for Booth ${b.boothNo}!`);
                            }}
                            className="maxton-btn maxton-btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '11px' }}
                          >
                            Copy Logins
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════ */}
          {/* TAB 4: DISTRICT STATS                     */}
          {/* ══════════════════════════════════════════ */}
          {subPage === 'districts' && statsData && (
            <div className="maxton-card">
              <h3 className="maxton-card-title" style={{ marginBottom: '20px' }}>
                District-wise Governance Breakdown
              </h3>
              <div className="maxton-table-container">
                <table className="maxton-table">
                  <thead>
                    <tr>
                      <th>DISTRICT NAME</th>
                      <th>TOTAL APPLICATIONS</th>
                      <th>APPROVED DIRECTIVES</th>
                      <th>PENDING VERIFICATION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statsData.districtStats?.map((row) => (
                      <tr key={row._id}>
                        <td style={{ fontWeight: '700' }}>{row._id}</td>
                        <td style={{ fontWeight: '700', color: 'var(--mx-primary)' }}>{row.totalApps}</td>
                        <td style={{ color: '#10b981', fontWeight: '700' }}>{row.approved}</td>
                        <td style={{ color: '#f59e0b' }}>{row.pending}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════ */}
          {/* TAB 5: ASSEMBLY STATS                     */}
          {/* ══════════════════════════════════════════ */}
          {subPage === 'assemblies' && statsData && (
            <div className="maxton-card">
              <h3 className="maxton-card-title" style={{ marginBottom: '20px' }}>
                Assembly Constituency Breakdown
              </h3>
              <div className="maxton-table-container">
                <table className="maxton-table">
                  <thead>
                    <tr>
                      <th>ASSEMBLY NAME</th>
                      <th>DISTRICT</th>
                      <th>TOTAL APPLICATIONS</th>
                      <th>APPROVED</th>
                      <th>PENDING</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statsData.assemblyStats?.map((row, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: '700' }}>{row._id.assemblyName}</td>
                        <td style={{ color: 'var(--mx-text-muted)' }}>{row._id.district}</td>
                        <td style={{ fontWeight: '700', color: 'var(--mx-primary)' }}>{row.totalApps}</td>
                        <td style={{ color: '#10b981', fontWeight: '700' }}>{row.approved}</td>
                        <td style={{ color: '#f59e0b' }}>{row.pending}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════ */}
          {/* TAB 6: BOOTH STATS                        */}
          {/* ══════════════════════════════════════════ */}
          {subPage === 'booths' && statsData && (
            <div className="maxton-card">
              <h3 className="maxton-card-title" style={{ marginBottom: '20px' }}>
                Polling Booth Breakdown Stats
              </h3>
              <div className="maxton-table-container">
                <table className="maxton-table">
                  <thead>
                    <tr>
                      <th>BOOTH / PART NO</th>
                      <th>ASSEMBLY</th>
                      <th>DISTRICT</th>
                      <th>TOTAL APPLICATIONS</th>
                      <th>APPROVED</th>
                      <th>PENDING</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statsData.boothStats?.map((row, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: '700', color: 'var(--mx-primary)' }}>Booth {row._id.boothNo}</td>
                        <td>{row._id.assemblyName}</td>
                        <td style={{ color: 'var(--mx-text-muted)' }}>{row._id.district}</td>
                        <td style={{ fontWeight: '700' }}>{row.totalApps}</td>
                        <td style={{ color: '#10b981', fontWeight: '700' }}>{row.approved}</td>
                        <td style={{ color: '#f59e0b' }}>{row.pending}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default MaxtonDashboardLayout;
