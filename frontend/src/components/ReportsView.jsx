import React, { useState, useEffect } from 'react';
import ExcelJS from 'exceljs';
import API from '../utils/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from './StatusBadge';
import { BJP_SCHEMES } from '../utils/constants';
import {
  FileSpreadsheet, Filter, Search, RefreshCw, Download, Users, FileText, CheckCircle2, Clock, XCircle, Shield
} from 'lucide-react';

const SCHEME_OPTIONS = [
  'PMSBY (Pradhan Mantri Suraksha Bima Yojana)',
  'PMJJBY (Pradhan Mantri Jeevan Jyoti Bima Yojana)',
  'APY (Atal Pension Yojana)',
  'PM SVANidhi (Street Vendor Loan)',
  'PM Mudra Shishu (Up to ₹50,000)',
  'PM Mudra Kishor (₹50,000 to ₹5 Lakhs)',
  'Udyam MSME Registration',
  'Stand Up India Scheme',
  'Startup India Seed Fund Scheme',
  'PM Kisan Samman Nidhi (₹6,000/yr)',
  'PM Fasal Bima Yojana (Crop Insurance)',
  'PM Kisan Maan Dhan Yojana (Pension)',
  'PM Ujjwala Yojana (Free LPG)',
  'PM Matru Vandana Yojana (Maternity Benefit)',
  'Sukanya Samriddhi Yojana (Girl Child Savings)',
  'PMKVY (Pradhan Mantri Kaushal Vikas Yojana)',
  'NSP National Scholarship Portal',
  'PM Vishwakarma Scheme',
  'PM Jan Dhan Yojana (Zero-Balance Account)',
  'e-Shram Unorganised Workers Portal'
];

const STATUS_OPTIONS = [
  'Submitted',
  'Pending',
  'Processing',
  'In Progress',
  'Called',
  'Verified',
  'Approved',
  'Rejected'
];

