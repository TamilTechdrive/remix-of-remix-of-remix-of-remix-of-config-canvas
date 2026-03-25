import { useState } from 'react';
import { apiConfig, type ApiBackend } from '@/config/apiConfig';
import { Server, Shield, ToggleLeft, ToggleRight } from 'lucide-react';

const ApiSettingsPanel = () => {
  const [backend, setBackend] = useState<ApiBackend>(apiConfig.backend);
  const [securityEnabled, setSecurityEnabled] = useState(apiConfig.securityEnabled);

  const handleBackendSwitch = (newBackend: ApiBackend) => {
    if (newBackend !== backend) {
      setBackend(newBackend);
      apiConfig.setBackend(newBackend);
    }
  };

  const handleSecurityToggle = () => {
    const newVal = !securityEnabled;
    setSecurityEnabled(newVal);
    apiConfig.setSecurityEnabled(newVal);
  };

  return (
    <div className="p-4 rounded-xl bg-secondary/50 border border-border space-y-4">
      <div className="flex items-center gap-2">
        <Server className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">API Settings</span>
      </div>

      {/* Backend Toggle */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Backend API</label>
        <div className="flex gap-2">
          <button
            onClick={() => handleBackendSwitch('node')}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
              backend === 'node'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-secondary/50 text-muted-foreground border-border hover:bg-secondary'
            }`}
          >
            Node.js (4000)
          </button>
          <button
            onClick={() => handleBackendSwitch('php')}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
              backend === 'php'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-secondary/50 text-muted-foreground border-border hover:bg-secondary'
            }`}
          >
            PHP (8080)
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Current: <span className="font-mono text-foreground">{apiConfig.baseUrl}</span>
        </p>
      </div>

      {/* Security Toggle */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Security (JWT Auth)</label>
        <button
          onClick={handleSecurityToggle}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
            securityEnabled
              ? 'bg-green-500/10 text-green-400 border-green-500/30'
              : 'bg-orange-500/10 text-orange-400 border-orange-500/30'
          }`}
        >
          <span className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5" />
            {securityEnabled ? 'Security Enabled' : 'Security Disabled (Open Access)'}
          </span>
          {securityEnabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
        </button>
        <p className="text-[10px] text-muted-foreground">
          {securityEnabled
            ? 'JWT authentication, CSRF protection, and device fingerprinting are active.'
            : 'No authentication required. All API calls bypass security. Use for development only.'}
        </p>
      </div>
    </div>
  );
};

export default ApiSettingsPanel;
