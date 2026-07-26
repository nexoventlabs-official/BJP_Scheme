import React, { useState } from 'react';
import API from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { Shield } from 'lucide-react';

const AdminLoginPage = () => {
  const { loginAdmin } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const handleAdminLogin = async (e) => {
    if (e) e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      const res = await API.post('/admin/login', { username: username.trim(), password: password.trim() });
      if (res.data.success) {
        loginAdmin(res.data.admin, res.data.token);
      }
    } catch (err) {
      setLoginError(err.response?.data?.message || 'Invalid admin credentials');
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', width: '100%', boxSizing: 'border-box' }}>
      <div className="campsite-card" style={{ maxWidth: '420px', width: '100%', padding: '36px', boxSizing: 'border-box' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '9999px',
            background: 'var(--color-fog-gray)',
            color: 'var(--color-midnight-ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px'
          }}>
            <Shield size={24} />
          </div>
          <h2 className="text-heading" style={{ margin: 0 }}>
            Admin Portal
          </h2>
          <p className="text-subheading" style={{ fontSize: '14px', marginTop: '6px' }}>
            Sign in to access your administrative workspace
          </p>
        </div>

        {loginError && (
          <div className="tag-pill tag-error" style={{ width: '100%', borderRadius: '8px', padding: '8px 12px', marginBottom: '16px' }}>
            {loginError}
          </div>
        )}

        <form onSubmit={handleAdminLogin}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="form-control"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password / Passcode</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="form-control"
              required
            />
          </div>

          <button type="submit" className="btn btn-filled" style={{ width: '100%', marginTop: '10px' }} disabled={loginLoading}>
            {loginLoading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

      </div>
    </div>
  );
};

export default AdminLoginPage;
