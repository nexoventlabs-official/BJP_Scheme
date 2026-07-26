import React from 'react';
import { useAuth } from '../context/AuthContext';

import AdminLoginPage from './admin/AdminLoginPage';
import SuperAdminDashboard from './admin/SuperAdminDashboard';
import StateAdminDashboard from './admin/StateAdminDashboard';
import DistrictAdminDashboard from './admin/DistrictAdminDashboard';
import AssemblyAdminDashboard from './admin/AssemblyAdminDashboard';
import BoothAdminDashboard from './admin/BoothAdminDashboard';

const AdminPortal = () => {
  const { admin } = useAuth();

  if (!admin) {
    return <AdminLoginPage />;
  }

  switch (admin.role) {
    case 'SUPER_ADMIN':
      return <SuperAdminDashboard />;
    case 'STATE_ADMIN':
      return <StateAdminDashboard />;
    case 'DISTRICT_ADMIN':
      return <DistrictAdminDashboard />;
    case 'ASSEMBLY_ADMIN':
      return <AssemblyAdminDashboard />;
    case 'BOOTH_ADMIN':
      return <BoothAdminDashboard />;
    default:
      return <StateAdminDashboard />;
  }
};

export default AdminPortal;
