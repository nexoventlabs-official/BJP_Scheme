import React, { createContext, useContext, useState, useEffect } from 'react';
import API from '../utils/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('bjp_user_data');
    return saved ? JSON.parse(saved) : null;
  });
  const [userToken, setUserToken] = useState(() => localStorage.getItem('bjp_user_token') || null);

  const [admin, setAdmin] = useState(() => {
    const saved = localStorage.getItem('bjp_admin_data');
    return saved ? JSON.parse(saved) : null;
  });
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem('bjp_admin_token') || null);

  const [referredByCode, setReferredByCode] = useState(() => localStorage.getItem('bjp_referred_by') || '');

  // Capture URL referral link (?ref=BJP-XXXX-YYYY)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      localStorage.setItem('bjp_referred_by', ref);
      setReferredByCode(ref);
    }
  }, []);

  const loginUser = (userData, token) => {
    setUser(userData);
    setUserToken(token);
    localStorage.setItem('bjp_user_data', JSON.stringify(userData));
    localStorage.setItem('bjp_user_token', token);
  };

  const logoutUser = () => {
    setUser(null);
    setUserToken(null);
    localStorage.removeItem('bjp_user_data');
    localStorage.removeItem('bjp_user_token');
  };

  const loginAdmin = (adminData, token) => {
    setAdmin(adminData);
    setAdminToken(token);
    localStorage.setItem('bjp_admin_data', JSON.stringify(adminData));
    localStorage.setItem('bjp_admin_token', token);
  };

  const logoutAdmin = () => {
    setAdmin(null);
    setAdminToken(null);
    localStorage.removeItem('bjp_admin_data');
    localStorage.removeItem('bjp_admin_token');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userToken,
        admin,
        adminToken,
        referredByCode,
        loginUser,
        logoutUser,
        loginAdmin,
        logoutAdmin
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
