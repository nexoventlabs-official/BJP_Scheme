import React, { useState, useEffect } from 'react';
import API from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from '../../components/StatusBadge';
import MemberProfileTimelineView from '../../components/MemberProfileTimelineView';
import ReportsView from '../../components/ReportsView';
import {
  Shield, Users, Building, PhoneCall, RefreshCw, PlusCircle, Search, LogIn, Eye, Award, Share2, ChevronRight, FileText
} from 'lucide-react';

const LIMIT = 20;

const SuperAdminDashboard = () => {
  const { loginAdmin } = useAuth();
  const [subPage, setSubPage] = useState('dashboard');

  // ── Stats ──
  const [statsData, setStatsData] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // ── Credentials State ──
  const [adminList, setAdminList] = useState([]);
  const [credSubTab, setCredSubTab] = useState('districts');
  const [districtCredentials, setDistrictCredentials] = useState([]);
  const [assemblyCredentials, setAssemblyCredentials] = useState([]);

  // ── Booth Credentials ──
  const [assembliesList, setAssembliesList] = useState([]);
  const [selectedAssemblyNo, setSelectedAssemblyNo] = useState('1');
  const [boothCredentialsData, setBoothCredentialsData] = useState(null);
  const [boothSearchQuery, setBoothSearchQuery] = useState('');
  const [loadingBooths, setLoadingBooths] = useState(false);

  // ── Paginated Voters (Applications) ──
  const [voters, setVoters] = useState([]);
  const [loadingVoters, setLoadingVoters] = useState(false);
  const [totalVoters, setTotalVoters] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);

  // ── Filters ──
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');
  const [assemblyFilter, setAssemblyFilter] = useState('');
  const [boothFilter, setBoothFilter] = useState('');

  // ── Metadata Dropdown Lists ──
  const [districts, setDistricts] = useState([]);
  const [assemblies, setAssemblies] = useState([]);
  const [booths, setBooths] = useState([]);
  const [loadingFilterAssemblies, setLoadingFilterAssemblies] = useState(false);
  const [loadingFilterBooths, setLoadingFilterBooths] = useState(false);

  const [selectedVoterTimeline, setSelectedVoterTimeline] = useState(null);

  // ── New Admin Form ──
  const [newAdminForm, setNewAdminForm] = useState({
    username: '', password: '', role: 'DISTRICT_ADMIN',
    district: '', assemblyName: '', boothNo: ''
  });
  const [credSuccessMsg, setCredSuccessMsg] = useState('');
  const [credErrorMsg, setCredErrorMsg] = useState('');

  const navigateSubPage = (pageKey) => {
    setSubPage(pageKey);
    setSelectedVoterTimeline(null);
    try { window.history.pushState({}, '', `/admin/superadmin/${pageKey}`); } catch (e) {}
  };

  // ── Fetch Initial Filter Metadata ──
  const fetchInitialMeta = async () => {
    try {
      const res = await API.get('/admin/filter-meta');
      if (res.data.success) {
        setDistricts(res.data.districts || []);
        setAssemblies(res.data.assemblies || []);
      }
    } catch (err) {
      console.error('Error fetching filter meta:', err);
    }
  };

  // ── Fetch Assemblies for District ──
  const fetchAssembliesForDistrict = async (dist) => {
    if (!dist) { fetchInitialMeta(); return; }
    try {
      setLoadingFilterAssemblies(true);
      const res = await API.get(`/admin/filter-meta?district=${encodeURIComponent(dist)}`);
      if (res.data.success) setAssemblies(res.data.assemblies || []);
    } catch (err) {
      console.error('Error loading assemblies for district:', err);
    } finally {
      setLoadingFilterAssemblies(false);
    }
  };

  // ── Fetch Booths for Assembly ──
  const fetchBoothsForAssembly = async (ass, dist) => {
    if (!ass) { setBooths([]); return; }
    try {
      setLoadingFilterBooths(true);
      const params = new URLSearchParams({ assemblyName: ass, ...(dist && { district: dist }) });
      const res = await API.get(`/admin/filter-meta?${params}`);
      if (res.data.success) setBooths(res.data.booths || []);
    } catch (err) {
      console.error('Error loading booths for assembly:', err);
    } finally {
      setLoadingFilterBooths(false);
    }
  };

  // ── Fetch Stats ──
  const fetchStats = async () => {
    try {
      setLoadingStats(true);
      const params = new URLSearchParams({
        ...(districtFilter && { district: districtFilter }),
        ...(assemblyFilter && { assemblyName: assemblyFilter }),
        ...(boothFilter    && { boothNo: boothFilter })
      });
      const res = await API.get(`/admin/dashboard-stats?${params}`);
      if (res.data.success) setStatsData(res.data);
    } catch (err) {
      console.error('Error loading stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  // ── Fetch Paginated Voters ──
  const fetchVoters = async (page = 1) => {
    try {
      setLoadingVoters(true);
      const params = new URLSearchParams({
        page, limit: LIMIT,
        ...(searchQuery    && { search: searchQuery }),
        ...(statusFilter   && { status: statusFilter }),
        ...(districtFilter && { district: districtFilter }),
        ...(assemblyFilter && { assemblyName: assemblyFilter }),
        ...(boothFilter    && { boothNo: boothFilter })
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

  // ── Fetch Logins & Meta ──
  const fetchLoginsAndCreds = async () => {
    try {
      const [credRes, assRes, distCredRes, assCredRes] = await Promise.all([
        API.get('/admin/credentials'),
        API.get('/admin/jurisdiction-assemblies'),
        API.get('/admin/jurisdiction-district-credentials'),
        API.get('/admin/jurisdiction-assembly-credentials')
      ]);
      if (credRes.data.success) setAdminList(credRes.data.admins);
      if (assRes.data.success) setAssembliesList(assRes.data.assemblies);
      if (distCredRes.data.success) setDistrictCredentials(distCredRes.data.districts);
      if (assCredRes.data.success) setAssemblyCredentials(assCredRes.data.assemblies);
    } catch (err) {
      console.error('Error loading logins & credentials:', err);
    }
  };

  const fetchBoothCredentials = async (assemblyNo) => {
    setLoadingBooths(true);
    try {
      const res = await API.get(`/admin/assembly-booth-credentials?assemblyNo=${assemblyNo}`);
      if (res.data.success) setBoothCredentialsData(res.data.data);
    } catch (err) {
      console.error('Error loading booth credentials:', err);
    } finally {
      setLoadingBooths(false);
    }
  };

  const fetchDashboardData = () => {
    fetchStats();
    fetchVoters(1);
    fetchLoginsAndCreds();
  };

  useEffect(() => {
    fetchInitialMeta();
    fetchLoginsAndCreds();
  }, []);

  useEffect(() => {
    fetchStats();
    fetchVoters(1);
    setCurrentPage(1);
  }, [districtFilter, assemblyFilter, boothFilter, statusFilter, searchQuery]);

  useEffect(() => {
    setAssemblyFilter(''); setBoothFilter(''); setBooths([]);
    fetchAssembliesForDistrict(districtFilter);
  }, [districtFilter]);

  useEffect(() => {
    setBoothFilter('');
    fetchBoothsForAssembly(assemblyFilter, districtFilter);
  }, [assemblyFilter]);

  useEffect(() => {
    if (subPage === 'logins' && credSubTab === 'booths' && selectedAssemblyNo) {
      fetchBoothCredentials(selectedAssemblyNo);
    }
  }, [subPage, credSubTab, selectedAssemblyNo]);

  const handleCreateCredential = async (e) => {
    e.preventDefault();
    setCredSuccessMsg(''); setCredErrorMsg('');
    try {
      const res = await API.post('/admin/create-credential', newAdminForm);
      if (res.data.success) {
        setCredSuccessMsg(`Credential '${res.data.admin.username}' created successfully!`);
        setNewAdminForm({ username: '', password: '', role: 'DISTRICT_ADMIN', district: '', assemblyName: '', boothNo: '' });
        fetchDashboardData();
      }
    } catch (err) {
      setCredErrorMsg(err.response?.data?.message || 'Failed to create admin credential');
    }
  };

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

  const handleQuickSwitch = async (usr, pwd) => {
    try {
      const res = await API.post('/admin/login', { username: usr, password: pwd });
      if (res.data.success) loginAdmin(res.data.admin, res.data.token);
    } catch (err) { console.error('Switch error:', err); }
  };

  const filteredBooths = boothCredentialsData?.boothLogins?.filter(b => {
    if (!boothSearchQuery) return true;
    return b.boothNo.includes(boothSearchQuery) || b.username.includes(boothSearchQuery.toLowerCase()) || b.passcode.includes(boothSearchQuery);
  }) || [];

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

  const activeScopeText = boothFilter
    ? `Booth ${boothFilter} (${assemblyFilter}, ${districtFilter})`
    : assemblyFilter
    ? `${assemblyFilter} Assembly (${districtFilter || 'All Districts'})`
    : districtFilter
    ? `${districtFilter} District`
    : 'Full Statewide Governance';

  return (
    <div style={{ width: '100%', paddingBottom: '60px', boxSizing: 'border-box' }}>

      {/* ── Header Banner ── */}
      <div className="campsite-card" style={{ width: '100%', padding: '24px', marginBottom: '24px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', width: '100%' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span className="tag-pill tag-active"><Shield size={12} /> SUPER ADMIN</span>
            </div>
            <h1 className="text-heading" style={{ margin: 0 }}>
              Statewide Super Admin Control Portal
            </h1>
            <div style={{ fontSize: '13px', color: 'var(--color-slate)', marginTop: '2px' }}>
              Scope: <strong>{activeScopeText}</strong>
            </div>
          </div>

          <button onClick={fetchDashboardData} className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: '13px' }}>
            <RefreshCw size={12} /> Refresh Data
          </button>
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="tabs-header" style={{ width: '100%', marginBottom: '24px', boxSizing: 'border-box' }}>
        <button onClick={() => navigateSubPage('dashboard')} className={`tab-btn ${subPage === 'dashboard' ? 'active' : ''}`}>
          Overview Dashboard
        </button>
        <button onClick={() => navigateSubPage('applications')} className={`tab-btn ${subPage === 'applications' ? 'active' : ''}`}>
          Scheme Applications ({totalVoters} Members)
        </button>
        <button onClick={() => navigateSubPage('logins')} className={`tab-btn ${subPage === 'logins' ? 'active' : ''}`}>
          District, Assembly &amp; Booth Logins
        </button>
        <button onClick={() => navigateSubPage('districts')} className={`tab-btn ${subPage === 'districts' ? 'active' : ''}`}>
          District Stats
        </button>
        <button onClick={() => navigateSubPage('assemblies')} className={`tab-btn ${subPage === 'assemblies' ? 'active' : ''}`}>
          Assembly Stats
        </button>
        <button onClick={() => navigateSubPage('booths')} className={`tab-btn ${subPage === 'booths' ? 'active' : ''}`}>
          Booth Stats
        </button>
        <button onClick={() => navigateSubPage('reports')} className={`tab-btn ${subPage === 'reports' ? 'active' : ''}`}>
          📊 Reports &amp; Excel Export
        </button>
      </div>

      {/* ══════════════════════════════════════════ */}
      {/* PAGE 1: OVERVIEW DASHBOARD                */}
      {/* ══════════════════════════════════════════ */}
      {subPage === 'dashboard' && (
        loadingStats ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', gap: '16px' }}>
            <div style={{ width: '40px', height: '40px', border: '4px solid var(--color-linen)', borderTopColor: 'var(--color-saffron)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <div style={{ fontSize: '14px', color: 'var(--color-slate)', fontWeight: '500' }}>Loading Super Admin Portal stats...</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : statsData ? (
          <div style={{ width: '100%', boxSizing: 'border-box' }}>

            {/* ── 4 Stat Cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px', width: '100%' }}>

              {/* Card 1: Total Voters in Electoral Roll (Read DB) */}
              <div className="stat-card">
                <div className="stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
                  <Users size={20} />
                </div>
                <div>
                  <div className="stat-number" style={{ color: '#2563eb' }}>
                    {statsData.overview.totalVotersInRoll != null
                      ? statsData.overview.totalVotersInRoll.toLocaleString()
                      : '—'}
                  </div>
                  <div className="stat-label">Total Voters in Roll</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-slate)', marginTop: '2px' }}>Electoral Roll (Read DB)</div>
                </div>
              </div>

              {/* Card 2: Voters Requested Schemes (Write DB) */}
              <div className="stat-card">
                <div className="stat-icon">
                  <Users size={20} />
                </div>
                <div>
                  <div className="stat-number">
                    {statsData.overview.totalVotersRequested ?? statsData.overview.totalUsers ?? 0}
                  </div>
                  <div className="stat-label">Voters Requested Schemes</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-slate)', marginTop: '2px' }}>Enrolled in Program</div>
                </div>
              </div>

              {/* Card 3: Total Applications */}
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'var(--color-fog-gray)', color: 'var(--color-midnight-ink)' }}>
                  <FileText size={20} />
                </div>
                <div>
                  <div className="stat-number">{statsData.overview.totalApplications}</div>
                  <div className="stat-label">Applications Submitted</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-slate)', marginTop: '2px' }}>Scheme Directives</div>
                </div>
              </div>

              {/* Card 4: Approved Directives */}
              <div className="stat-card">
                <div className="stat-icon" style={{ background: '#f0fdf4', color: 'var(--color-forest-pulse)' }}>
                  <Shield size={20} />
                </div>
                <div>
                  <div className="stat-number" style={{ color: 'var(--color-forest-pulse)' }}>
                    {statsData.overview.statusBreakdown?.Approved || 0}
                  </div>
                  <div className="stat-label">Approved Benefit Directives</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-slate)', marginTop: '2px' }}>Delivered Benefits</div>
                </div>
              </div>

            </div>

            {/* ── Top Applied BJP Schemes ── */}
            <div className="campsite-card" style={{ width: '100%', padding: '24px', boxSizing: 'border-box' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--color-midnight-ink)', marginBottom: '16px' }}>
                Top Applied BJP Schemes Across Tamil Nadu
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', width: '100%' }}>
                {statsData.schemePopularity?.map((item) => (
                  <div key={item._id} style={{ padding: '14px', background: 'var(--color-fog-gray)', borderRadius: '8px', border: '1px solid var(--color-linen)' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-midnight-ink)' }}>{item._id}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-slate)' }}>{item.cluster}</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-midnight-ink)', marginTop: '6px' }}>
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
          />
        ) : (
          <div className="campsite-card" style={{ width: '100%', padding: '24px', boxSizing: 'border-box' }}>

            {/* ── Search + Summary Row ── */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px', width: '100%', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-ash-gray)' }} />
                <input
                  type="text"
                  placeholder="Search by Member Name, EPIC, Mobile, or Scheme..."
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

            {/* ── Filters Row 2: District + Assembly + Booth + Status + Clear All ── */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px', width: '100%', alignItems: 'center', background: 'var(--color-fog-gray)', padding: '12px', borderRadius: '10px', border: '1px solid var(--color-linen)' }}>

              {/* District Filter */}
              <select
                value={districtFilter}
                onChange={(e) => setDistrictFilter(e.target.value)}
                className="form-control"
                style={{ flex: '1 1 150px', minWidth: '140px', background: '#fff' }}
              >
                <option value="">All Districts (State-wide)</option>
                {districts.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              {/* Assembly Filter */}
              <select
                value={assemblyFilter}
                onChange={(e) => setAssemblyFilter(e.target.value)}
                className="form-control"
                disabled={loadingFilterAssemblies}
                style={{ flex: '1 1 150px', minWidth: '140px', background: '#fff' }}
              >
                <option value="">{loadingFilterAssemblies ? 'Loading assemblies…' : 'All Assemblies'}</option>
                {assemblies.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>

              {/* Booth Filter (shown when Assembly is selected) */}
              {assemblyFilter && (
                <select
                  value={boothFilter}
                  onChange={(e) => setBoothFilter(e.target.value)}
                  className="form-control"
                  disabled={loadingFilterBooths}
                  style={{ flex: '1 1 130px', minWidth: '120px', background: '#fff' }}
                >
                  <option value="">{loadingFilterBooths ? 'Loading booths…' : 'All Booths'}</option>
                  {booths.map(b => (
                    <option key={b} value={b}>Booth {b}</option>
                  ))}
                </select>
              )}

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="form-control"
                style={{ flex: '1 1 140px', minWidth: '130px', background: '#fff' }}
              >
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

              {/* Clear All button */}
              {(districtFilter || assemblyFilter || boothFilter || statusFilter || searchQuery) && (
                <button
                  onClick={() => {
                    setDistrictFilter(''); setAssemblyFilter(''); setBoothFilter('');
                    setStatusFilter(''); setSearchQuery('');
                  }}
                  style={{
                    background: '#fff', border: '1px solid var(--color-linen)',
                    borderRadius: '8px', padding: '6px 14px', fontSize: '12px',
                    color: 'var(--color-slate)', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: '600'
                  }}
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
                    <th style={{ padding: '12px 10px' }}>District / Assembly / Booth</th>
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
                        No member applications found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    voters.map((voter, idx) => {
                      const latestApp = voter.applications[voter.applications.length - 1];
                      const rowNum = (currentPage - 1) * LIMIT + idx + 1;
                      return (
                        <tr key={voter.epicNo || idx}
                          style={{ borderBottom: '1px solid var(--color-linen)', transition: 'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-fog-gray)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '12px 10px', color: 'var(--color-ash-gray)', fontSize: '12px', fontWeight: '600' }}>{rowNum}</td>
                          <td style={{ padding: '12px 10px' }}>
                            <div style={{ fontWeight: '700', color: 'var(--color-midnight-ink)' }}>{voter.voterName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--color-slate)', fontFamily: 'monospace' }}>{voter.epicNo}</div>
                          </td>
                          <td style={{ padding: '12px 10px', fontWeight: '600' }}>{voter.mobile}</td>
                          <td style={{ padding: '12px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span className="tag-pill tag-sunlit" style={{ fontWeight: '700', fontSize: '11px' }}>
                                <Award size={12} /> {voter.applications.length} Scheme{voter.applications.length > 1 ? 's' : ''}
                              </span>
                              <span style={{ fontSize: '11px', color: 'var(--color-slate)' }}>
                                {voter.applications.map(a => a.schemeName).join(', ')}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 10px', color: 'var(--color-midnight-ink)' }}>
                            {voter.district} · {voter.assemblyName} · <strong>Booth {voter.boothNo}</strong>
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            <StatusBadge status={latestApp?.status || 'Pending'} />
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <button onClick={() => setSelectedVoterTimeline(voter)} className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: '12px' }}>
                                <Eye size={13} /> View
                              </button>
                              <button onClick={() => handleDirectCallVoter(voter)} className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: '12px' }}>
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
      {/* PAGE 3: LOGINS MANAGER                     */}
      {/* ══════════════════════════════════════════ */}
      {subPage === 'logins' && (
        <div style={{ width: '100%', boxSizing: 'border-box' }}>
          <div className="tabs-header" style={{ width: '100%', marginBottom: '20px', background: 'var(--color-fog-gray)', padding: '6px', borderRadius: '10px' }}>
            <button onClick={() => setCredSubTab('districts')} className={`tab-btn ${credSubTab === 'districts' ? 'active' : ''}`} style={{ padding: '8px 16px', fontSize: '13px' }}>
              District Admin Passcodes ({districtCredentials.length})
            </button>
            <button onClick={() => setCredSubTab('assemblies')} className={`tab-btn ${credSubTab === 'assemblies' ? 'active' : ''}`} style={{ padding: '8px 16px', fontSize: '13px' }}>
              Assembly Admin Passcodes ({assemblyCredentials.length})
            </button>
            <button onClick={() => setCredSubTab('booths')} className={`tab-btn ${credSubTab === 'booths' ? 'active' : ''}`} style={{ padding: '8px 16px', fontSize: '13px' }}>
              Polling Booth Passcodes (By Assembly)
            </button>
          </div>

          {/* Sub-Tab 1: District Credentials */}
          {credSubTab === 'districts' && (
            <div className="campsite-card" style={{ width: '100%', padding: '24px', boxSizing: 'border-box' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-midnight-ink)', marginBottom: '16px' }}>
                Statewide District Admin Passcodes &amp; Quick Access
              </h3>
              <div style={{ width: '100%', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-linen)', color: 'var(--color-slate)', textAlign: 'left', background: 'var(--color-fog-gray)' }}>
                      <th style={{ padding: '10px 12px' }}>DISTRICT NAME</th>
                      <th style={{ padding: '10px 12px' }}>TOTAL ASSEMBLIES</th>
                      <th style={{ padding: '10px 12px' }}>USERNAME</th>
                      <th style={{ padding: '10px 12px' }}>PASSCODE</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>QUICK LOGIN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {districtCredentials.map((dist) => (
                      <tr key={dist.username} style={{ borderBottom: '1px solid var(--color-linen)' }}>
                        <td style={{ padding: '12px', fontWeight: '700', color: 'var(--color-midnight-ink)' }}>{dist.district}</td>
                        <td style={{ padding: '12px', fontWeight: '600' }}>{dist.assembliesCount} Assemblies</td>
                        <td style={{ padding: '12px', fontFamily: 'monospace', fontWeight: '600', color: 'var(--color-slate)' }}>{dist.username}</td>
                        <td style={{ padding: '12px', fontFamily: 'monospace', fontWeight: '700', color: 'var(--color-saffron)' }}>{dist.passcode}</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <button onClick={() => handleQuickSwitch(dist.username, dist.passcode)} className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: '12px', fontWeight: '700' }}>
                            <LogIn size={13} /> Switch Login
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub-Tab 2: Assembly Credentials */}
          {credSubTab === 'assemblies' && (
            <div className="campsite-card" style={{ width: '100%', padding: '24px', boxSizing: 'border-box' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-midnight-ink)', marginBottom: '16px' }}>
                All 234 Assembly Constituency Passcodes
              </h3>
              <div style={{ width: '100%', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-linen)', color: 'var(--color-slate)', textAlign: 'left', background: 'var(--color-fog-gray)' }}>
                      <th style={{ padding: '10px 12px' }}># NO</th>
                      <th style={{ padding: '10px 12px' }}>ASSEMBLY NAME</th>
                      <th style={{ padding: '10px 12px' }}>DISTRICT</th>
                      <th style={{ padding: '10px 12px' }}>USERNAME</th>
                      <th style={{ padding: '10px 12px' }}>PASSCODE</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>QUICK LOGIN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assemblyCredentials.map((ass) => (
                      <tr key={ass.username} style={{ borderBottom: '1px solid var(--color-linen)' }}>
                        <td style={{ padding: '12px', fontWeight: '700', color: 'var(--color-slate)' }}>#{ass.assemblyNo}</td>
                        <td style={{ padding: '12px', fontWeight: '700', color: 'var(--color-midnight-ink)' }}>{ass.assemblyName}</td>
                        <td style={{ padding: '12px', color: 'var(--color-slate)' }}>{ass.district}</td>
                        <td style={{ padding: '12px', fontFamily: 'monospace', fontWeight: '600', color: 'var(--color-slate)' }}>{ass.username}</td>
                        <td style={{ padding: '12px', fontFamily: 'monospace', fontWeight: '700', color: 'var(--color-saffron)' }}>{ass.passcode}</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <button onClick={() => handleQuickSwitch(ass.username, ass.passcode)} className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: '12px', fontWeight: '700' }}>
                            <LogIn size={13} /> Switch Login
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub-Tab 3: Booth Credentials */}
          {credSubTab === 'booths' && (
            <div className="campsite-card" style={{ width: '100%', padding: '24px', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ flex: 1, minWidth: '220px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-slate)', display: 'block', marginBottom: '6px' }}>Select Assembly Constituency:</label>
                  <select
                    value={selectedAssemblyNo}
                    onChange={(e) => setSelectedAssemblyNo(e.target.value)}
                    className="form-control"
                  >
                    {assembliesList.map(a => (
                      <option key={a.assemblyNo} value={a.assemblyNo}>
                        #{a.assemblyNo} — {a.assemblyName} ({a.district})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: 1, minWidth: '220px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-slate)', display: 'block', marginBottom: '6px' }}>Search Booth No or Passcode:</label>
                  <input
                    type="text"
                    placeholder="Search booth number..."
                    value={boothSearchQuery}
                    onChange={(e) => setBoothSearchQuery(e.target.value)}
                    className="form-control"
                  />
                </div>
              </div>

              {loadingBooths ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-slate)' }}>Loading booth logins...</div>
              ) : boothCredentialsData && (
                <div style={{ width: '100%', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--color-linen)', color: 'var(--color-slate)', textAlign: 'left', background: 'var(--color-fog-gray)' }}>
                        <th style={{ padding: '10px 12px' }}>BOOTH NO</th>
                        <th style={{ padding: '10px 12px' }}>ASSEMBLY</th>
                        <th style={{ padding: '10px 12px' }}>DISTRICT</th>
                        <th style={{ padding: '10px 12px' }}>USERNAME</th>
                        <th style={{ padding: '10px 12px' }}>PASSCODE</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>QUICK LOGIN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBooths.map((b) => (
                        <tr key={b.username} style={{ borderBottom: '1px solid var(--color-linen)' }}>
                          <td style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--color-midnight-ink)' }}>Booth {b.boothNo}</td>
                          <td style={{ padding: '10px 12px' }}>{boothCredentialsData.assemblyName}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--color-slate)' }}>{boothCredentialsData.district}</td>
                          <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: '600' }}>{b.username}</td>
                          <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: '700', color: 'var(--color-saffron)' }}>{b.passcode}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            <button onClick={() => handleQuickSwitch(b.username, b.passcode)} className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: '12px', fontWeight: '700' }}>
                              <LogIn size={13} /> Switch Login
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* PAGE 4: DISTRICT STATS                    */}
      {/* ══════════════════════════════════════════ */}
      {subPage === 'districts' && statsData && (
        <div className="campsite-card" style={{ width: '100%', padding: '24px', boxSizing: 'border-box' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--color-midnight-ink)', marginBottom: '16px' }}>
            District-wise Application Analytics
          </h3>
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-linen)', color: 'var(--color-slate)', textAlign: 'left', background: 'var(--color-fog-gray)' }}>
                  <th style={{ padding: '10px' }}>District Name</th>
                  <th style={{ padding: '10px' }}>Total Applications</th>
                  <th style={{ padding: '10px' }}>Approved</th>
                  <th style={{ padding: '10px' }}>Pending</th>
                </tr>
              </thead>
              <tbody>
                {statsData.districtStats?.map((row) => (
                  <tr key={row._id} style={{ borderBottom: '1px solid var(--color-linen)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-fog-gray)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '10px', fontWeight: '600', color: 'var(--color-midnight-ink)' }}>{row._id}</td>
                    <td style={{ padding: '10px', fontWeight: '600' }}>{row.totalApps}</td>
                    <td style={{ padding: '10px', color: 'var(--color-forest-pulse)', fontWeight: '600' }}>{row.approved}</td>
                    <td style={{ padding: '10px', color: 'var(--color-slate)' }}>{row.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* PAGE 5: ASSEMBLY STATS                    */}
      {/* ══════════════════════════════════════════ */}
      {subPage === 'assemblies' && statsData && (
        <div className="campsite-card" style={{ width: '100%', padding: '24px', boxSizing: 'border-box' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--color-midnight-ink)', marginBottom: '16px' }}>
            Assembly Constituency-wise Stats
          </h3>
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-linen)', color: 'var(--color-slate)', textAlign: 'left', background: 'var(--color-fog-gray)' }}>
                  <th style={{ padding: '10px' }}>Assembly Constituency</th>
                  <th style={{ padding: '10px' }}>District</th>
                  <th style={{ padding: '10px' }}>Total Applications</th>
                  <th style={{ padding: '10px' }}>Approved</th>
                  <th style={{ padding: '10px' }}>Pending</th>
                </tr>
              </thead>
              <tbody>
                {statsData.assemblyStats?.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--color-linen)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-fog-gray)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '10px', fontWeight: '600', color: 'var(--color-midnight-ink)' }}>{row._id.assemblyName}</td>
                    <td style={{ padding: '10px', color: 'var(--color-slate)' }}>{row._id.district}</td>
                    <td style={{ padding: '10px', fontWeight: '600' }}>{row.totalApps}</td>
                    <td style={{ padding: '10px', color: 'var(--color-forest-pulse)', fontWeight: '600' }}>{row.approved}</td>
                    <td style={{ padding: '10px', color: 'var(--color-slate)' }}>{row.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* PAGE 6: BOOTH STATS                       */}
      {/* ══════════════════════════════════════════ */}
      {subPage === 'booths' && statsData && (
        <div className="campsite-card" style={{ width: '100%', padding: '24px', boxSizing: 'border-box' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--color-midnight-ink)', marginBottom: '16px' }}>
            Polling Booth-wise Breakdown Stats
          </h3>
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-linen)', color: 'var(--color-slate)', textAlign: 'left', background: 'var(--color-fog-gray)' }}>
                  <th style={{ padding: '10px' }}>Booth / Part No</th>
                  <th style={{ padding: '10px' }}>Assembly</th>
                  <th style={{ padding: '10px' }}>District</th>
                  <th style={{ padding: '10px' }}>Total Applications</th>
                  <th style={{ padding: '10px' }}>Approved</th>
                  <th style={{ padding: '10px' }}>Pending</th>
                </tr>
              </thead>
              <tbody>
                {statsData.boothStats?.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--color-linen)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-fog-gray)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '10px', fontWeight: '600', color: 'var(--color-midnight-ink)' }}>Booth {row._id.boothNo}</td>
                    <td style={{ padding: '10px' }}>{row._id.assemblyName}</td>
                    <td style={{ padding: '10px', color: 'var(--color-slate)' }}>{row._id.district}</td>
                    <td style={{ padding: '10px', fontWeight: '600' }}>{row.totalApps}</td>
                    <td style={{ padding: '10px', color: 'var(--color-forest-pulse)', fontWeight: '600' }}>{row.approved}</td>
                    <td style={{ padding: '10px', color: 'var(--color-slate)' }}>{row.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* PAGE 7: REPORTS & EXCEL EXPORT             */}
      {/* ══════════════════════════════════════════ */}
      {subPage === 'reports' && <ReportsView />}
    </div>
  );
};

export default SuperAdminDashboard;
