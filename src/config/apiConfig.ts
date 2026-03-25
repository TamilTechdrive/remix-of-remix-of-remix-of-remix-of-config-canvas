/**
 * API Configuration - Backend switching and security flags
 * 
 * VITE_API_BACKEND: 'node' | 'php' — which backend to use
 * VITE_SECURITY_ENABLED: 'true' | 'false' — enable/disable JWT auth
 */

export type ApiBackend = 'node' | 'php';

// Read from env or localStorage override
function getBackendFlag(): ApiBackend {
  const override = localStorage.getItem('cf_api_backend');
  if (override === 'node' || override === 'php') return override;
  const env = import.meta.env.VITE_API_BACKEND;
  if (env === 'php') return 'php';
  return 'node';
}

function getSecurityFlag(): boolean {
  const override = localStorage.getItem('cf_security_enabled');
  if (override === 'false') return false;
  if (override === 'true') return true;
  const env = import.meta.env.VITE_SECURITY_ENABLED;
  if (env === 'false') return false;
  return true; // default: enabled
}

export const apiConfig = {
  get backend(): ApiBackend {
    return getBackendFlag();
  },
  get securityEnabled(): boolean {
    return getSecurityFlag();
  },
  get baseUrl(): string {
    if (this.backend === 'php') {
      return import.meta.env.VITE_PHP_API_URL || 'http://localhost:8080/api';
    }
    return import.meta.env.VITE_NODE_API_URL || import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
  },

  setBackend(backend: ApiBackend) {
    localStorage.setItem('cf_api_backend', backend);
    // Force page reload to reinitialize axios instance
    window.location.reload();
  },

  setSecurityEnabled(enabled: boolean) {
    localStorage.setItem('cf_security_enabled', String(enabled));
    window.location.reload();
  },
};
