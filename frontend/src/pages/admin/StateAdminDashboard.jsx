import React, { useState, useEffect } from 'react';
import API from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import MaxtonDashboardLayout from '../../components/MaxtonDashboardLayout';

const LIMIT = 20;

const StateAdminDashboard = () => {
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
  const [districtFilter, setDistrictFilter] = useState('');
  const [assemblyFilter, setAssemblyFilter] = useState('');
  const [boothFilter, setBoothFilter] = useState('');

  const [districts, setDistricts] = useState([]);
  const [assemblies, setAssemblies] = useState([]);
  const [booths, setBooths] = useState([]);

  const [districtCredentials, setDistrictCredentials] = useState([]);
  const [assemblyCredentials, setAssemblyCredentials] = useState([]);
  const [assembliesList, setAssembliesList] = useState([]);
  const [selectedAssemblyNo, setSelectedAssemblyNo] = useState('1');
  const [boothCredentialsData, setBoothCredentialsData] = useState(null);

  const [selectedVoterTimeline, setSelectedVoterTimeline] = useState(null);

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

  const fetchStats = async () => {
    try {
      setLoadingStats(true);
      const params = new URLSearchParams({
        ...(districtFilter && { district: districtFilter }),
        ...(assemblyFilter && { assemblyName: assemblyFilter }),
        ...(boothFilter && { boothNo: boothFilter })
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
        ...(searchQuery && { search: searchQuery }),
        ...(statusFilter && { status: statusFilter }),
        ...(districtFilter && { district: districtFilter }),
        ...(assemblyFilter && { assemblyName: assemblyFilter }),
        ...(boothFilter && { boothNo: boothFilter })
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

  const fetchLoginsAndCreds = async () => {
    try {
      const [assRes, distCredRes, assCredRes] = await Promise.all([
        API.get('/admin/jurisdiction-assemblies'),
        API.get('/admin/jurisdiction-district-credentials'),
        API.get('/admin/jurisdiction-assembly-credentials')
      ]);
      if (assRes.data.success) setAssembliesList(assRes.data.assemblies || []);
      if (distCredRes.data.success) setDistrictCredentials(distCredRes.data.districts || []);
      if (assCredRes.data.success) setAssemblyCredentials(assCredRes.data.assemblies || []);
    } catch (err) {
      console.error('Error loading logins:', err);
    }
  };

  const fetchBoothCredentials = async (assemblyNo) => {
    try {
      const res = await API.get(`/admin/assembly-booth-credentials?assemblyNo=${assemblyNo}`);
      if (res.data.success) setBoothCredentialsData(res.data.data);
    } catch (err) {
      console.error('Error loading booth credentials:', err);
    }
  };

  useEffect(() => {
    fetchInitialMeta();
    fetchLoginsAndCreds();
    fetchBoothCredentials(selectedAssemblyNo);
  }, []);

  useEffect(() => {
    fetchStats();
    fetchVoters(1);
    setCurrentPage(1);
  }, [districtFilter, assemblyFilter, boothFilter, statusFilter, searchQuery]);

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
      roleTitle="State Admin Governance Portal"
      roleBadge="STATE ADMIN"
      activeScopeText="Statewide Tamil Nadu Governance"
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
      districts={districts}
      assemblies={assemblies}
      booths={booths}
      onRefresh={() => { fetchStats(); fetchVoters(1); }}
      handleUpdateAppStatus={handleUpdateAppStatus}
      handleDirectCallVoter={handleDirectCallVoter}
      selectedVoterTimeline={selectedVoterTimeline}
      setSelectedVoterTimeline={setSelectedVoterTimeline}
      districtCredentials={districtCredentials}
      assemblyCredentials={assemblyCredentials}
      boothCredentialsData={boothCredentialsData}
      selectedAssemblyNo={selectedAssemblyNo}
      setSelectedAssemblyNo={setSelectedAssemblyNo}
      assembliesList={assembliesList}
      fetchBoothCredentials={fetchBoothCredentials}
      subPage={subPage}
      setSubPage={setSubPage}
    />
  );
};

export default StateAdminDashboard;
