import axios from 'axios';

const rawBase = import.meta.env.VITE_API_URL || '';
const baseURL = rawBase
  ? (rawBase.endsWith('/api/v1') ? rawBase : `${rawBase.replace(/\/+$/, '')}/api/v1`)
  : '/api/v1';

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 90000, // 90s timeout for LLM Vision AI processing
});

// Request interceptor — attach Bearer token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — redirect to /auth on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('workspace');
      window.location.href = '/access';
    }
    return Promise.reject(error);
  }
);

export default api;
