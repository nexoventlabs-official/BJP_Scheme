import React, { useState, useEffect } from 'react';
import API from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from '../../components/StatusBadge';
import MemberProfileTimelineView, { formatSchemeName, formatAppliedDateTime } from '../../components/MemberProfileTimelineView';
import ReportsView from '../../components/ReportsView';
import { BJP_SCHEMES } from '../../utils/constants';
import {
  Shield, Users, Building, PhoneCall, RefreshCw, Search, Eye, Award, Share2, ChevronRight, FileText
} from 'lucide-react';
import TopReferrersCard from '../../components/TopReferrersCard';
import SchemePieChart from '../../components/SchemePieChart';
import AdminSidebar from '../../components/AdminSidebar';

const LIMIT = 20;

const BoothAdminDashboard = () => {
  const { admin, logoutAdmin } = useAuth();
  const [subPage, setSubPage] = useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);


  // ── Stats ──
  const [statsData, setStatsData] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // ── Paginated voters (applications) ──
  const [voters, setVoters] = useState([]);
  const [loadingVoters, setLoadingVoters] = useState(false);
  const [totalVoters, setTotalVoters] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);

  // ── Filters ──
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [schemeFilter, setSchemeFilter] = useState('');
  const [selectedVoterTimeline, setSelectedVoterTimeline] = useState(null);

  const navigateSubPage = (pageKey) => {
    setSubPage(pageKey);
    setSelectedVoterTimeline(null);
    try { window.history.pushState({}, '', `/admin/booth/${pageKey}`); } catch (e) {}
  };

  // ── Fetch stats (unfiltered for Booth Overview) ──
  const fetchStats = async () => {
    try {
      setLoadingStats(true);
      const res = await API.get('/admin/dashboard-stats');
      if (res.data.success) setStatsData(res.data);
    } catch (err) {
      console.error('Error loading stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  // ── Fetch paginated voters ──
  const fetchVoters = async (page = 1) => {
    try {
      setLoadingVoters(true);
      const params = new URLSearchParams({
        page, limit: LIMIT,
        ...(searchQuery  && { search: searchQuery }),
        ...(statusFilter && { status: statusFilter }),
        ...(schemeFilter && { schemeName: schemeFilter })
      });
      const res = await API.get(`/admin/applications?${params}`);
      if (res.data.success) {
        setVoters(res.data.voters || []);
        setTotalVoters(res.data.totalVoters || 0);
        setTotalPages(res.data.totalPages || 1);
        setCurrentPage(res.data.currentPage || 1);
      }
    } catch (err) {
      console.error('Error loading voters:', err);
    } finally {
      setLoadingVoters(false);
    }
  };

  const fetchDashboardData = () => { fetchStats(); fetchVoters(1); };

  useEffect(() => { fetchStats(); }, []);
  useEffect(() => { fetchVoters(1); setCurrentPage(1); }, [searchQuery, statusFilter, schemeFilter]);

  const handleUpdateAppStatus = async (appId, updatePayload) => {
    try {
      const res = await API.put(`/admin/applications/${appId}/status`, updatePayload);
      if (res.data.success) { fetchStats(); fetchVoters(currentPage); }
    } catch (err) { console.error('Error updating status:', err); }
  };

  const handleDirectCallVoter = async (voter) => {
    const latestApp = voter.applications[voter.applications.length - 1];
    window.location.href = `tel:${voter.mobile}`;
    if (latestApp) {
      await handleUpdateAppStatus(latestApp._id, {
        status: 'Called',
        notes: `Follow-up call to ${voter.voterName} (${voter.mobile})`,
        isCallAction: true
      });
    }
  };

  const handleOpenVoterDetails = (voter) => {
    setSubPage('applications');
    setSelectedVoterTimeline(voter);
  };

  // Page range for pagination pills
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

  return (
    <div className="admin-layout">
      <AdminSidebar
        activeTab={subPage}
        onSelectTab={navigateSubPage}
        admin={admin || { role: 'BOOTH_ADMIN', username: 'Booth Admin' }}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onLogout={logoutAdmin}
      />

      <div className="admin-main">
        {/* Sticky Topbar */}
        <header className="admin-topbar">
          <div className="admin-topbar-brand">
            {admin?.assemblyName} — Booth {admin?.boothNo} Admin Dashboard
          </div>

          <div className="admin-topbar-right">
            <span className="tag-pill tag-active" style={{ fontSize: '13px', background: 'var(--color-canvas)', color: 'var(--color-primary-ink)' }}>
              <Shield size={12} style={{ marginRight: '4px' }} /> Booth {admin?.boothNo}
            </span>

            <button onClick={fetchDashboardData} className="btn-action btn-view" style={{ padding: '8px 16px', fontSize: '13px' }}>
              <RefreshCw size={14} /> Refresh Data
            </button>
          </div>
        </header>

        {/* Content Area */}
        <main className="admin-content">


      {/* ══════════════════════════════════════════ */}
      {/* PAGE 1: OVERVIEW DASHBOARD                */}
      {/* ══════════════════════════════════════════ */}
      {subPage === 'dashboard' && (
        loadingStats ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', gap: '16px' }}>
            <div style={{ width: '40px', height: '40px', border: '4px solid var(--color-linen)', borderTopColor: 'var(--color-saffron)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <div style={{ fontSize: '14px', color: 'var(--color-slate)', fontWeight: '500' }}>Loading stats for Booth {admin.boothNo}...</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : statsData ? (
          <div style={{ width: '100%', boxSizing: 'border-box' }}>

            {/* ── 4 Stat Cards ── */}
            <div className="stat-cards-grid">


              {/* Card 1: Total Voters in Electoral Roll (Read DB) */}
              <div className="stat-card">
                <div className="stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
                  <Users size={20} />
                </div>
                <div style={{ width: '100%' }}>
                  <div className="stat-number" style={{ color: '#2563eb' }}>
                    {statsData.overview.totalVotersInRoll != null
                      ? statsData.overview.totalVotersInRoll.toLocaleString()
                      : '—'}
                  </div>
                  <div className="stat-label">Total Voters in Booth {admin.boothNo}</div>
                  <div className="stat-sub">Electoral Roll (Voter DB)</div>
                </div>
              </div>

              {/* Card 2: Voters Requested Schemes (Write DB) */}
              <div className="stat-card">
                <div className="stat-icon">
                  <Users size={20} />
                </div>
                <div style={{ width: '100%' }}>
                  <div className="stat-number">{statsData.overview.totalVotersRequested ?? statsData.overview.totalUsers ?? 0}</div>
                  <div className="stat-label">Voters Requested Schemes</div>
                  <div className="stat-sub">Enrolled in Program</div>
                </div>
              </div>

              {/* Card 3: Total Applications */}
              <div
                className="stat-card"
                onClick={() => { setStatusFilter(''); setSchemeFilter(''); navigateSubPage('applications'); }}
                style={{ cursor: 'pointer' }}
                title="Click to view all applications"
              >
                <div className="stat-icon" style={{ background: 'var(--color-fog-gray)', color: 'var(--color-midnight-ink)' }}>
                  <FileText size={20} />
                </div>
                <div style={{ width: '100%' }}>
                  <div className="stat-number">{statsData.overview.totalApplications}</div>
                  <div className="stat-label">Booth {admin.boothNo} Applications</div>
                  <div className="stat-sub" style={{ color: 'var(--color-electric-blue)', fontWeight: '500' }}>Click to View Applications →</div>
                </div>
              </div>

              {/* Card 4: Approved */}
              <div
                className="stat-card"
                onClick={() => { setStatusFilter('Approved'); setSchemeFilter(''); navigateSubPage('applications'); }}
                style={{ cursor: 'pointer' }}
                title="Click to view approved applications"
              >
                <div className="stat-icon" style={{ background: '#f0fdf4', color: 'var(--color-forest-pulse)' }}>
                  <Shield size={20} />
                </div>
                <div style={{ width: '100%' }}>
                  <div className="stat-number" style={{ color: 'var(--color-forest-pulse)' }}>
                    {statsData.overview.statusBreakdown?.Approved || 0}
                  </div>
                  <div className="stat-label">Approved Directives</div>
                  <div className="stat-sub" style={{ color: 'var(--color-forest-pulse)', fontWeight: '500' }}>Click to View Approved →</div>
                </div>
              </div>
            </div>


            {/* ── Visual Scheme Distribution Pie Chart ── */}
            <SchemePieChart
              schemePopularity={statsData?.schemePopularity || []}
              scopeLabel={`Booth ${admin?.boothNo || ''}`}
            />

            {/* ── Top 5 Referral Champions Section ── */}
            <TopReferrersCard
              topReferrers={statsData.topReferrers || []}
              scopeLabel={`Booth ${admin.boothNo}`}
              onViewProfile={(ref) => handleOpenVoterDetails(ref)}
            />


            {/* ── Top Schemes ── */}
            <div className="campsite-card" style={{ width: '100%', padding: '24px', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--color-midnight-ink)', margin: 0 }}>
                  Top Applied BJP Schemes in Booth {admin.boothNo}
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--color-slate)' }}>Click any scheme to filter applications</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', width: '100%' }}>
                {statsData.schemePopularity?.map((item) => (
                  <div
                    key={item._id}
                    onClick={() => {
                      setSchemeFilter(item._id);
                      setStatusFilter('');
                      navigateSubPage('applications');
                    }}
                    style={{
                      padding: '14px', background: '#fff', borderRadius: '10px',
                      border: '1px solid var(--color-linen)', cursor: 'pointer',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.03)', transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--color-saffron)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 153, 51, 0.18)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--color-linen)';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.03)';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-midnight-ink)' }}>{formatSchemeName(item._id)}</div>
                      <span style={{ fontSize: '11px', color: 'var(--color-saffron)', fontWeight: '600' }}>View →</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-slate)', marginTop: '2px' }}>{item.cluster}</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-midnight-ink)', marginTop: '8px' }}>
                      {item.count} <span style={{ fontSize: '12px', color: 'var(--color-slate)', fontWeight: 'normal' }}>applications</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', gap: '12px' }}>
            <div style={{ fontSize: '32px' }}>⚠️</div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--color-midnight-ink)' }}>Could not load stats</div>
            <button onClick={fetchStats} className="btn btn-primary" style={{ marginTop: '8px' }}>Retry</button>
          </div>
        )
      )}

      {/* ══════════════════════════════════════════ */}
      {/* PAGE 2: APPLICATIONS LIST (Paginated)     */}
      {/* ══════════════════════════════════════════ */}
      {subPage === 'applications' && (
        selectedVoterTimeline ? (
          <MemberProfileTimelineView
            voterData={selectedVoterTimeline}
            onBack={() => setSelectedVoterTimeline(null)}
            onUpdateAppStatus={handleUpdateAppStatus}
            onSelectVoter={(voter) => setSelectedVoterTimeline(voter)}
            targetSchemeName={schemeFilter}
          />
        ) : (
          <div className="campsite-card" style={{ width: '100%', padding: '24px', boxSizing: 'border-box' }}>

            {/* ── Filter Row 1: Search + Summary ── */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '10px', width: '100%', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-ash-gray)' }} />
                <input
                  type="text"
                  placeholder={`Search in Booth ${admin.boothNo} voters...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-control"
                  style={{ paddingLeft: '38px' }}
                />
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-slate)', whiteSpace: 'nowrap' }}>
                {loadingVoters
                  ? <span style={{ opacity: 0.6 }}>Loading…</span>
                  : <><strong style={{ color: 'var(--color-midnight-ink)' }}>{totalVoters.toLocaleString()}</strong> voters · Page {currentPage} of {totalPages}</>
                }
              </div>
            </div>

            {/* ── Filter Row 2: Status + Scheme + Clear ── */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', width: '100%', alignItems: 'center' }}>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="admin-filter-select" style={{ flex: '1 1 150px', minWidth: '150px' }}>
                <option value="">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Submitted">Submitted</option>
                <option value="Processing">Processing</option>
                <option value="Called">Called</option>
                <option value="Verified">Verified</option>
                <option value="Approved">Approved</option>
                <option value="Completed">Completed</option>
                <option value="Rejected">Rejected</option>
              </select>

              {/* Scheme Filter */}
              <select
                value={BJP_SCHEMES.find(s => s.name.toLowerCase() === (schemeFilter || '').toLowerCase() || (s.fullTitle && s.fullTitle.toLowerCase() === (schemeFilter || '').toLowerCase()))?.name || schemeFilter || ''}
                onChange={(e) => setSchemeFilter(e.target.value)}
                className="admin-filter-select"
                style={{ flex: '1 1 220px', minWidth: '220px' }}
              >
                <option value="">All 23 Central BJP Schemes</option>
                {BJP_SCHEMES.map(s => (
                  <option key={s.id} value={s.name}>
                    {s.name} ({s.fullTitle || s.fullName})
                  </option>
                ))}
              </select>


              {(statusFilter || schemeFilter || searchQuery) && (
                <button
                  onClick={() => { setSearchQuery(''); setStatusFilter(''); setSchemeFilter(''); }}
                  style={{ background: 'none', border: '1px solid var(--color-linen)', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', color: 'var(--color-slate)', cursor: 'pointer' }}
                >
                  Clear All
                </button>
              )}
            </div>

            {/* ── Table ── */}
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-linen)', color: 'var(--color-slate)', textAlign: 'left', background: 'var(--color-fog-gray)' }}>
                    <th style={{ padding: '12px 10px' }}>#</th>
                    <th style={{ padding: '12px 10px' }}>Member &amp; EPIC</th>
                    <th style={{ padding: '12px 10px' }}>Mobile</th>
                    <th style={{ padding: '12px 10px' }}>Schemes Applied</th>
                    <th style={{ padding: '12px 10px' }}>Applied Date &amp; Time</th>
                    <th style={{ padding: '12px 10px' }}>Latest Status</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingVoters ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--color-linen)' }}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} style={{ padding: '14px 10px' }}>
                            <div style={{ height: '14px', borderRadius: '6px', background: 'var(--color-linen)', animation: 'pulse 1.4s ease-in-out infinite', width: j === 0 ? '24px' : j === 1 ? '80%' : '60%' }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : voters.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--color-slate)' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
                        No applications found for Booth {admin.boothNo}.
                      </td>
                    </tr>
                  ) : (
                    voters.map((voter, idx) => {
                      const latestApp = voter.applications[voter.applications.length - 1];
                      const rowNum = (currentPage - 1) * LIMIT + idx + 1;
                      return (
                        <tr key={voter.epicNo || idx}
                          style={{ borderBottom: '1px solid var(--color-linen)', transition: 'background 0.15s', cursor: 'pointer' }}
                          onClick={() => setSelectedVoterTimeline(voter)}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-fog-gray)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          title="Click anywhere on row to view details"
                        >
                          <td style={{ padding: '12px 10px', color: 'var(--color-ash-gray)', fontSize: '12px', fontWeight: '600' }}>{rowNum}</td>
                          <td style={{ padding: '12px 10px' }}>
                            <div style={{ fontWeight: '700', color: 'var(--color-midnight-ink)' }}>{voter.voterName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--color-slate)', fontFamily: 'monospace' }}>{voter.epicNo}</div>
                          </td>
                          <td style={{ padding: '12px 10px', fontWeight: '600' }}>{voter.mobile}</td>
                          <td style={{ padding: '12px 10px' }}>
                            <span className="tag-pill tag-sunlit" style={{ fontWeight: '700', fontSize: '11px', padding: '4px 10px' }}>
                              <Award size={12} /> {voter.applications.length} Scheme{voter.applications.length > 1 ? 's' : ''}
                            </span>
                          </td>
                          <td style={{ padding: '12px 10px', fontSize: '12px', color: 'var(--color-midnight-ink)', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: '600' }}>
                              {formatAppliedDateTime(latestApp?.appliedAt || latestApp?.createdAt || voter.createdAt)}
                            </div>
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            <StatusBadge status={latestApp?.status || 'Pending'} />
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDirectCallVoter(voter); }}
                                className="btn btn-ghost"
                                style={{ padding: '5px 10px', fontSize: '12px' }}
                              >
                                <PhoneCall size={13} /> Call
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* ── Pagination Controls ── */}
            {!loadingVoters && totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '24px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => { const p = currentPage - 1; setCurrentPage(p); fetchVoters(p); }}
                  disabled={currentPage === 1}
                  className="btn btn-ghost"
                  style={{ padding: '6px 14px', fontSize: '13px', opacity: currentPage === 1 ? 0.4 : 1 }}
                >← Prev</button>

                {getPageRange().map((item, i) =>
                  item === '...' ? (
                    <span key={`e-${i}`} style={{ padding: '6px 4px', color: 'var(--color-ash-gray)', fontSize: '13px' }}>…</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => { setCurrentPage(item); fetchVoters(item); }}
                      className="btn"
                      style={{
                        padding: '6px 12px', fontSize: '13px',
                        fontWeight: item === currentPage ? '700' : '500',
                        background: item === currentPage ? 'var(--color-saffron)' : 'transparent',
                        color: item === currentPage ? 'var(--color-midnight-ink)' : 'var(--color-slate)',
                        border: item === currentPage ? '1.5px solid var(--color-saffron)' : '1.5px solid var(--color-linen)',
                        borderRadius: '8px', minWidth: '36px'
                      }}
                    >{item}</button>
                  )
                )}

                <button
                  onClick={() => { const p = currentPage + 1; setCurrentPage(p); fetchVoters(p); }}
                  disabled={currentPage === totalPages}
                  className="btn btn-ghost"
                  style={{ padding: '6px 14px', fontSize: '13px', opacity: currentPage === totalPages ? 0.4 : 1 }}
                >Next →</button>

                <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
              </div>
            )}
          </div>
        )
      )}

      {/* PAGE: REPORTS & EXCEL EXPORT */}
      {subPage === 'reports' && (
        <ReportsView
          initialDistrict={admin?.district}
          initialAssembly={admin?.assemblyName}
          initialBooth={String(admin?.boothNo || '')}
          initialStatus={statusFilter}
          initialScheme={schemeFilter}
        />
      )}
        </main>
      </div>
    </div>

  );
};

export default BoothAdminDashboard;
