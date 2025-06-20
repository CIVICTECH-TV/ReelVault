import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { AppConfig, AwsCredentials, AppState, LifecyclePolicyStatus, TauriCommands } from '../services/tauriCommands';
import { DEFAULT_REGION } from '../constants/aws-regions';
import { UploadManager } from './UploadManager';
import { Sidebar } from './Sidebar';
import { AuthManager } from './AuthManager';
import { StatusManager } from './StatusManager';
import { RestoreTab } from './tabs/RestoreTab';
import './ConfigManager.css';

interface ConfigManagerProps {
  initialConfig: AppConfig;
  initialState: AppState;
  onConfigChange: (config: AppConfig) => void;
  onStateChange: (state: AppState) => void;
  onAuthSuccess: () => void;
}

export interface ConfigManagerRef {
  openSettingsTab: () => void;
}

type ActiveTab = 'status' | 'auth' | 'restore' | 'upload';

export const ConfigManager = forwardRef<ConfigManagerRef, ConfigManagerProps>(({ 
  initialConfig,
  initialState,
  onConfigChange,
  onStateChange,
}, ref) => {
  const [config, setConfig] = useState<AppConfig>(initialConfig);
  const [appState, setAppState] = useState<AppState>(initialState);
  const [appVersion, setAppVersion] = useState<string>('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('status');
  
  const [credentials, setCredentials] = useState<AwsCredentials>({
    access_key_id: '',
    secret_access_key: '',
    region: DEFAULT_REGION,
    session_token: undefined,
  });

  const [bucketName, setBucketName] = useState('');

  // This state is managed here but primarily used by StatusTab.
  const [lifecycleStatus, setLifecycleStatus] = useState<LifecyclePolicyStatus | null>(null);
  const [isLifecycleHealthy, setIsLifecycleHealthy] = useState<boolean>(true);
  const [lastHealthCheck, setLastHealthCheck] = useState<Date | null>(null);

  useImperativeHandle(ref, () => ({
    openSettingsTab: () => {
      setActiveTab('auth');
    }
  }));

  useEffect(() => {
    setConfig(initialConfig);
    setBucketName(initialConfig.user_preferences.default_bucket_name || '');
  }, [initialConfig]);

  useEffect(() => {
    setAppState(initialState);
  }, [initialState]);

  useEffect(() => {
    const loadSavedCredentials = async () => {
      try {
        const savedCredentials = await TauriCommands.loadAwsCredentialsSecure('default');
        setCredentials(savedCredentials);
      } catch (err) {
        console.log('保存された認証情報がありません。');
      }
    };
    loadSavedCredentials();
  }, []);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion('不明'));
  }, []);

  const updateConfigValue = (path: string, value: any) => {
    const newConfig = JSON.parse(JSON.stringify(config));
    let current = newConfig;
    const keys = path.split('.');
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    setConfig(newConfig);
    onConfigChange(newConfig);
  };
  
  const handleTestAuth = () => {
    alert("認証テストは設定タブから実行してください。");
  };

  const handleAuthSuccess = (credentials: AwsCredentials, bucketName: string) => {
    setCredentials(credentials);
    setBucketName(bucketName);
    updateConfigValue('aws_settings.access_key_id', credentials.access_key_id);
    updateConfigValue('aws_settings.secret_access_key', credentials.secret_access_key);
    updateConfigValue('aws_settings.region', credentials.region);
    updateConfigValue('user_preferences.default_bucket_name', bucketName);
  };

  const handleAuthError = (error: string) => {
    console.error('認証エラー:', error);
  };

  const handleLifecycleStatusChange = (status: LifecyclePolicyStatus | null) => {
    setLifecycleStatus(status);
  };

  const handleHealthStatusChange = (status: { isHealthy: boolean; lastCheck: Date | null }) => {
    setIsLifecycleHealthy(status.isHealthy);
    setLastHealthCheck(status.lastCheck);
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'status':
        return <StatusManager 
                  config={config}
                  appState={appState}
                  appVersion={appVersion}
                  lifecycleStatus={lifecycleStatus}
                  isLifecycleHealthy={isLifecycleHealthy}
                  lastHealthCheck={lastHealthCheck}
                  updateConfigValue={updateConfigValue}
                />;
      case 'auth':
        return (
          <AuthManager
            config={config}
            onConfigChange={updateConfigValue}
            onAuthSuccess={handleAuthSuccess}
            onAuthError={handleAuthError}
            onLifecycleStatusChange={handleLifecycleStatusChange}
            onHealthStatusChange={handleHealthStatusChange}
          />
        );
      case 'upload':
        return (
          <UploadManager
            config={config}
            onConfigChange={updateConfigValue}
            onStateChange={onStateChange}
            onError={(msg) => console.error(msg)}
            onSuccess={(msg) => console.log(msg)}
          />
        );
      case 'restore':
        return <RestoreTab config={config} credentials={credentials} />;
      default:
        return <div>不明なタブ</div>;
    }
  };

  return (
    <div className="two-column-layout">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} appVersion={appVersion} />
      <main className="main-content">
        {renderActiveTab()}
      </main>
    </div>
  );
});