import axios from 'axios';

const API = axios.create({
  baseURL: '/api'
});

// Interceptor to attach User or Admin JWT token
API.interceptors.request.use((config) => {
  const userToken = localStorage.getItem('bjp_user_token');
  const adminToken = localStorage.getItem('bjp_admin_token');

  if (config.url?.startsWith('/admin') && adminToken) {
    config.headers.Authorization = `Bearer ${adminToken}`;
  } else if (userToken) {
    config.headers.Authorization = `Bearer ${userToken}`;
  }

  return config;
}, (error) => {
  return Promise.reject(error);
});

export default API;
