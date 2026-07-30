import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);
const THIRTY_MINUTES_MS = 30 * 60 * 1000; // 30 minutes inactivity limit

export const AuthProvider = ({ children }) => {
  const isExpired = () => {
    const lastActive = localStorage.getItem('bjp_last_activity');
    if (!lastActive) return false;
    return Date.now() - parseInt(lastActive, 10) > THIRTY_MINUTES_MS;
  };

  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(() => isExpired());

  const [user, setUser] = useState(() => {
    if (isExpired()) {
      localStorage.removeItem('bjp_user_data');
      localStorage.removeItem('bjp_user_token');
      return null;
    }
    const saved = localStorage.getItem('bjp_user_data');
    return saved ? JSON.parse(saved) : null;
  });
  const [userToken, setUserToken] = useState(() => {
    if (isExpired()) return null;
    return localStorage.getItem('bjp_user_token') || null;
  });

  const [admin, setAdmin] = useState(() => {
    if (isExpired()) {
      localStorage.removeItem('bjp_admin_data');
      localStorage.removeItem('bjp_admin_token');
      return null;
    }
    const saved = localStorage.getItem('bjp_admin_data');
    return saved ? JSON.parse(saved) : null;
  });
  const [adminToken, setAdminToken] = useState(() => {
    if (isExpired()) return null;
    return localStorage.getItem('bjp_admin_token') || null;
  });

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
    setSessionExpiredNotice(false);
    localStorage.setItem('bjp_user_data', JSON.stringify(userData));
    localStorage.setItem('bjp_user_token', token);
    localStorage.setItem('bjp_last_activity', Date.now().toString());
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
    setSessionExpiredNotice(false);
    localStorage.setItem('bjp_admin_data', JSON.stringify(adminData));
    localStorage.setItem('bjp_admin_token', token);
    localStorage.setItem('bjp_last_activity', Date.now().toString());
  };

  const logoutAdmin = (expired = false) => {
    setAdmin(null);
    setAdminToken(null);
    if (expired) setSessionExpiredNotice(true);
    localStorage.removeItem('bjp_admin_data');
    localStorage.removeItem('bjp_admin_token');
    localStorage.removeItem('bjp_last_activity');
  };

  // ── 30-Minute Inactivity Auto-Logout Tracker ──
  useEffect(() => {
    if (!admin && !user) return;

    // Record activity timestamp
    const recordActivity = () => {
      localStorage.setItem('bjp_last_activity', Date.now().toString());
    };

    // Initialize activity timestamp on login if not set
    if (!localStorage.getItem('bjp_last_activity')) {
      recordActivity();
    }

    // Throttle activity updates to at most once every 3 seconds to preserve performance
    let lastRecordTime = 0;
    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastRecordTime > 3000) {
        lastRecordTime = now;
        recordActivity();
      }
    };

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    activityEvents.forEach(evt => window.addEventListener(evt, handleUserActivity, { passive: true }));

    // Check inactivity every 10 seconds
    const interval = setInterval(() => {
      const lastActiveStr = localStorage.getItem('bjp_last_activity');
      if (lastActiveStr) {
        const elapsed = Date.now() - parseInt(lastActiveStr, 10);
        if (elapsed >= THIRTY_MINUTES_MS) {
          if (admin) logoutAdmin(true);
          if (user) logoutUser();
        }
      }
    }, 10000);

    return () => {
      activityEvents.forEach(evt => window.removeEventListener(evt, handleUserActivity));
      clearInterval(interval);
    };
  }, [admin, user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        userToken,
        admin,
        adminToken,
        referredByCode,
        sessionExpiredNotice,
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

