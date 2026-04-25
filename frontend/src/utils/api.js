import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL
    ? `${process.env.REACT_APP_API_URL}/api`
    : '/api'
});

// Attach JWT token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const clientsAPI = {
  list:   ()          => api.get('/clients').then(r => r.data),
  get:    (id)        => api.get(`/clients/${id}`).then(r => r.data),
  create: (data)      => api.post('/clients', data).then(r => r.data),
  update: (id, data)  => api.put(`/clients/${id}`, data).then(r => r.data),
  delete: (id)        => api.delete(`/clients/${id}`).then(r => r.data),
  verify: (id)        => api.post(`/clients/${id}/verify`).then(r => r.data)
};

export const reportsAPI = {
  generate: (data) => api.post('/reports/generate', data).then(r => r.data)
};

export const schedulesAPI = {
  list:   ()          => api.get('/schedules').then(r => r.data),
  create: (data)      => api.post('/schedules', data).then(r => r.data),
  update: (id, data)  => api.put(`/schedules/${id}`, data).then(r => r.data),
  delete: (id)        => api.delete(`/schedules/${id}`).then(r => r.data)
};

export const jobsAPI = {
  list: (params) => api.get('/jobs', { params }).then(r => r.data)
};

export const authAPI = {
  login:          (data) => api.post('/auth/login', data).then(r => r.data),
  me:             ()     => api.get('/auth/me').then(r => r.data),
  updateProfile:  (data) => api.put('/auth/profile', data).then(r => r.data),
  changePassword: (data) => api.put('/auth/password', data).then(r => r.data),
};

export const backendUrl = (filePath) => {
  const base = process.env.REACT_APP_API_URL || '';
  return `${base}${filePath}`;
};

export default api;
