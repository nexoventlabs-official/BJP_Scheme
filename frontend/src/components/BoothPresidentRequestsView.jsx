import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, Clock, CheckCircle2, XCircle, Search, Filter, RefreshCw, User, MapPin, Phone, Calendar, ChevronLeft, ChevronRight, FileText, Building
} from 'lucide-react';
import API from '../utils/api';

const BoothPresidentRequestsView = ({ admin = {} }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRequests, setTotalRequests] = useState(0);

  // Filters
  const [statusFilter, setStatusFilter] = useState(''); // '', 'Pending', 'Approved', 'Rejected'
  const [searchQuery, setSearchQuery] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');
  const [assemblyFilter, setAssemblyFilter] = useState('');

  // Rejection modal
  const [rejectingItem, setRejectingItem] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processingId, setProcessingId] = useState(null);

  // Jurisdictions for Super/State Admin filter dropdowns
  const [jurisdictions, setJurisdictions] = useState({ districts: [], assemblies: [] });

  const isAssemblyAdmin = admin.role === 'ASSEMBLY_ADMIN';
  const isDistrictAdmin = admin.role === 'DISTRICT_ADMIN';
  const isGlobalAdmin = admin.role === 'SUPER_ADMIN' || admin.role === 'STATE_ADMIN';

  const fetchJurisdictions = async () => {
    if (!isGlobalAdmin && !isDistrictAdmin) return;
    try {
      const res = await API.get('/booth-president/jurisdictions');
      if (res.data.success) {
        setJurisdictions({
          districts: res.data.districts || [],
          assemblies: res.data.assemblies || []
        });
      }
    } catch (err) {
      console.error('Error fetching jurisdictions for filter:', err);
    }
  };

  const fetchRequests = async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page,
        limit: 15,
        ...(statusFilter && { status: statusFilter }),
        ...(searchQuery && { search: searchQuery }),
        ...(districtFilter && { district: districtFilter }),
        ...(assemblyFilter && { assemblyName: assemblyFilter })
      });
      const res = await API.get(`/admin/booth-president-requests?${params}`);
      if (res.data.success) {
        setRequests(res.data.requests || []);
        setStats(res.data.stats || { total: 0, pending: 0, approved: 0, rejected: 0 });
        setTotalRequests(res.data.totalRequests || 0);
        setTotalPages(res.data.totalPages || 1);
        setCurrentPage(res.data.currentPage || 1);
      }
    } catch (err) {
      console.error('Error fetching Booth President requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJurisdictions();
  }, []);

  useEffect(() => {
    fetchRequests(1);
    setCurrentPage(1);
  }, [statusFilter, searchQuery, districtFilter, assemblyFilter]);

  const handleAction = async (requestId, action, reason = '') => {
    try {
      setProcessingId(requestId);
      const res = await API.post(`/admin/booth-president-requests/${requestId}/action`, {
        action,
        reason
      });
      if (res.data.success) {
        setRejectingItem(null);
        setRejectionReason('');
        fetchRequests(currentPage);
      }
    } catch (err) {
      console.error('Error updating Booth President request action:', err);
      alert(err.response?.data?.message || 'Failed to update request');
    } finally {
      setProcessingId(null);
    }
  };

  const filteredAssemblyOptions = jurisdictions.assemblies.filter(a => {
    if (!districtFilter) return true;
    return a.district.toLowerCase() === districtFilter.toLowerCase();
  });

  const fmtDate = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return '—'; }
  };

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      {/* Top Header Title */}
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-midnight-ink, #0f172a)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={24} style={{ color: 'var(--color-saffron, #ff9933)' }} />
            Booth President Applications
          </h2>
          <div style={{ fontSize: '13px', color: 'var(--color-slate, #64748b)', marginTop: '4px' }}>
            {isAssemblyAdmin ? `Manage Booth President applications for ${admin.assemblyName} Constituency` :
             isDistrictAdmin ? `Manage Booth President applications for ${admin.district} District` :
             'Review and manage Booth President applications across all electoral booths in Tamil Nadu'}
          </div>
        </div>

        <button
          onClick={() => fetchRequests(currentPage)}
          className="btn-action btn-view"
          style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={14} /> Refresh Requests
        </button>
      </div>

      {/* 4 Stat Cards Grid */}
      {(() => {
        const cardBase = {
          padding: '18px 20px',
          background: '#fff',
          borderRadius: '14px',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: '14px',
          minHeight: 'auto',
          boxSizing: 'border-box',
        };
        const iconChip = (bg, color) => ({
          width: '46px',
          height: '46px',
          minWidth: '46px',
          borderRadius: '12px',
          background: bg,
          color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          padding: 0,
          margin: 0,
          boxSizing: 'border-box',
        });
        const numberStyle = (color) => ({ fontSize: '26px', fontWeight: 800, lineHeight: 1.1, color, marginBottom: '2px' });
        const labelStyle = (color) => ({ fontSize: '12.5px', fontWeight: 600, color, whiteSpace: 'nowrap' });
        const cards = [
          { key: 'total', filter: null, border: '#e2e8f0', iconBg: '#f1f5f9', iconColor: '#0f172a', numColor: '#0f172a', labelColor: '#64748b', Icon: FileText, value: stats.total, label: 'Total Applications' },
          { key: 'pending', filter: 'Pending', border: '#fed7aa', iconBg: '#fff7ed', iconColor: '#ea580c', numColor: '#ea580c', labelColor: '#ea580c', Icon: Clock, value: stats.pending, label: 'Pending Approval' },
          { key: 'approved', filter: 'Approved', border: '#bbf7d0', iconBg: '#f0fdf4', iconColor: '#16a34a', numColor: '#16a34a', labelColor: '#16a34a', Icon: CheckCircle2, value: stats.approved, label: 'Approved Presidents' },
          { key: 'rejected', filter: 'Rejected', border: '#fecaca', iconBg: '#fef2f2', iconColor: '#dc2626', numColor: '#dc2626', labelColor: '#dc2626', Icon: XCircle, value: stats.rejected, label: 'Declined' },
        ];
        return (
          <div className="stat-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {cards.map(({ key, filter, border, iconBg, iconColor, numColor, labelColor, Icon, value, label }) => (
              <div
                key={key}
                className="stat-card"
                onClick={filter ? () => setStatusFilter(filter) : undefined}
                style={{ ...cardBase, border: `1px solid ${border}`, cursor: filter ? 'pointer' : 'default' }}
              >
                <div className="stat-icon" style={iconChip(iconBg, iconColor)}>
                  <Icon size={22} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="stat-number" style={numberStyle(numColor)}>{value}</div>
                  <div className="stat-label" style={labelStyle(labelColor)}>{label}</div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Filter Toolbar */}
      <div className="campsite-card" style={{ padding: '16px', marginBottom: '20px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Status Pills */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: '', label: 'All Requests' },
              { id: 'Pending', label: 'Pending' },
              { id: 'Approved', label: 'Approved' },
              { id: 'Rejected', label: 'Rejected' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setStatusFilter(p.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: '600',
                  border: 'none',
                  cursor: 'pointer',
                  background: statusFilter === p.id ? 'var(--color-saffron, #ff9933)' : '#f1f5f9',
                  color: statusFilter === p.id ? '#ffffff' : '#475569',
                  transition: 'all 0.15s ease'
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
            <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search Name, EPIC, Mobile, Booth..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 34px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        {/* Global Jurisdiction Dropdowns (State / Super Admin) */}
        {(isGlobalAdmin || isDistrictAdmin) && (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
            {isGlobalAdmin && (
              <div style={{ flex: 1, minWidth: '180px' }}>
                <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Filter by District</label>
                <select
                  value={districtFilter}
                  onChange={(e) => {
                    setDistrictFilter(e.target.value);
                    setAssemblyFilter('');
                  }}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                >
                  <option value="">All Districts</option>
                  {jurisdictions.districts.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Filter by Assembly</label>
              <select
                value={assemblyFilter}
                onChange={(e) => setAssemblyFilter(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
              >
                <option value="">All Assemblies</option>
                {filteredAssemblyOptions.map(a => (
                  <option key={a.assemblyName} value={a.assemblyName}>{a.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Main Requests Table */}
      <div className="campsite-card" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlgin: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '32px', height: '32px', border: '3px solid #ff9933', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <div style={{ fontSize: '13px', color: '#64748b' }}>Loading Booth President applications...</div>
          </div>
        ) : requests.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
            <ShieldCheck size={36} style={{ color: '#cbd5e1', marginBottom: '8px' }} />
            <div style={{ fontSize: '15px', fontWeight: '600' }}>No Booth President Requests Found</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>There are no applications matching your current filter criteria.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '12px 16px' }}>Applicant</th>
                  <th style={{ padding: '12px 16px' }}>Target Booth & Location</th>
                  <th style={{ padding: '12px 16px' }}>Original Voter Booth</th>
                  <th style={{ padding: '12px 16px' }}>Applied Date</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {/* Applicant */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: '700', color: '#0f172a' }}>{r.voterName}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', gap: '8px', marginTop: '2px' }}>
                        <span><User size={10} style={{ display: 'inline', marginRight: '2px' }} />{r.epicNo}</span>
                        <span><Phone size={10} style={{ display: 'inline', marginRight: '2px' }} />{r.mobile}</span>
                      </div>
                    </td>

                    {/* Target Location */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: '700', color: '#ea580c' }}>
                        Booth {r.boothNo}
                        {r.isCustomBooth && <span style={{ fontSize: '10px', background: '#fff7ed', color: '#ea580c', border: '1px solid #ffedd5', padding: '1px 6px', borderRadius: '10px', marginLeft: '6px' }}>Custom Selection</span>}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                        {r.assemblyName} ({r.district})
                      </div>
                    </td>

                    {/* Original Location */}
                    <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '12px' }}>
                      <div>Booth {r.originalBoothNo || '1'}</div>
                      <div style={{ fontSize: '11px' }}>{r.originalAssembly || r.assemblyName}</div>
                    </td>

                    {/* Date */}
                    <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '12px' }}>
                      {fmtDate(r.appliedAt)}
                    </td>

                    {/* Status */}
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '3px 10px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '700',
                        background: r.status === 'Approved' ? '#f0fdf4' : r.status === 'Rejected' ? '#fef2f2' : '#fff7ed',
                        color: r.status === 'Approved' ? '#16a34a' : r.status === 'Rejected' ? '#dc2626' : '#ea580c',
                        border: `1px solid ${r.status === 'Approved' ? '#bbf7d0' : r.status === 'Rejected' ? '#fecaca' : '#fed7aa'}`
                      }}>
                        {r.status}
                      </span>
                      {r.status === 'Rejected' && r.rejectionReason && (
                        <div style={{ fontSize: '10px', color: '#dc2626', marginTop: '2px', maxWidth: '140px' }} title={r.rejectionReason}>
                          Reason: {r.rejectionReason}
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {r.status !== 'Approved' && (
                          <button
                            onClick={() => handleAction(r._id, 'Approved')}
                            disabled={processingId === r._id}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              border: 'none',
                              background: '#16a34a',
                              color: '#fff',
                              fontSize: '12px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <CheckCircle2 size={12} /> Approve
                          </button>
                        )}

                        {r.status !== 'Rejected' && (
                          <button
                            onClick={() => { setRejectingItem(r); setRejectionReason(''); }}
                            disabled={processingId === r._id}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              border: '1px solid #fecaca',
                              background: '#fff',
                              color: '#dc2626',
                              fontSize: '12px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <XCircle size={12} /> Reject
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              Showing Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> ({totalRequests} requests)
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => fetchRequests(currentPage - 1)}
                disabled={currentPage <= 1}
                style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', opacity: currentPage <= 1 ? 0.5 : 1 }}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => fetchRequests(currentPage + 1)}
                disabled={currentPage >= totalPages}
                style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', opacity: currentPage >= totalPages ? 0.5 : 1 }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Rejection Reason Modal */}
      {rejectingItem && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '420px', maxWidth: '100%', padding: '20px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>
              Reject Booth President Application
            </h3>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>
              Decline application for <strong>{rejectingItem.voterName}</strong> (EPIC: {rejectingItem.epicNo}) for Booth {rejectingItem.boothNo} in {rejectingItem.assemblyName}.
            </div>

            <label style={{ fontSize: '12px', fontWeight: '600', color: '#334155', display: 'block', marginBottom: '4px' }}>
              Reason for Rejection (Optional):
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Applicant lives outside electoral boundary or booth already filled."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button
                onClick={() => setRejectingItem(null)}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '12px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleAction(rejectingItem._id, 'Rejected', rejectionReason)}
                disabled={processingId === rejectingItem._id}
                style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#dc2626', color: '#fff', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BoothPresidentRequestsView;