const ReportsView = ({
  initialDistrict = '',
  initialAssembly = '',
  initialBooth = '',
  initialStatus = '',
  initialScheme = ''
}) => {
  const { admin } = useAuth();
  const role = admin?.role || 'SUPER_ADMIN';

  // Filters State
  const [districtFilter, setDistrictFilter] = useState(initialDistrict || admin?.district || '');
  const [assemblyFilter, setAssemblyFilter] = useState(initialAssembly || admin?.assemblyName || '');
  const [boothFilter, setBoothFilter] = useState(initialBooth || (admin?.boothNo ? String(admin.boothNo) : ''));
  const [statusFilter, setStatusFilter] = useState(initialStatus || '');
  const [schemeFilter, setSchemeFilter] = useState(initialScheme || '');
  const [searchQuery, setSearchQuery] = useState('');

  // Dropdowns Meta
  const [districts, setDistricts] = useState([]);
  const [assemblies, setAssemblies] = useState([]);
  const [booths, setBooths] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(false);

  // Data & Loading State
  const [reportVoters, setReportVoters] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0); // distinct applied voters
  const [totalApps, setTotalApps] = useState(0);       // total scheme applications
  const [statusCounts, setStatusCounts] = useState({ Approved: 0, Pending: 0, Submitted: 0, Processing: 0, Called: 0, Verified: 0, Completed: 0, Rejected: 0 });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingData, setLoadingData] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const isDistrictLocked = ['DISTRICT_ADMIN', 'ASSEMBLY_ADMIN', 'BOOTH_ADMIN'].includes(role);
  const isAssemblyLocked = ['ASSEMBLY_ADMIN', 'BOOTH_ADMIN'].includes(role);
  const isBoothLocked    = role === 'BOOTH_ADMIN';

  // ── Fetch Initial Filter Metadata ──
  const fetchInitialMeta = async () => {
    try {
      setLoadingMeta(true);
      const res = await API.get('/admin/filter-meta');
      if (res.data.success) {
        setDistricts(res.data.districts || []);
        if (!districtFilter) setAssemblies(res.data.assemblies || []);
      }
    } catch (err) {
      console.error('Error fetching metadata:', err);
    } finally {
      setLoadingMeta(false);
    }
  };

  // ── Fetch Assemblies for District ──
  const fetchAssembliesForDistrict = async (dist) => {
    if (!dist) { fetchInitialMeta(); return; }
    try {
      const res = await API.get(`/admin/filter-meta?district=${encodeURIComponent(dist)}`);
      if (res.data.success) setAssemblies(res.data.assemblies || []);
    } catch (err) {
      console.error('Error fetching assemblies:', err);
    }
  };

  // ── Fetch Booths for Assembly ──
  const fetchBoothsForAssembly = async (ass, dist) => {
    if (!ass) { setBooths([]); return; }
    try {
      const params = new URLSearchParams({ assemblyName: ass, ...(dist && { district: dist }) });
      const res = await API.get(`/admin/filter-meta?${params}`);
      if (res.data.success) setBooths(res.data.booths || []);
    } catch (err) {
      console.error('Error fetching booths:', err);
    }
  };

  // ── Fetch Report Applications ──
  const fetchReportData = async () => {
    try {
      setLoadingData(true);
      const params = new URLSearchParams({
        page: currentPage,
        limit: 50,
        ...(searchQuery    && { search: searchQuery }),
        ...(statusFilter   && { status: statusFilter }),
        ...(schemeFilter   && { schemeName: schemeFilter }),
        ...(districtFilter && { district: districtFilter }),
        ...(assemblyFilter && { assemblyName: assemblyFilter }),
        ...(boothFilter    && { boothNo: boothFilter })
      });
      const res = await API.get(`/admin/applications?${params}`);
      if (res.data.success) {
        setReportVoters(res.data.voters || []);
        setTotalRecords(res.data.totalVoters || 0);
        setTotalApps(res.data.totalApplications || res.data.totalVoters || 0);
        setTotalPages(res.data.totalPages || 1);
        if (res.data.statusCounts) {
          setStatusCounts(res.data.statusCounts);
        }
      }
    } catch (err) {
      console.error('Error fetching report data:', err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchInitialMeta();
  }, []);

  useEffect(() => {
    if (!isAssemblyLocked) {
      setAssemblyFilter(admin?.assemblyName || '');
      setBoothFilter(admin?.boothNo ? String(admin.boothNo) : '');
      setBooths([]);
      fetchAssembliesForDistrict(districtFilter);
    }
  }, [districtFilter]);

  useEffect(() => {
    if (!isBoothLocked) {
      setBoothFilter(admin?.boothNo ? String(admin.boothNo) : '');
      fetchBoothsForAssembly(assemblyFilter, districtFilter);
    }
  }, [assemblyFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [districtFilter, assemblyFilter, boothFilter, statusFilter, schemeFilter, searchQuery]);

  useEffect(() => {
    fetchReportData();
  }, [districtFilter, assemblyFilter, boothFilter, statusFilter, schemeFilter, searchQuery, currentPage]);

  // ── Flatten All Scheme Application Items for Export & Stats ──
  const allReportApps = reportVoters.flatMap(v => {
    if (!v.applications || v.applications.length === 0) {
      return [{
        voterName: v.voterName || 'N/A',
        epicNo: v.epicNo || 'N/A',
        mobile: v.mobile || 'N/A',
        district: v.district || 'N/A',
        assemblyName: v.assemblyName || 'N/A',
        boothNo: v.boothNo || 'N/A',
        schemeName: 'No Scheme Applied',
        clusterName: '—',
        status: 'Unregistered',
        appliedAt: '—'
      }];
    }
    return v.applications.map(app => ({
      voterName: v.voterName || app.voterName || 'N/A',
      epicNo: v.epicNo || app.epicNo || 'N/A',
      mobile: v.mobile || app.mobile || 'N/A',
      district: v.district || app.district || 'N/A',
      assemblyName: v.assemblyName || app.assemblyName || 'N/A',
      boothNo: v.boothNo || app.boothNo || 'N/A',
      schemeName: app.schemeName || app.schemeId || 'General Scheme',
      clusterName: app.clusterName || 'BJP Welfare',
      status: app.status || 'Submitted',
      appliedAt: app.appliedAt ? new Date(app.appliedAt).toLocaleDateString() : '—'
    }));
  });

  const totalAppsCount = totalApps || allReportApps.length;
  const approvedCount = (statusCounts.Approved || 0) + (statusCounts.Completed || 0);
  const pendingCount = (statusCounts.Submitted || 0) + (statusCounts.Pending || 0) + (statusCounts.Processing || 0) + (statusCounts.Called || 0) + (statusCounts.Verified || 0);
  const rejectedCount = statusCounts.Rejected || 0;

  // ── Styled Excel Download via backend (server-side ExcelJS, fast) ──
  const handleDownloadCsv = () => {
    const token = localStorage.getItem('bjp_admin_token');
    const params = new URLSearchParams({
      ...(searchQuery    && { search: searchQuery }),
      ...(statusFilter   && { status: statusFilter }),
      ...(schemeFilter   && { schemeName: schemeFilter }),
      ...(districtFilter && { district: districtFilter }),
      ...(assemblyFilter && { assemblyName: assemblyFilter }),
      ...(boothFilter    && { boothNo: boothFilter })
    });

    setIsExporting(true);
    fetch(`/api/admin/export-excel?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) throw new Error('Export failed');
        const cd = res.headers.get('Content-Disposition') || '';
        const match = cd.match(/filename="?([^"]+)"?/);
        const filename = match ? match[1] : `BJP_Report_${new Date().toISOString().slice(0,10)}.xlsx`;
        return res.blob().then(blob => ({ blob, filename }));
      })
      .then(({ blob, filename }) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      })
      .catch(err => console.error('Excel download error:', err))
      .finally(() => setIsExporting(false));
  };


  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      
      {/* ── Page Header Banner ── */}
      <div className="campsite-card" style={{ width: '100%', padding: '24px', marginBottom: '24px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span className="tag-pill tag-active" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <FileSpreadsheet size={12} /> REPORTS &amp; EXPORT CENTER
              </span>
              <span style={{ fontSize: '12px', background: 'rgba(255, 153, 51, 0.15)', color: '#FF9933', padding: '2px 10px', borderRadius: '12px', fontWeight: '700' }}>
                {role}
              </span>
            </div>
            <h1 className="text-heading" style={{ margin: 0 }}>
              Scheme Applications &amp; Member Reports
            </h1>
            <div style={{ fontSize: '13px', color: 'var(--color-slate)', marginTop: '4px' }}>
              Generate, filter, and export customized Excel reports for BJP Nalam Thittam Welfare Schemes.
            </div>
          </div>

          <button
            onClick={handleDownloadCsv}
            disabled={isExporting || totalRecords === 0}
            className="btn btn-primary"
            style={{
              padding: '10px 22px',
              fontSize: '14px',
              fontWeight: '700',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(255, 153, 51, 0.3)',
              cursor: isExporting ? 'wait' : 'pointer'
            }}
          >
            {isExporting ? <RefreshCw size={16} className="spin-icon" /> : <Download size={16} />}
            {isExporting ? 'Downloading CSV...' : 'Download CSV Report'}
          </button>
        </div>
      </div>

      {/* ── Filter Bar Card ── */}
      <div className="campsite-card" style={{ width: '100%', padding: '20px', marginBottom: '24px', boxSizing: 'border-box' }}>
        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-midnight-ink)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Filter size={15} color="var(--color-saffron)" /> Report Scope &amp; Data Filters
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', width: '100%' }}>
          
          {/* Search Input */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Search Member</label>
            <div style={{ position: 'relative', marginTop: '4px' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name, EPIC, Mobile..."
                className="form-control"
                style={{ paddingLeft: '32px' }}
              />
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--color-slate)' }} />
            </div>
          </div>

          {/* District Filter */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>District</label>
            <select
              value={districtFilter}
              disabled={isDistrictLocked}
              onChange={(e) => setDistrictFilter(e.target.value)}
              className="form-control"
              style={{ marginTop: '4px', cursor: isDistrictLocked ? 'not-allowed' : 'pointer' }}
            >
              <option value="">All Districts (Statewide)</option>
              {districts.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Assembly Filter */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Assembly Constituency</label>
            <select
              value={assemblyFilter}
              disabled={isAssemblyLocked}
              onChange={(e) => setAssemblyFilter(e.target.value)}
              className="form-control"
              style={{ marginTop: '4px', cursor: isAssemblyLocked ? 'not-allowed' : 'pointer' }}
            >
              <option value="">All Assemblies</option>
              {assemblies.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Booth Filter */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Booth / Part No</label>
            <select
              value={boothFilter}
              disabled={isBoothLocked}
              onChange={(e) => setBoothFilter(e.target.value)}
              className="form-control"
              style={{ marginTop: '4px', cursor: isBoothLocked ? 'not-allowed' : 'pointer' }}
            >
              <option value="">All Booths</option>
              {booths.map(b => (
                <option key={b} value={b}>Booth {b}</option>
              ))}
            </select>
          </div>

          {/* Scheme Status Filter */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Application Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="form-control"
              style={{ marginTop: '4px' }}
            >
              <option value="">All Application Statuses</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Scheme Name Filter */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>BJP Scheme Name</label>
            <select
              value={schemeFilter}
              onChange={(e) => setSchemeFilter(e.target.value)}
              className="form-control"
              style={{ marginTop: '4px' }}
            >
              <option value="">All 20 Central BJP Schemes</option>
              {BJP_SCHEMES.map(s => (
                <option key={s.id} value={s.name}>
                  {s.name} ({s.fullTitle})
                </option>
              ))}
            </select>
          </div>

        </div>

        {/* Reset Filters Row */}
        {(districtFilter || assemblyFilter || boothFilter || statusFilter || schemeFilter || searchQuery) && (
          <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                if (!isDistrictLocked) setDistrictFilter('');
                if (!isAssemblyLocked) setAssemblyFilter('');
                if (!isBoothLocked) setBoothFilter('');
                setStatusFilter('');
                setSchemeFilter('');
                setSearchQuery('');
              }}
              style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
            >
              ✕ Clear All Filters
            </button>
          </div>
        )}
      </div>

      {/* ── Summary Stats Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px', width: '100%' }}>
        
        {/* Total Members */}
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
            <Users size={18} />
          </div>
          <div>
            <div className="stat-number" style={{ color: '#2563eb' }}>{totalRecords}</div>
            <div className="stat-label">Unique Members</div>
          </div>
        </div>

        {/* Total Applications */}
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#fff7ed', color: '#ea580c' }}>
            <FileText size={18} />
          </div>
          <div>
            <div className="stat-number" style={{ color: '#ea580c' }}>{totalAppsCount}</div>
            <div className="stat-label">Scheme Applications</div>
          </div>
        </div>

        {/* Approved */}
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div className="stat-number" style={{ color: '#16a34a' }}>{approvedCount}</div>
            <div className="stat-label">Approved Directives</div>
          </div>
        </div>

        {/* Pending */}
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#fefce8', color: '#ca8a04' }}>
            <Clock size={18} />
          </div>
          <div>
            <div className="stat-number" style={{ color: '#ca8a04' }}>{pendingCount}</div>
            <div className="stat-label">Pending Verification</div>
          </div>
        </div>

        {/* Rejected */}
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#fef2f2', color: '#dc2626' }}>
            <XCircle size={18} />
          </div>
          <div>
            <div className="stat-number" style={{ color: '#dc2626' }}>{rejectedCount}</div>
            <div className="stat-label">Rejected / Action Needed</div>
          </div>
        </div>

      </div>

      {/* ── Report Data Table View ── */}
      <div className="campsite-card" style={{ width: '100%', padding: '24px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--color-midnight-ink)', margin: 0 }}>
              Report Data Preview ({allReportApps.length} Application Records)
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--color-slate)' }}>
              Showing matching records in current view. Click "Download Excel Report" above to export the complete report dataset.
            </span>
          </div>

          <button
            onClick={handleDownloadCsv}
            disabled={isExporting || totalRecords === 0}
            className="btn btn-secondary"
            style={{ padding: '6px 14px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Download size={14} /> Export CSV
          </button>
        </div>

        {loadingData ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--color-slate)' }}>
            <RefreshCw size={24} className="spin-icon" style={{ marginBottom: '10px' }} />
            <div>Loading report dataset...</div>
          </div>
        ) : allReportApps.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--color-slate)', background: 'var(--color-fog-gray)', borderRadius: '8px' }}>
            <FileSpreadsheet size={32} style={{ marginBottom: '10px', color: 'var(--color-slate)' }} />
            <div style={{ fontWeight: '600' }}>No records found matching selected report filters.</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>Try adjusting your search query, status, or jurisdiction filters above.</div>
          </div>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-linen)', color: 'var(--color-slate)', textAlign: 'left', background: 'var(--color-fog-gray)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>S.NO</th>
                  <th style={{ padding: '10px 12px' }}>MEMBER / VOTER NAME</th>
                  <th style={{ padding: '10px 12px' }}>EPIC NUMBER</th>
                  <th style={{ padding: '10px 12px' }}>MOBILE NUMBER</th>
                  <th style={{ padding: '10px 12px' }}>DISTRICT</th>
                  <th style={{ padding: '10px 12px' }}>ASSEMBLY</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>BOOTH</th>
                  <th style={{ padding: '10px 12px' }}>BJP SCHEME NAME</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>STATUS</th>
                  <th style={{ padding: '10px 12px' }}>APPLIED DATE</th>
                </tr>
              </thead>
              <tbody>
                {allReportApps.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--color-linen)' }}>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--color-slate)' }}>{(currentPage - 1) * 50 + idx + 1}</td>
                    <td style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--color-midnight-ink)' }}>{row.voterName}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: '600' }}>{row.epicNo}</td>
                    <td style={{ padding: '10px 12px' }}>{row.mobile}</td>
                    <td style={{ padding: '10px 12px', fontWeight: '600' }}>{row.district}</td>
                    <td style={{ padding: '10px 12px' }}>{row.assemblyName}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>Booth {row.boothNo}</td>
                    <td style={{ padding: '10px 12px', fontWeight: '600', color: 'var(--color-midnight-ink)' }}>{row.schemeName}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <StatusBadge status={row.status} />
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--color-slate)', fontSize: '12px' }}>{row.appliedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ── Pagination Bar (50 items per page) ── */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginTop: '20px', paddingTop: '14px', borderTop: '1px solid var(--color-linen)', fontSize: '13px', color: 'var(--color-slate)' }}>
                <div>
                  Showing <strong>{(currentPage - 1) * 50 + 1}</strong> – <strong>{Math.min(currentPage * 50, totalAppsCount)}</strong> of <strong>{totalAppsCount}</strong> application records
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1 || loadingData}
                    className="btn btn-ghost"
                    style={{ padding: '6px 12px', fontSize: '12px', opacity: currentPage === 1 ? 0.4 : 1 }}
                  >
                    ← Prev
                  </button>

                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let p = i + 1;
                    if (totalPages > 5) {
                      if (currentPage > 3) p = currentPage - 2 + i;
                      if (p > totalPages) p = totalPages - 4 + i;
                    }
                    return (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        disabled={loadingData}
                        className={`btn ${p === currentPage ? 'btn-primary' : 'btn-ghost'}`}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: p === currentPage ? '700' : '500',
                          minWidth: '34px'
                        }}
                      >
                        {p}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages || loadingData}
                    className="btn btn-ghost"
                    style={{ padding: '6px 12px', fontSize: '12px', opacity: currentPage === totalPages ? 0.4 : 1 }}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
};

export default ReportsView;
