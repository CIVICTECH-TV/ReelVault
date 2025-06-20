import React, { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-shell';
import { TauriCommands, AwsCredentials, AwsConfig, LifecyclePolicyStatus, AppConfig } from '../services/tauriCommands';
import { AWS_REGIONS, DEFAULT_REGION } from '../constants/aws-regions';
import './AuthManager.css';

interface AuthManagerProps {
  config: AppConfig;
  onConfigChange: (path: string, value: any) => void;
  onAuthSuccess: (credentials: AwsCredentials, bucketName: string) => void;
  onAuthError: (error: string) => void;
  onLifecycleStatusChange: (status: LifecyclePolicyStatus | null) => void;
  onHealthStatusChange: (status: { isHealthy: boolean; lastCheck: Date | null }) => void;
}

export const AuthManager: React.FC<AuthManagerProps> = ({
  config,
  onConfigChange,
  onAuthSuccess,
  onAuthError,
  onLifecycleStatusChange,
  onHealthStatusChange
}) => {
  const [credentials, setCredentials] = useState<AwsCredentials>({
    access_key_id: '',
    secret_access_key: '',
    region: DEFAULT_REGION,
    session_token: undefined,
  });
  const [bucketName, setBucketName] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authResult, setAuthResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [lifecycleStatus, setLifecycleStatus] = useState<LifecyclePolicyStatus | null>(null);
  const [isLifecycleLoading, setIsLifecycleLoading] = useState(false);

  useEffect(() => {
    setCredentials(prev => ({ ...prev, ...config.aws_settings }));
    setBucketName(config.user_preferences.default_bucket_name || '');
  }, [config]);

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
    const autoCheckLifecycle = async () => {
      if (bucketName && credentials?.access_key_id && credentials?.secret_access_key && !isLifecycleLoading) {
        await checkLifecycleStatus();
      }
    };
    const timeoutId = setTimeout(autoCheckLifecycle, 1000);
    return () => clearTimeout(timeoutId);
  }, [bucketName, credentials?.access_key_id, credentials?.secret_access_key]);

  const handleOpenCloudFormation = async () => {
    const url = "https://console.aws.amazon.com/cloudformation/home?region=ap-northeast-1#/stacks/create/review?templateURL=https%3A%2F%2Freelvault-template.s3.ap-northeast-1.amazonaws.com%2Freelvault-setup-auto.yaml&stackName=ReelVaultSetup";
    try {
      await open(url);
    } catch (error) {
      console.error("CloudFormationのURLを開く際にエラーが発生しました:", error);
      setAuthResult({ type: 'error', message: "ブラウザでURLを開けませんでした。" });
    }
  };

  const handleInputChange = (field: keyof AwsCredentials, value: string) => {
    const newCredentials = { ...credentials, [field]: value === '' ? undefined : value };
    setCredentials(newCredentials);
    onConfigChange(`aws_settings.${field}`, value);
  };

  const handleBucketNameChange = (value: string) => {
    setBucketName(value);
    onConfigChange('user_preferences.default_bucket_name', value);
  };

  const handleAuthenticate = async () => {
    setIsAuthLoading(true);
    setAuthResult(null);

    try {
      const result = await TauriCommands.authenticateAws(credentials);
      if (result.success) {
        await TauriCommands.saveAwsCredentialsSecure(credentials, 'default');
        onAuthSuccess(credentials, bucketName);
        setAuthResult({ type: 'success', message: 'AWS認証に成功しました！' });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '認証に失敗しました';
      setAuthResult({ type: 'error', message: errorMessage });
      onAuthError(errorMessage);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const getAwsConfigFromCredentials = (): AwsConfig => ({
    access_key_id: credentials.access_key_id,
    secret_access_key: credentials.secret_access_key,
    region: credentials.region,
    bucket_name: bucketName,
  });

  const checkLifecycleStatus = async () => {
    const awsConfig = getAwsConfigFromCredentials();
    if (!awsConfig.bucket_name) return;
    setIsLifecycleLoading(true);
    try {
      const status = await TauriCommands.getLifecycleStatus(awsConfig);
      setLifecycleStatus(status);
      onLifecycleStatusChange(status);
    } catch (err) {
      setAuthResult({ type: 'error', message: 'ライフサイクル状況の取得に失敗しました。' });
      setLifecycleStatus(null);
    } finally {
      setIsLifecycleLoading(false);
    }
  };
  
  const enableReelvaultLifecycle = async () => {
      // 省略
  };

  return (
    <div className="auth-manager-wrapper">
      <div className="card">
        <h3><span className="icon">🚀</span>初期設定</h3>
        <ol className="setup-instructions">
          <li>AWSアカウントがなければ、<a href="https://aws.amazon.com/register/" target="_blank" rel="noopener noreferrer">作成してください</a>。</li>
          <li>必要なリソースを自動作成するので、<button className="link-button" onClick={handleOpenCloudFormation}>ここをクリックしてください</button>。</li>
          <li>AWSアカウントでログインし、すでに読み込まれている設定でスタックを作成します。</li>
          <li>スタックの実行が完了したら、出力に表示されている値を使って以下の設定を進めてください。</li>
        </ol>
      </div>

      <div className="card">
        <h3><span className="icon">🔑</span>手動設定</h3>
        <div className="form-group">
          <label htmlFor="access-key-id">アクセスキーID:</label>
          <input id="access-key-id" type="text" value={credentials.access_key_id} onChange={(e) => handleInputChange('access_key_id', e.target.value)} placeholder="アクセスキーID" />
        </div>
        <div className="form-group">
          <label htmlFor="secret-access-key">シークレットアクセスキー:</label>
          <input id="secret-access-key" type="password" value={credentials.secret_access_key} onChange={(e) => handleInputChange('secret_access_key', e.target.value)} placeholder="シークレットアクセスキー" />
        </div>
        <div className="form-group">
          <label htmlFor="s3-bucket-name">S3バケット名:</label>
          <input id="s3-bucket-name" type="text" value={bucketName} onChange={(e) => handleBucketNameChange(e.target.value)} placeholder="S3バケット名" />
        </div>
        <div className="form-group">
          <label htmlFor="aws-region">AWSリージョン:</label>
          <select id="aws-region" value={credentials.region} onChange={(e) => handleInputChange('region', e.target.value)}>
            {AWS_REGIONS.map((region) => (
              <option key={region.code} value={region.code}>{region.name} ({region.description})</option>
            ))}
          </select>
          <p className="description">（東京から基本的には変更しないでください）</p>
        </div>
        <div className="form-group">
          <button onClick={handleAuthenticate} className="btn-primary" disabled={isAuthLoading}>
            {isAuthLoading ? '認証中...' : 'AWS認証をテストする'}
          </button>
        </div>
        {authResult && (
          <div className={`auth-result ${authResult.type}`}>
            <p>{authResult.message}</p>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
        <h3><span className="icon">🔄</span>ライフサイクル管理</h3>
        {isLifecycleLoading ? (
          <p>状況を確認中...</p>
        ) : lifecycleStatus ? (
          lifecycleStatus.error_message ? (
            <div className="status-card error"><p>⚠️ {lifecycleStatus.error_message}</p></div>
          ) : lifecycleStatus.enabled ? (
            <div className="status-card success">
              <p>
                <strong>ステータス:</strong> ✅ 有効
                <span className="status-divider">|</span>
                <strong>移行日数:</strong> {lifecycleStatus.transition_days}日後
                <span className="status-divider">|</span>
                <strong>移行先:</strong> {lifecycleStatus.storage_class}
              </p>
            </div>
          ) : (
            <div className="status-card warning"><p>ステータス: ❌ 無効</p></div>
          )
        ) : (
          <p>バケットが設定されていません。</p>
        )}
        {!isLifecycleLoading && lifecycleStatus && !lifecycleStatus.enabled && (
          <button onClick={enableReelvaultLifecycle} className="btn-primary" disabled={isLifecycleLoading}>
            ReelVault推奨ライフサイクルを有効化
          </button>
        )}
      </div>
    </div>
  );
};
