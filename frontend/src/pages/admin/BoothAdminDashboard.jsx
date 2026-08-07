import React, { useState, useEffect } from 'react';
import API from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from '../../components/StatusBadge';
import MemberProfileTimelineView, { formatSchemeName, formatAppliedDateTime, getSchemeBgImage } from '../../components/MemberProfileTimelineView';
import ReportsView from '../../components/ReportsView';
import { useBjpSchemes, buildSchemeCards } from '../../utils/schemesData';
import {
  Shield, Users, Building, PhoneCall, RefreshCw, Search, Eye, Award, Share2, ChevronRight, FileText
} from 'lucide-react';
import TopReferrersCard from '../../components/TopReferrersCard';
import SchemePieChart from '../../components/SchemePieChart';
import AdminSidebar from '../../components/AdminSidebar';

const LIMIT = 20;

const BoothAdminDashboard = () => {
  const { admin, logoutAdmin } = useAuth();
  const BJP_SCHEMES = useBjpSchemes();
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

  // ── My Voter Stats Page State ──
  const [boothVoters, setBoothVoters] = useState([]);
  const [loadingBoothVoters, setLoadingBoothVoters] = useState(false);
  const [boothVotersTotalCount, setBoothVotersTotalCount] = useState(0);
  const [boothVotersTotalPages, setBoothVotersTotalPages] = useState(1);
  const [boothVotersPage, setBoothVotersPage] = useState(1);
  const [boothVotersSearch, setBoothVotersSearch] = useState('');
  const [boothVoterCategoryFilter, setBoothVoterCategoryFilter] = useState('');
  const [boothVoterStatsSummary, setBoothVoterStatsSummary] = useState({
    totalVoters: 0,
    completedCount: 0,
    inProgressCount: 0,
    rejectedCount: 0,
    notAppliedCount: 0
  });

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

  // ── Fetch Booth Voter Roll (Color-Coded & Filtered) ──
  const fetchBoothVoterRoll = async (page = 1) => {
    try {
      setLoadingBoothVoters(true);
      const params = new URLSearchParams({
        page,
        limit: LIMIT,
        ...(boothVotersSearch && { search: boothVotersSearch }),
        ...(boothVoterCategoryFilter && { statusCategory: boothVoterCategoryFilter })
      });
      const res = await API.get(`/admin/booth-voter-roll?${params}`);
      if (res.data.success) {
        setBoothVoters(res.data.voters || []);
        setBoothVotersTotalCount(res.data.totalVoters || 0);
        setBoothVotersTotalPages(res.data.totalPages || 1);
        setBoothVotersPage(res.data.page || 1);
        if (res.data.summaryStats) {
          setBoothVoterStatsSummary(res.data.summaryStats);
        }
      }
    } catch (err) {
      console.error('Error fetching booth voter roll:', err);
    } finally {
      setLoadingBoothVoters(false);
    }
  };

  const fetchDashboardData = () => { fetchStats(); fetchVoters(1); };

  useEffect(() => { fetchStats(); }, []);
  useEffect(() => { fetchVoters(1); setCurrentPage(1); }, [searchQuery, statusFilter, schemeFilter]);
  useEffect(() => {
    if (subPage === 'voter_stats') {
      fetchBoothVoterRoll(1);
    }
  }, [subPage, boothVotersSearch, boothVoterCategoryFilter]);

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
                {buildSchemeCards(BJP_SCHEMES, statsData.schemePopularity).map((item) => {
                  const bgImg = getSchemeBgImage(item._id);
                  return (
                    <div
                      key={item._id}
                      onClick={() => {
                        setSchemeFilter(item._id);
                        setStatusFilter('');
                        navigateSubPage('applications');
                      }}
                      style={{
                        padding: '14px 16px',
                        borderRadius: '16px',
                        border: '1px solid #e5e5ea',
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                        transition: 'all 0.22s ease',
                        overflow: 'hidden',
                        position: 'relative',
                        minHeight: '135px',
                        height: '135px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxSizing: 'border-box',
                        width: '100%',
                        background: bgImg
                          ? `url("${encodeURI(bgImg)}") center / 100% 100% no-repeat`
                          : '#ffffff'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = 'var(--color-saffron)';
                        e.currentTarget.style.transform = 'translateY(-3px)';
                        e.currentTarget.style.boxShadow = '0 8px 20px rgba(255, 153, 51, 0.25)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = '#e5e5ea';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                      }}
                    >
                      <div style={{ zIndex: 2, position: 'relative', maxWidth: '65%' }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: '#1d1d1f', lineHeight: '1.25' }}>
                          {formatSchemeName(item._id)}
                        </div>
                        <div style={{ fontSize: '11px', color: '#555', marginTop: '2px', fontWeight: '500' }}>
                          {item.cluster || 'Central Welfare Scheme'}
                        </div>
                      </div>
                      <div style={{ zIndex: 2, position: 'relative' }}>
                        <div style={{ fontSize: '22px', fontWeight: '800', color: '#1d1d1f' }}>
                          {item.count}{' '}
                          <span style={{ fontSize: '12px', color: '#555', fontWeight: '500' }}>
                            applications
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-saffron)', fontWeight: '700', marginTop: '2px' }}>
                          View Applications →
                        </div>
                      </div>
                    </div>
                  );
                })}
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
                <option value="">All {BJP_SCHEMES.length} Central BJP Schemes</option>
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

      {/* ══════════════════════════════════════════ */}
      {/* PAGE 3: MY VOTER STATS (Color-Coded Roll)  */}
      {/* ══════════════════════════════════════════ */}
      {subPage === 'voter_stats' && (
        selectedVoterTimeline ? (
          <MemberProfileTimelineView
            voterData={selectedVoterTimeline}
            onBack={() => setSelectedVoterTimeline(null)}
            onUpdateAppStatus={handleUpdateAppStatus}
            onSelectVoter={(voter) => setSelectedVoterTimeline(voter)}
          />
        ) : (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* ── Summary Cards Header (Click to Filter) ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', width: '100%' }}>
              
              {/* Total Booth Voters */}
              <div
                onClick={() => setBoothVoterCategoryFilter('')}
                style={{
                  padding: '16px 20px', borderRadius: '16px', background: '#ffffff',
                  border: !boothVoterCategoryFilter ? '2px solid var(--color-saffron)' : '1px solid #e5e5ea',
                  boxShadow: !boothVoterCategoryFilter ? '0 4px 12px rgba(255, 153, 51, 0.2)' : '0 2px 8px rgba(0,0,0,0.04)',
                  cursor: 'pointer', transition: 'all 0.2s ease'
                }}
                title="Click to view all voters"
              >
                <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Booth Voters</div>
                <div style={{ fontSize: '26px', fontWeight: '800', color: '#0f172a', marginTop: '4px' }}>
                  {boothVoterStatsSummary.totalVoters.toLocaleString()}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-saffron)', fontWeight: '600', marginTop: '2px' }}>
                  {!boothVoterCategoryFilter ? '✓ Viewing All' : 'Click to View All →'}
                </div>
              </div>

              {/* Completed / Approved (Light Green) */}
              <div
                onClick={() => setBoothVoterCategoryFilter(boothVoterCategoryFilter === 'completed' ? '' : 'completed')}
                style={{
                  padding: '16px 20px', borderRadius: '16px', background: '#f0fdf4',
                  border: boothVoterCategoryFilter === 'completed' ? '2px solid #10b981' : '1px solid #bbf7d0',
                  boxShadow: boothVoterCategoryFilter === 'completed' ? '0 4px 12px rgba(16, 185, 129, 0.25)' : '0 2px 8px rgba(16, 185, 129, 0.08)',
                  cursor: 'pointer', transition: 'all 0.2s ease'
                }}
                title="Click to filter Completed / Approved voters"
              >
                <div style={{ fontSize: '12px', color: '#166534', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>🟢 Completed / Approved</div>
                <div style={{ fontSize: '26px', fontWeight: '800', color: '#15803d', marginTop: '4px' }}>
                  {boothVoterStatsSummary.completedCount.toLocaleString()}
                </div>
                <div style={{ fontSize: '11px', color: '#15803d', fontWeight: '600', marginTop: '2px' }}>
                  {boothVoterCategoryFilter === 'completed' ? '✓ Filter Active' : 'Click to Filter →'}
                </div>
              </div>

              {/* Applied / In Progress (Light Blue) */}
              <div
                onClick={() => setBoothVoterCategoryFilter(boothVoterCategoryFilter === 'in_progress' ? '' : 'in_progress')}
                style={{
                  padding: '16px 20px', borderRadius: '16px', background: '#eff6ff',
                  border: boothVoterCategoryFilter === 'in_progress' ? '2px solid #3b82f6' : '1px solid #bfdbfe',
                  boxShadow: boothVoterCategoryFilter === 'in_progress' ? '0 4px 12px rgba(59, 130, 246, 0.25)' : '0 2px 8px rgba(59, 130, 246, 0.08)',
                  cursor: 'pointer', transition: 'all 0.2s ease'
                }}
                title="Click to filter Applied (In Progress) voters"
              >
                <div style={{ fontSize: '12px', color: '#1e40af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>🔵 Applied (In Progress)</div>
                <div style={{ fontSize: '26px', fontWeight: '800', color: '#1d4ed8', marginTop: '4px' }}>
                  {boothVoterStatsSummary.inProgressCount.toLocaleString()}
                </div>
                <div style={{ fontSize: '11px', color: '#1d4ed8', fontWeight: '600', marginTop: '2px' }}>
                  {boothVoterCategoryFilter === 'in_progress' ? '✓ Filter Active' : 'Click to Filter →'}
                </div>
              </div>

              {/* Rejected (Light Red) */}
              <div
                onClick={() => setBoothVoterCategoryFilter(boothVoterCategoryFilter === 'rejected' ? '' : 'rejected')}
                style={{
                  padding: '16px 20px', borderRadius: '16px', background: '#fef2f2',
                  border: boothVoterCategoryFilter === 'rejected' ? '2px solid #ef4444' : '1px solid #fecaca',
                  boxShadow: boothVoterCategoryFilter === 'rejected' ? '0 4px 12px rgba(239, 68, 68, 0.25)' : '0 2px 8px rgba(239, 68, 68, 0.08)',
                  cursor: 'pointer', transition: 'all 0.2s ease'
                }}
                title="Click to filter Rejected voters"
              >
                <div style={{ fontSize: '12px', color: '#991b1b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>🔴 Rejected</div>
                <div style={{ fontSize: '26px', fontWeight: '800', color: '#b91c1c', marginTop: '4px' }}>
                  {boothVoterStatsSummary.rejectedCount.toLocaleString()}
                </div>
                <div style={{ fontSize: '11px', color: '#b91c1c', fontWeight: '600', marginTop: '2px' }}>
                  {boothVoterCategoryFilter === 'rejected' ? '✓ Filter Active' : 'Click to Filter →'}
                </div>
              </div>

              {/* Not Applied (Light Gray) */}
              <div
                onClick={() => setBoothVoterCategoryFilter(boothVoterCategoryFilter === 'not_applied' ? '' : 'not_applied')}
                style={{
                  padding: '16px 20px', borderRadius: '16px', background: '#f8fafc',
                  border: boothVoterCategoryFilter === 'not_applied' ? '2px solid #64748b' : '1px solid #e2e8f0',
                  boxShadow: boothVoterCategoryFilter === 'not_applied' ? '0 4px 12px rgba(100, 116, 139, 0.25)' : '0 2px 8px rgba(0,0,0,0.02)',
                  cursor: 'pointer', transition: 'all 0.2s ease'
                }}
                title="Click to filter Not Applied voters"
              >
                <div style={{ fontSize: '12px', color: '#475569', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>⚪ Not Applied</div>
                <div style={{ fontSize: '26px', fontWeight: '800', color: '#334155', marginTop: '4px' }}>
                  {boothVoterStatsSummary.notAppliedCount.toLocaleString()}
                </div>
                <div style={{ fontSize: '11px', color: '#334155', fontWeight: '600', marginTop: '2px' }}>
                  {boothVoterCategoryFilter === 'not_applied' ? '✓ Filter Active' : 'Click to Filter →'}
                </div>
              </div>

            </div>

            {/* ── Table Card ── */}
            <div className="campsite-card" style={{ width: '100%', padding: '24px', boxSizing: 'border-box' }}>
              
              {/* Search & Filter Pills Row */}
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '18px', width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: '1 1 280px', position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-ash-gray)' }} />
                  <input
                    type="text"
                    placeholder={`Search Booth ${admin.boothNo} voters by name, EPIC, or mobile...`}
                    value={boothVotersSearch}
                    onChange={(e) => setBoothVotersSearch(e.target.value)}
                    className="form-control"
                    style={{ paddingLeft: '38px' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', fontSize: '12px', fontWeight: '600' }}>
                  <button
                    type="button"
                    onClick={() => setBoothVoterCategoryFilter(boothVoterCategoryFilter === 'completed' ? '' : 'completed')}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 14px', borderRadius: '20px',
                      background: boothVoterCategoryFilter === 'completed' ? '#10b981' : '#f0fdf4',
                      color: boothVoterCategoryFilter === 'completed' ? '#ffffff' : '#166534',
                      border: '1.5px solid #10b981', cursor: 'pointer', transition: 'all 0.15s ease', fontWeight: '700'
                    }}
                  >
                    🟢 Completed ({boothVoterStatsSummary.completedCount})
                  </button>

                  <button
                    type="button"
                    onClick={() => setBoothVoterCategoryFilter(boothVoterCategoryFilter === 'in_progress' ? '' : 'in_progress')}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 14px', borderRadius: '20px',
                      background: boothVoterCategoryFilter === 'in_progress' ? '#3b82f6' : '#eff6ff',
                      color: boothVoterCategoryFilter === 'in_progress' ? '#ffffff' : '#1e40af',
                      border: '1.5px solid #3b82f6', cursor: 'pointer', transition: 'all 0.15s ease', fontWeight: '700'
                    }}
                  >
                    🔵 Applied ({boothVoterStatsSummary.inProgressCount})
                  </button>

                  <button
                    type="button"
                    onClick={() => setBoothVoterCategoryFilter(boothVoterCategoryFilter === 'rejected' ? '' : 'rejected')}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 14px', borderRadius: '20px',
                      background: boothVoterCategoryFilter === 'rejected' ? '#ef4444' : '#fef2f2',
                      color: boothVoterCategoryFilter === 'rejected' ? '#ffffff' : '#991b1b',
                      border: '1.5px solid #ef4444', cursor: 'pointer', transition: 'all 0.15s ease', fontWeight: '700'
                    }}
                  >
                    🔴 Rejected ({boothVoterStatsSummary.rejectedCount})
                  </button>

                  <button
                    type="button"
                    onClick={() => setBoothVoterCategoryFilter(boothVoterCategoryFilter === 'not_applied' ? '' : 'not_applied')}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 14px', borderRadius: '20px',
                      background: boothVoterCategoryFilter === 'not_applied' ? '#64748b' : '#f8fafc',
                      color: boothVoterCategoryFilter === 'not_applied' ? '#ffffff' : '#475569',
                      border: '1.5px solid #64748b', cursor: 'pointer', transition: 'all 0.15s ease', fontWeight: '700'
                    }}
                  >
                    ⚪ Not Applied ({boothVoterStatsSummary.notAppliedCount})
                  </button>
                </div>
              </div>

              {/* Voter Table */}
              <div style={{ width: '100%', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ color: 'var(--color-slate)', textAlign: 'left', background: 'var(--color-fog-gray)' }}>
                      <th style={{ padding: '12px 12px', borderRadius: '8px 0 0 8px' }}>SL#</th>
                      <th style={{ padding: '12px 12px' }}>Voter Name &amp; EPIC</th>
                      <th style={{ padding: '12px 12px' }}>Booth / House No.</th>
                      <th style={{ padding: '12px 12px' }}>Age / Gender</th>
                      <th style={{ padding: '12px 12px' }}>Mobile</th>
                      <th style={{ padding: '12px 12px' }}>Status</th>
                      <th style={{ padding: '12px 12px' }}>Schemes</th>
                      <th style={{ padding: '12px 12px', textAlign: 'right', borderRadius: '0 8px 8px 0' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingBoothVoters ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 8 }).map((_, j) => (
                            <td key={j} style={{ padding: '14px 12px', background: '#fff' }}>
                              <div style={{ height: '14px', borderRadius: '6px', background: 'var(--color-linen)', animation: 'pulse 1.4s ease-in-out infinite', width: '70%' }} />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : boothVoters.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--color-slate)', background: '#fff', borderRadius: '12px' }}>
                          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
                          No voters found in Booth {admin.boothNo} matching your search.
                        </td>
                      </tr>
                    ) : (
                      boothVoters.map((voter) => {
                        let rowBg = '#f8fafc';
                        let leftBorder = '4px solid #94a3b8';
                        let statusBadge = <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', background: '#e2e8f0', color: '#475569' }}>⚪ Not Applied</span>;

                        if (voter.statusCategory === 'completed') {
                          rowBg = '#f0fdf4';
                          leftBorder = '4px solid #10b981';
                          statusBadge = <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', background: '#dcfce7', color: '#15803d' }}>🟢 {voter.latestStatus}</span>;
                        } else if (voter.statusCategory === 'in_progress') {
                          rowBg = '#eff6ff';
                          leftBorder = '4px solid #3b82f6';
                          statusBadge = <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', background: '#dbeafe', color: '#1d4ed8' }}>🔵 {voter.latestStatus}</span>;
                        } else if (voter.statusCategory === 'rejected') {
                          rowBg = '#fef2f2';
                          leftBorder = '4px solid #ef4444';
                          statusBadge = <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', background: '#fee2e2', color: '#b91c1c' }}>🔴 Rejected</span>;
                        }

                        return (
                          <tr
                            key={voter.epicNo}
                            style={{
                              background: rowBg,
                              borderLeft: leftBorder,
                              borderRadius: '8px',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                              cursor: voter.applicationsCount > 0 ? 'pointer' : 'default',
                              transition: 'transform 0.15s ease'
                            }}
                            onClick={() => {
                              if (voter.applicationsCount > 0) {
                                setSelectedVoterTimeline({
                                  voterName: voter.voterName,
                                  epicNo: voter.epicNo,
                                  mobile: voter.mobile,
                                  applications: voter.applications
                                });
                              }
                            }}
                          >
                            <td style={{ padding: '12px 12px', fontWeight: '700', color: '#64748b' }}>{voter.slNo}</td>
                            <td style={{ padding: '12px 12px' }}>
                              <div style={{ fontWeight: '700', color: '#0f172a' }}>{voter.voterName}</div>
                              <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>{voter.epicNo}</div>
                            </td>
                            <td style={{ padding: '12px 12px', color: '#475569', fontWeight: '600' }}>{voter.houseNo || '—'}</td>
                            <td style={{ padding: '12px 12px', color: '#475569' }}>{voter.age > 0 ? `${voter.age} yrs / ${voter.gender}` : voter.gender}</td>
                            <td style={{ padding: '12px 12px', fontWeight: '600', color: '#0f172a' }}>{voter.mobile}</td>
                            <td style={{ padding: '12px 12px' }}>{statusBadge}</td>
                            <td style={{ padding: '12px 12px' }}>
                              {voter.applicationsCount > 0 ? (
                                <span style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>
                                  {voter.applicationsCount} Scheme{voter.applicationsCount > 1 ? 's' : ''}
                                </span>
                              ) : (
                                <span style={{ fontSize: '12px', color: '#94a3b8' }}>0 Schemes</span>
                              )}
                            </td>
                            <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                              {voter.mobile && voter.mobile !== '—' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); window.location.href = `tel:${voter.mobile}`; }}
                                  className="btn btn-ghost"
                                  style={{ padding: '5px 10px', fontSize: '12px' }}
                                >
                                  <PhoneCall size={13} /> Call
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {!loadingBoothVoters && boothVotersTotalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '24px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => fetchBoothVoterRoll(boothVotersPage - 1)}
                    disabled={boothVotersPage === 1}
                    className="btn btn-ghost"
                    style={{ padding: '6px 14px', fontSize: '13px', opacity: boothVotersPage === 1 ? 0.4 : 1 }}
                  >← Prev</button>

                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', padding: '0 8px' }}>
                    Page {boothVotersPage} of {boothVotersTotalPages}
                  </span>

                  <button
                    onClick={() => fetchBoothVoterRoll(boothVotersPage + 1)}
                    disabled={boothVotersPage === boothVotersTotalPages}
                    className="btn btn-ghost"
                    style={{ padding: '6px 14px', fontSize: '13px', opacity: boothVotersPage === boothVotersTotalPages ? 0.4 : 1 }}
                  >Next →</button>
                </div>
              )}

            </div>

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
