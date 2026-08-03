import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api'
});

// Interceptor to attach User or Admin JWT token
API.interceptors.request.use((config) => {
  const userToken = localStorage.getItem('bjp_user_token');
  const adminToken = localStorage.getItem('bjp_admin_token');

  const token = (config.url?.startsWith('/admin') && adminToken) ? adminToken : userToken;
  if (token) {
    if (typeof config.headers?.set === 'function') {
      config.headers.set('Authorization', `Bearer ${token}`);
    } else {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  return config;
}, (error) => {
  return Promise.reject(error);
});

export default API;
