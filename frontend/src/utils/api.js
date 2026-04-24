import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL
    ? `${process.env.REACT_APP_API_URL}/api`
    : '/api'
});

export const clientsAPI = {
  list:   ()     => api.get('/clients').then(r => r.data),
  get:    (id)   => api.get(`/clients/${id}`).then(r => r.data),
  create: (data) => api.post('/clients', data).then(r => r.data),
  update: (id, data) => api.put(`/clients/${id}`, data).then(r => r.data),
  delete: (id)   => api.delete(`/clients/${id}`).then(r => r.data),
  verify: (id)   => api.post(`/clients/${id}/verify`).then(r => r.data)
};

export const reportsAPI = {
  generate: (data) => api.post('/reports/generate', data).then(r => r.data)
};

export const schedulesAPI = {
  list:   ()     => api.get('/schedules').then(r => r.data),
  create: (data) => api.post('/schedules', data).then(r => r.data),
  update: (id, data) => api.put(`/schedules/${id}`, data).then(r => r.data),
  delete: (id)   => api.delete(`/schedules/${id}`).then(r => r.data)
};

export const jobsAPI = {
  list: (params) => api.get('/jobs', { params }).then(r => r.data)
};

export const backendUrl = (path) => {
  const base = process.env.REACT_APP_API_URL || '';
  return `${base}${path}`;
};

export default api;
