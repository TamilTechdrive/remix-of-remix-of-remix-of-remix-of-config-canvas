import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// ===== TOKEN MANAGEMENT =====
let accessToken: string | null = null;
let csrfToken: string | null = null;
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) localStorage.setItem('cf_token', token);
  else localStorage.removeItem('cf_token');
}

export function getAccessToken(): string | null {
  if (!accessToken) accessToken = localStorage.getItem('cf_token');
  return accessToken;
}

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

// ===== CSRF FETCH =====
async function fetchCsrfToken(): Promise<string> {
  const res = await axios.get(`${API_BASE_URL}/csrf-token`, { withCredentials: true });
  csrfToken = res.data.csrfToken;
  return csrfToken!;
}

// ===== REQUEST INTERCEPTOR =====
api.interceptors.request.use(async (config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Attach CSRF token for mutating requests
  if (['post', 'put', 'patch', 'delete'].includes(config.method || '')) {
    if (!csrfToken) await fetchCsrfToken();
    if (csrfToken) config.headers['X-CSRF-Token'] = csrfToken;
  }

  // Attach device fingerprint
  const fp = generateFingerprint();
  if (fp) config.headers['X-Device-Fingerprint'] = fp;

  return config;
});

// ===== RESPONSE INTERCEPTOR (auto-refresh) =====
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url?.includes('/auth/')) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const res = await axios.post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true });
        const newToken = res.data.accessToken;
        setAccessToken(newToken);
        onTokenRefreshed(newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch {
        setAccessToken(null);
        window.location.href = '/login';
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ===== DEVICE FINGERPRINT =====
function generateFingerprint(): string {
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency?.toString() || '',
  ];
  // Simple hash
  let hash = 0;
  const str = components.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// ===== AUTH API =====
export const authApi = {
  register: (data: { email: string; username: string; password: string; displayName?: string }) =>
    api.post('/auth/register', data),

  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', { ...data, deviceFingerprint: generateFingerprint() }),

  logout: () => api.post('/auth/logout'),

  refresh: () => api.post('/auth/refresh'),

  me: () => api.get('/auth/me'),

  changePassword: (data: { currentPassword: string; password: string }) =>
    api.post('/auth/change-password', data),
};

// ===== CONFIG API =====
export const configApi = {
  list: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get('/configurations', { params }),

  get: (id: string, encryptionKey?: string) =>
    api.get(`/configurations/${id}`, {
      headers: encryptionKey ? { 'X-Encryption-Key': encryptionKey } : {},
    }),

  create: (data: { name: string; description?: string; configData: Record<string, unknown>; encrypt?: boolean; encryptionKey?: string }) =>
    api.post('/configurations', data),

  update: (id: string, data: Partial<{ name: string; description: string; configData: Record<string, unknown>; status: string }>) =>
    api.put(`/configurations/${id}`, data),

  delete: (id: string) => api.delete(`/configurations/${id}`),
};

// ===== CONFIG DATA API (nodes/edges/snapshots) =====
export const configDataApi = {
  saveFull: (id: string, data: { nodes: any[]; edges: any[] }) =>
    api.post(`/config-data/${id}/save-full`, data),

  loadFull: (id: string) =>
    api.get(`/config-data/${id}/load-full`),

  createSnapshot: (id: string, data: { name?: string; description?: string }) =>
    api.post(`/config-data/${id}/snapshots`, data),

  listSnapshots: (id: string) =>
    api.get(`/config-data/${id}/snapshots`),

  restoreSnapshot: (configId: string, snapshotId: string) =>
    api.post(`/config-data/${configId}/snapshots/${snapshotId}/restore`),
};

// ===== PROJECT API =====
export const projectApi = {
  list: () => api.get('/projects'),
  get: (id: string) => api.get(`/projects/${id}`),
  create: (data: { name: string; description?: string; tags?: string[] }) =>
    api.post('/projects', data),
  update: (id: string, data: { name?: string; description?: string; tags?: string[]; status?: string }) =>
    api.put(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),

  // STB Models
  createSTBModel: (projectId: string, data: { name: string; description?: string; chipset?: string }) =>
    api.post(`/projects/${projectId}/stb-models`, data),
  updateSTBModel: (modelId: string, data: { name?: string; description?: string; chipset?: string }) =>
    api.put(`/projects/stb-models/${modelId}`, data),
  deleteSTBModel: (modelId: string) =>
    api.delete(`/projects/stb-models/${modelId}`),

  // Builds
  createBuild: (modelId: string, data: { name: string; description?: string; version?: string }) =>
    api.post(`/projects/stb-models/${modelId}/builds`, data),
  updateBuild: (buildId: string, data: { name?: string; description?: string; version?: string; status?: string }) =>
    api.put(`/projects/builds/${buildId}`, data),
  deleteBuild: (buildId: string) =>
    api.delete(`/projects/builds/${buildId}`),

  // Parser config save/load
  saveParserConfig: (buildId: string, data: { parserSessionId?: string; configName: string; nodes: any[]; edges: any[] }) =>
    api.post(`/projects/builds/${buildId}/save-parser-config`, data),
  loadConfig: (configId: string) =>
    api.get(`/projects/configurations/${configId}/full`),
  listBuildConfigs: (buildId: string) =>
    api.get(`/projects/builds/${buildId}/configurations`),
};

// ===== PARSER API =====
export const parserApi = {
  seed: (data?: { jsonData?: any; sessionName?: string }) =>
    api.post('/parser/seed', data || {}),
  listSessions: () =>
    api.get('/parser/sessions'),
  getSession: (id: string) =>
    api.get(`/parser/sessions/${id}`),
  deleteSession: (id: string) =>
    api.delete(`/parser/sessions/${id}`),
  exportSession: (id: string, sheet?: string) =>
    api.get(`/parser/sessions/${id}/export`, { params: { sheet }, responseType: 'blob' }),
};

// ===== USER API =====
export const userApi = {
  list: () => api.get('/users'),
  get: (id: string) => api.get(`/users/${id}`),
  update: (id: string, data: { displayName?: string; isActive?: boolean }) => api.patch(`/users/${id}`, data),
  assignRole: (id: string, roleName: string) => api.post(`/users/${id}/roles`, { roleName }),
  removeRole: (id: string, roleName: string) => api.delete(`/users/${id}/roles/${roleName}`),
  unlock: (id: string) => api.post(`/users/${id}/unlock`),
  devices: (id: string) => api.get(`/users/${id}/devices`),
};

// ===== AUDIT API =====
export const auditApi = {
  list: (params?: { event?: string; severity?: string; page?: number; limit?: number }) =>
    api.get('/audit', { params }),
  dashboard: () => api.get('/audit/dashboard'),
};

export default api;