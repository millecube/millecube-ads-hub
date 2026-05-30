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
  verify:        (id)          => api.post(`/clients/${id}/verify`).then(r => r.data),
  assignClient:  (id, userIds) => api.put(`/clients/${id}/assign`, { userIds }).then(r => r.data),
  getAssigned:   ()            => api.get('/clients/assigned').then(r => r.data),
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

export const monitorAPI = {
  overview:     (params)            => api.get('/monitor/overview', { params }).then(r => r.data),
  client:       (id, params)        => api.get(`/monitor/${id}`, { params }).then(r => r.data),
  audience:     (id, params)        => api.get(`/monitor/${id}/audience`, { params }).then(r => r.data),
  diagnose:     (id, body)          => api.post(`/monitor/${id}/diagnose`, body).then(r => r.data),
  actions:      (id)                => api.get(`/monitor/${id}/actions`).then(r => r.data),
  addAction:    (id, body)          => api.post(`/monitor/${id}/actions`, body).then(r => r.data),
  updateAction: (actionId, body)    => api.put(`/monitor/actions/${actionId}`, body).then(r => r.data),
  addReply:     (actionId, body)    => api.post(`/monitor/actions/${actionId}/replies`, body).then(r => r.data),
};

export const jobsAPI = {
  list:   (params) => api.get('/jobs', { params }).then(r => r.data),
  delete: (id)     => api.delete(`/jobs/${id}`).then(r => r.data),
};

export const authAPI = {
  login:          (data) => api.post('/auth/login', data).then(r => r.data),
  me:             ()     => api.get('/auth/me').then(r => r.data),
  updateProfile:  (data) => api.put('/auth/profile', data).then(r => r.data),
  changePassword: (data) => api.put('/auth/password', data).then(r => r.data),
  listUsers:      ()     => api.get('/auth/users').then(r => r.data),
  createUser:     (data) => api.post('/auth/users', data).then(r => r.data),
  deleteUser:     (id)   => api.delete(`/auth/users/${id}`).then(r => r.data),
  forgotPassword: (email)            => api.post('/auth/forgot-password', { email }).then(r => r.data),
  resetPassword:  (token, password)  => api.post('/auth/reset-password', { token, password }).then(r => r.data),
};

export const budgetAPI = {
  overview:  ()                        => api.get('/budget').then(r => r.data),
  getClient: (clientId)                => api.get(`/budget/${clientId}`).then(r => r.data),
  upsert:    (clientId, month, data)   => api.post(`/budget/${clientId}/${month}`, data).then(r => r.data),
  confirm:   (clientId, month)         => api.post(`/budget/${clientId}/${month}/confirm`).then(r => r.data),
  unconfirm: (clientId, month)         => api.post(`/budget/${clientId}/${month}/unconfirm`).then(r => r.data),
  setEditors:(clientId, userIds)       => api.put(`/clients/${clientId}/budget-editors`, { userIds }).then(r => r.data),
};

export const performanceAPI = {
  table:  (params) => api.get('/performance/table', { params }).then(r => r.data),
  toggle: (data)   => api.post('/performance/toggle', data).then(r => r.data),
};

export const compareAPI = {
  fetch:          (params)            => api.get('/compare', { params }).then(r => r.data),
  getSettings:    ()                  => api.get('/compare/settings').then(r => r.data),
  saveSettings:   (clientId, weights) => api.put(`/compare/settings/${clientId}`, { weights }).then(r => r.data),
  updateBudget:   (data)              => api.patch('/compare/budget', data).then(r => r.data),
};

export const prefsAPI = {
  get:  ()     => api.get('/preferences').then(r => r.data),
  save: (data) => api.put('/preferences', data).then(r => r.data),
};

export const settingsAPI = {
  get:         ()              => api.get('/settings').then(r => r.data),
  getPublic:   ()              => api.get('/settings/public').then(r => r.data),
  uploadLogo:  (logo, name)    => api.post('/settings/logo', { logo, logoName: name }).then(r => r.data),
  deleteLogo:  ()              => api.delete('/settings/logo').then(r => r.data),
};

export const backendUrl = (filePath) => {
  const base = process.env.REACT_APP_API_URL || '';
  return `${base}${filePath}`;
};

export default api;
