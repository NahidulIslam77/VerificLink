const TOKEN_KEY = 'verificlink_token';

export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t) => {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
};

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(path, { method = 'GET', body, form, keepalive } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload, keepalive });
  } catch {
    throw new ApiError('Cannot reach the server. Is the backend running?', 0);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }

  if (!res.ok) {
    const detail = data?.detail;
    let message = 'Request failed';
    if (typeof detail === 'string') message = detail;
    else if (Array.isArray(detail)) message = detail.map((d) => d.msg).join('; ');
    else if (detail?.message) message = detail.message;
    if (res.status === 401 && token && !path.startsWith('/auth/login')) onUnauthorized();
    throw new ApiError(message, res.status, detail);
  }
  return data;
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  register: (body) => request('/auth/register', { method: 'POST', body }),
  me: () => request('/auth/me'),

  profile: () => request('/profile/me'),
  updateProfile: (body) => request('/profile/me', { method: 'PATCH', body }),
  candidate: (id) => request(`/candidates/${id}`),
  verify: (id) => request(`/verify/${id}`),

  config: () => request('/assessments/config'),
  history: () => request('/assessments'),
  startSkill: (skill) => request('/assessments/skill', { method: 'POST', body: { skill } }),
  startProject: (body) => request('/assessments/project', { method: 'POST', body }),
  startPaper: (form) => request('/assessments/paper', { method: 'POST', form }),
  assessment: (id) => request(`/assessments/${id}`),
  begin: (id, camera_ok) => request(`/assessments/${id}/begin`, { method: 'POST', body: { camera_ok } }),
  event: (id, type, detail) => request(`/assessments/${id}/events`, { method: 'POST', body: { type, detail }, keepalive: true }),
  submit: (id, answers) => request(`/assessments/${id}/submit`, { method: 'POST', body: { answers } }),

  jobs: (mine = false) => request(`/jobs${mine ? '?mine=true' : ''}`),
  createJob: (body) => request('/jobs', { method: 'POST', body }),
  deleteJob: (id) => request(`/jobs/${id}`, { method: 'DELETE' }),
  matches: (id) => request(`/jobs/${id}/matches`),
  apply: (id) => request(`/jobs/${id}/apply`, { method: 'POST' }),
};
