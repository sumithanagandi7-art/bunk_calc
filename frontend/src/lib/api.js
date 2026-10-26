import axios from 'axios';

const getBaseURL = () => {
  // 1. User manual override stored in browser
  const saved = typeof window !== 'undefined' ? localStorage.getItem('bunkcalc_api_url') : null;
  if (saved && saved.trim()) {
    const clean = saved.trim().replace(/\/+$/, '');
    return clean.endsWith('/api/v1') ? clean : `${clean}/api/v1`;
  }

  // 2. Build-time environment variable
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl.trim()) {
    const clean = envUrl.trim().replace(/\/+$/, '');
    return clean.endsWith('/api/v1') ? clean : `${clean}/api/v1`;
  }

  // 3. If running deployed in the cloud (not on localhost), point to Render backend
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return 'https://bunk-calculator-api.onrender.com/api/v1';
  }

  // 4. Default for local Vite dev proxy
  return '/api/v1';
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
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

// Response interceptor — validate JSON and redirect to /access on 401
api.interceptors.response.use(
  (response) => {
    // If an HTML document was returned instead of JSON (common when Vercel rewrites 404 to index.html)
    if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
      return Promise.reject(new Error('Backend server is still waking up or unreachable. Please try again in a few seconds.'));
    }
    return response;
  },
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
