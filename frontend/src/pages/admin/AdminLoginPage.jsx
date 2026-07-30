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
    <div style={{
      minHeight: '80vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      width: '100%',
      boxSizing: 'border-box',
      backgroundColor: 'var(--color-canvas)'
    }}>
      <div className="campsite-card" style={{
        maxWidth: '440px',
        width: '100%',
        padding: '48px 40px',
        boxSizing: 'border-box',
        borderRadius: '28px',
        backgroundColor: '#ffffff',
        border: 'none',
        boxShadow: 'none'
      }}>
        
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '980px',
            background: 'var(--color-canvas)',
            color: 'var(--color-electric-blue)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 18px'
          }}>
            <Shield size={28} />
          </div>
          <h2 style={{
            fontFamily: 'var(--font-sf-pro-display)',
            fontSize: '32px',
            fontWeight: '600',
            color: 'var(--color-primary-ink)',
            margin: 0,
            letterSpacing: '0.007em'
          }}>
            Admin Portal
          </h2>
          <p style={{
            fontSize: '17px',
            color: 'var(--color-mid-gray)',
            marginTop: '8px',
            lineHeight: '1.4'
          }}>
            Sign in to access your administrative workspace
          </p>
        </div>

        {loginError && (
          <div className="tag-pill tag-error" style={{
            width: '100%',
            borderRadius: '980px',
            padding: '10px 16px',
            marginBottom: '20px',
            justifyContent: 'center',
            boxSizing: 'border-box'
          }}>
            {loginError}
          </div>
        )}

        <form onSubmit={handleAdminLogin}>
          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label className="form-label">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              className="form-control"
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label">Password / Passcode</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="form-control"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-filled"
            style={{ width: '100%', marginTop: '8px', padding: '13px' }}
            disabled={loginLoading}
          >
            {loginLoading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

      </div>
    </div>
  );
};

export default AdminLoginPage;
