import React, { useState, useEffect } from 'react';
import API from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import MaxtonDashboardLayout from '../../components/MaxtonDashboardLayout';

const LIMIT = 20;

const BoothAdminDashboard = () => {
  const { admin } = useAuth();
  const [subPage, setSubPage] = useState('dashboard');
  const [statsData, setStatsData] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const [voters, setVoters] = useState([]);
  const [loadingVoters, setLoadingVoters] = useState(false);
  const [totalVoters, setTotalVoters] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [districtFilter, setDistrictFilter] = useState(admin?.district || '');
  const [assemblyFilter, setAssemblyFilter] = useState(admin?.assemblyName || '');
  const [boothFilter, setBoothFilter] = useState(admin?.boothNo || '');

  const [selectedVoterTimeline, setSelectedVoterTimeline] = useState(null);

  const fetchStats = async () => {
    try {
      setLoadingStats(true);
      const params = new URLSearchParams({
        district: admin?.district || '',
        assemblyName: admin?.assemblyName || '',
        boothNo: admin?.boothNo || ''
      });
      const res = await API.get(`/admin/dashboard-stats?${params}`);
      if (res.data.success) setStatsData(res.data);
    } catch (err) {
      console.error('Error loading stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchVoters = async (page = 1) => {
    try {
      setLoadingVoters(true);
      const params = new URLSearchParams({
        page, limit: LIMIT,
        district: admin?.district || '',
        assemblyName: admin?.assemblyName || '',
        boothNo: admin?.boothNo || '',
        ...(searchQuery && { search: searchQuery }),
        ...(statusFilter && { status: statusFilter })
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

  useEffect(() => {
    fetchStats();
    fetchVoters(1);
  }, [statusFilter, searchQuery]);

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

  return (
    <MaxtonDashboardLayout
      roleTitle={`Polling Booth ${admin?.boothNo || ''} Portal`}
      roleBadge="BOOTH ADMIN"
      activeScopeText={`Booth ${admin?.boothNo || ''} (${admin?.assemblyName || ''}, ${admin?.district || ''})`}
      statsData={statsData}
      loadingStats={loadingStats}
      voters={voters}
      loadingVoters={loadingVoters}
      totalVoters={totalVoters}
      totalPages={totalPages}
      currentPage={currentPage}
      onPageChange={(pg) => { setCurrentPage(pg); fetchVoters(pg); }}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      statusFilter={statusFilter}
      setStatusFilter={setStatusFilter}
      districtFilter={districtFilter}
      setDistrictFilter={setDistrictFilter}
      assemblyFilter={assemblyFilter}
      setAssemblyFilter={setAssemblyFilter}
      boothFilter={boothFilter}
      setBoothFilter={setBoothFilter}
      districts={[admin?.district].filter(Boolean)}
      assemblies={[admin?.assemblyName].filter(Boolean)}
      booths={[admin?.boothNo].filter(Boolean)}
      onRefresh={() => { fetchStats(); fetchVoters(1); }}
      handleUpdateAppStatus={handleUpdateAppStatus}
      handleDirectCallVoter={handleDirectCallVoter}
      selectedVoterTimeline={selectedVoterTimeline}
      setSelectedVoterTimeline={setSelectedVoterTimeline}
      districtCredentials={[]}
      assemblyCredentials={[]}
      boothCredentialsData={null}
      selectedAssemblyNo="1"
      setSelectedAssemblyNo={() => {}}
      assembliesList={[]}
      fetchBoothCredentials={() => {}}
      subPage={subPage}
      setSubPage={setSubPage}
    />
  );
};

export default BoothAdminDashboard;
