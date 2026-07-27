import React, { useState, useEffect } from 'react';
import ExcelJS from 'exceljs';
import API from '../utils/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from './StatusBadge';
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

const ReportsView = () => {
  const { admin } = useAuth();
  const role = admin?.role || 'SUPER_ADMIN';

  // Filters State
  const [districtFilter, setDistrictFilter] = useState(admin?.district || '');
  const [assemblyFilter, setAssemblyFilter] = useState(admin?.assemblyName || '');
  const [boothFilter, setBoothFilter] = useState(admin?.boothNo ? String(admin.boothNo) : '');
  const [statusFilter, setStatusFilter] = useState('');
  const [schemeFilter, setSchemeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Dropdowns Meta
  const [districts, setDistricts] = useState([]);
  const [assemblies, setAssemblies] = useState([]);
  const [booths, setBooths] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(false);

  // Data & Loading State
  const [reportVoters, setReportVoters] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
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
        page: 1,
        limit: 100,
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
    fetchReportData();
  }, [districtFilter, assemblyFilter, boothFilter, statusFilter, schemeFilter, searchQuery]);

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

  const totalAppsCount = allReportApps.length;
  const approvedCount = allReportApps.filter(a => a.status === 'Approved').length;
  const pendingCount = allReportApps.filter(a => ['Submitted', 'Pending', 'In Progress', 'Processing', 'Called'].includes(a.status)).length;
  const rejectedCount = allReportApps.filter(a => a.status === 'Rejected').length;

  // ── Download Styled Excel Report ──
  const handleDownloadExcel = async () => {
    setIsExporting(true);
    try {
      // 1. Fetch FULL list of matching applications for complete export
      const params = new URLSearchParams({
        exportAll: 'true',
        ...(searchQuery    && { search: searchQuery }),
        ...(statusFilter   && { status: statusFilter }),
        ...(schemeFilter   && { schemeName: schemeFilter }),
        ...(districtFilter && { district: districtFilter }),
        ...(assemblyFilter && { assemblyName: assemblyFilter }),
        ...(boothFilter    && { boothNo: boothFilter })
      });

      const res = await API.get(`/admin/applications?${params}`);
      const exportVoters = res.data.success ? (res.data.voters || []) : reportVoters;

      const exportRows = exportVoters.flatMap(v => {
        if (!v.applications || v.applications.length === 0) {
          return [{
            voterName: v.voterName || 'N/A',
            epicNo: v.epicNo || 'N/A',
            mobile: v.mobile || 'N/A',
            district: v.district || 'N/A',
            assemblyName: v.assemblyName || 'N/A',
            boothNo: v.boothNo || 'N/A',
            schemeName: 'No Scheme Selected',
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
          appliedAt: app.appliedAt ? new Date(app.appliedAt).toLocaleString() : '—'
        }));
      });

      // 2. Create ExcelJS Workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'BJP Nalam Thittam Admin Portal';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('BJP Schemes Report');

      // Page Setup for Printing
      worksheet.pageSetup.orientation = 'landscape';
      worksheet.pageSetup.paperSize = 9; // A4

      // Title Banner (Row 1 to 2)
      worksheet.mergeCells('A1:K2');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = 'BJP NALAM THITTAM — SCHEME APPLICATIONS & MEMBER REPORT';
      titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF9933' } }; // BJP Saffron
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

      // Subtitle / Scope Metadata (Row 3)
      worksheet.mergeCells('A3:K3');
      const subCell = worksheet.getCell('A3');
      const scopeDesc = boothFilter
        ? `Booth ${boothFilter} (${assemblyFilter}, ${districtFilter})`
        : assemblyFilter
        ? `Assembly ${assemblyFilter} (${districtFilter})`
        : districtFilter
        ? `District ${districtFilter}`
        : 'Statewide Tamil Nadu';
      
      subCell.value = `Report Scope: ${scopeDesc} | Generated On: ${new Date().toLocaleString()} | Role: ${role} | Total Records: ${exportRows.length}`;
      subCell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF334155' } };
      subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      subCell.alignment = { vertical: 'middle', horizontal: 'center' };

      // Empty Row 4
      worksheet.getRow(4).height = 10;

      // Table Header Columns (Row 5)
      const headers = [
        'S.No',
        'Voter Name',
        'EPIC Number',
        'Mobile Number',
        'District',
        'Assembly Name',
        'Booth No',
        'Scheme Name',
        'Cluster / Benefit',
        'Status',
        'Applied Date'
      ];

      const headerRow = worksheet.getRow(5);
      headerRow.height = 28;
      headers.forEach((h, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = h;
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // Dark Slate Blue
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF94A3B8' } },
          bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
          left: { style: 'thin', color: { argb: 'FF94A3B8' } },
          right: { style: 'thin', color: { argb: 'FF94A3B8' } }
        };
      });

      // Populate Data Rows (Row 6 onwards)
      exportRows.forEach((item, index) => {
        const rowIndex = 6 + index;
        const row = worksheet.getRow(rowIndex);
        row.height = 22;

        const isEven = index % 2 === 0;
        const rowBgColor = isEven ? 'FFFFFFFF' : 'FFF8FAFC'; // Zebra striping

        row.values = [
          index + 1,
          item.voterName,
          item.epicNo,
          item.mobile,
          item.district,
          item.assemblyName,
          item.boothNo,
          item.schemeName,
          item.clusterName,
          item.status,
          item.appliedAt
        ];

        // Format Cells
        for (let colIdx = 1; colIdx <= 11; colIdx++) {
          const cell = row.getCell(colIdx);
          cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1E293B' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBgColor } };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };

          // Alignment
          if ([1, 3, 4, 7, 10, 11].includes(colIdx)) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
          }

          // Custom Status Cell Highlighting
          if (colIdx === 10) {
            const st = String(item.status).toLowerCase();
            if (st === 'approved') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } }; // Soft Green
              cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF15803D' } };
            } else if (['submitted', 'pending', 'in progress', 'processing', 'called'].includes(st)) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Soft Amber
              cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFB45309' } };
            } else if (st === 'rejected') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }; // Soft Red
              cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
            }
          }
        }
      });

      // Auto-fit Column Widths dynamically
      worksheet.columns.forEach((column) => {
        let maxLen = 12;
        column.eachCell({ includeEmpty: true }, (cell) => {
          const cellValue = cell.value ? String(cell.value) : '';
          if (cellValue.length > maxLen) {
            maxLen = cellValue.length;
          }
        });
        column.width = Math.min(Math.max(maxLen + 3, 12), 45);
      });

      // Generate Buffer and Trigger Download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const cleanFileName = `BJP_Schemes_Report_${(districtFilter || 'TN').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.xlsx`;
      anchor.download = cleanFileName;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error generating Excel report:', err);
    } finally {
      setIsExporting(false);
    }
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
            onClick={handleDownloadExcel}
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
            {isExporting ? 'Generating Excel...' : 'Download Excel Report'}
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
              <option value="">All 20 BJP Schemes</option>
              {SCHEME_OPTIONS.map(sch => (
                <option key={sch} value={sch}>{sch}</option>
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
            onClick={handleDownloadExcel}
            disabled={isExporting || totalRecords === 0}
            className="btn btn-secondary"
            style={{ padding: '6px 14px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Download size={14} /> Export Excel
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
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--color-slate)' }}>{idx + 1}</td>
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
          </div>
        )}
      </div>

    </div>
  );
};

export default ReportsView;
