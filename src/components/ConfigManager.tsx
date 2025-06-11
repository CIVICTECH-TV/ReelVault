import React, { useState, useEffect } from 'react';
import { TauriCommands, AppConfig, ConfigValidationResult } from '../types/tauri-commands';
import './ConfigManager.css';

interface ConfigManagerProps {
  onConfigChange?: (config: AppConfig) => void;
}

export const ConfigManager: React.FC<ConfigManagerProps> = ({ onConfigChange }) => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [validation, setValidation] = useState<ConfigValidationResult | null>(null);
  const [activeTab, setActiveTab] = useState<'app' | 'user' | 'aws'>('app');

  // 設定を読み込み
  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const loadedConfig = await TauriCommands.getConfig();
      setConfig(loadedConfig);
      onConfigChange?.(loadedConfig);
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 設定を保存
  const saveConfig = async () => {
    if (!config) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      await TauriCommands.setConfig(config);
      setSuccess('設定を保存しました');
      onConfigChange?.(config);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // 設定をリセット
  const resetConfig = async () => {
    if (!confirm('設定をデフォルトに戻しますか？この操作は元に戻せません。')) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const defaultConfig = await TauriCommands.resetConfig();
      setConfig(defaultConfig);
      setSuccess('設定をリセットしました');
      onConfigChange?.(defaultConfig);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定のリセットに失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // 設定を検証
  const validateConfig = async () => {
    try {
      const result = await TauriCommands.validateConfigFile();
      setValidation(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定の検証に失敗しました');
    }
  };

  // バックアップ作成
  const createBackup = async () => {
    try {
      const backupPath = await TauriCommands.backupConfig();
      setSuccess(`バックアップを作成しました: ${backupPath}`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'バックアップの作成に失敗しました');
    }
  };

  // 最近使用したファイルをクリア
  const clearRecentFiles = async () => {
    if (!confirm('最近使用したファイルの履歴をクリアしますか？')) {
      return;
    }

    try {
      const updatedConfig = await TauriCommands.clearRecentFiles();
      setConfig(updatedConfig);
      setSuccess('最近使用したファイルをクリアしました');
      onConfigChange?.(updatedConfig);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ファイル履歴のクリアに失敗しました');
    }
  };

  // 設定値を更新
  const updateConfigValue = (path: string, value: any) => {
    if (!config) return;

    const keys = path.split('.');
    const newConfig = JSON.parse(JSON.stringify(config));
    
    let current = newConfig;
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;

    setConfig(newConfig);
  };

  useEffect(() => {
    loadConfig();
  }, []);

  if (loading) {
    return (
      <div className="config-manager loading">
        <div className="loading-spinner"></div>
        <p>設定を読み込み中...</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="config-manager error">
        <p>設定を読み込めませんでした</p>
        <button onClick={loadConfig}>再試行</button>
      </div>
    );
  }

  return (
    <div className="config-manager">
      <div className="config-header">
        <h2>⚙️ アプリケーション設定</h2>
        <div className="config-actions">
          <button onClick={validateConfig} className="btn-secondary">
            🔍 検証
          </button>
          <button onClick={createBackup} className="btn-secondary">
            💾 バックアップ
          </button>
          <button onClick={resetConfig} className="btn-warning">
            🔄 リセット
          </button>
          <button 
            onClick={saveConfig} 
            disabled={saving}
            className="btn-primary"
          >
            {saving ? '保存中...' : '💾 保存'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>❌ {error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          <span>✅ {success}</span>
          <button onClick={() => setSuccess(null)}>×</button>
        </div>
      )}

      {validation && (
        <div className={`validation-result ${validation.valid ? 'valid' : 'invalid'}`}>
          <h4>{validation.valid ? '✅ 設定は有効です' : '❌ 設定に問題があります'}</h4>
          {validation.errors.length > 0 && (
            <div className="validation-errors">
              <strong>エラー:</strong>
              <ul>
                {validation.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          {validation.warnings.length > 0 && (
            <div className="validation-warnings">
              <strong>警告:</strong>
              <ul>
                {validation.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="config-tabs">
        <button 
          className={`tab ${activeTab === 'app' ? 'active' : ''}`}
          onClick={() => setActiveTab('app')}
        >
          🖥️ アプリ設定
        </button>
        <button 
          className={`tab ${activeTab === 'user' ? 'active' : ''}`}
          onClick={() => setActiveTab('user')}
        >
          👤 ユーザー設定
        </button>
        <button 
          className={`tab ${activeTab === 'aws' ? 'active' : ''}`}
          onClick={() => setActiveTab('aws')}
        >
          ☁️ AWS設定
        </button>
      </div>

      <div className="config-content">
        {activeTab === 'app' && (
          <div className="config-section">
            <h3>アプリケーション設定</h3>
            
            <div className="config-group">
              <label>
                <input
                  type="checkbox"
                  checked={config.app_settings.auto_save}
                  onChange={(e) => updateConfigValue('app_settings.auto_save', e.target.checked)}
                />
                自動保存を有効にする
              </label>
            </div>

            <div className="config-group">
              <label>
                <input
                  type="checkbox"
                  checked={config.app_settings.backup_enabled}
                  onChange={(e) => updateConfigValue('app_settings.backup_enabled', e.target.checked)}
                />
                バックアップを有効にする
              </label>
            </div>

            <div className="config-group">
              <label>ログレベル:</label>
              <select
                value={config.app_settings.log_level}
                onChange={(e) => updateConfigValue('app_settings.log_level', e.target.value)}
              >
                <option value="error">Error</option>
                <option value="warn">Warning</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
                <option value="trace">Trace</option>
              </select>
            </div>

            <div className="config-group">
              <label>テーマ:</label>
              <select
                value={config.app_settings.theme}
                onChange={(e) => updateConfigValue('app_settings.theme', e.target.value)}
              >
                <option value="light">ライト</option>
                <option value="dark">ダーク</option>
                <option value="auto">自動</option>
              </select>
            </div>

            <div className="config-group">
              <label>言語:</label>
              <select
                value={config.app_settings.language}
                onChange={(e) => updateConfigValue('app_settings.language', e.target.value)}
              >
                <option value="ja">日本語</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        )}

        {activeTab === 'user' && (
          <div className="config-section">
            <h3>ユーザー設定</h3>
            
            <div className="config-group">
              <label>デフォルトバケット名:</label>
              <input
                type="text"
                value={config.user_preferences.default_bucket_name || ''}
                onChange={(e) => updateConfigValue('user_preferences.default_bucket_name', e.target.value || null)}
                placeholder="バケット名を入力"
              />
            </div>

            <div className="config-group">
              <label>デフォルトストレージクラス:</label>
              <select
                value={config.user_preferences.default_storage_class}
                onChange={(e) => updateConfigValue('user_preferences.default_storage_class', e.target.value)}
              >
                <option value="STANDARD">Standard</option>
                <option value="STANDARD_IA">Standard-IA</option>
                <option value="ONEZONE_IA">One Zone-IA</option>
                <option value="GLACIER">Glacier</option>
                <option value="DEEP_ARCHIVE">Deep Archive</option>
              </select>
            </div>

            <div className="config-group">
              <label>
                <input
                  type="checkbox"
                  checked={config.user_preferences.compression_enabled}
                  onChange={(e) => updateConfigValue('user_preferences.compression_enabled', e.target.checked)}
                />
                圧縮を有効にする
              </label>
            </div>

            <div className="config-group">
              <label>
                <input
                  type="checkbox"
                  checked={config.user_preferences.notification_enabled}
                  onChange={(e) => updateConfigValue('user_preferences.notification_enabled', e.target.checked)}
                />
                通知を有効にする
              </label>
            </div>

            <div className="config-group">
              <label>最近使用したファイル ({config.user_preferences.recent_files.length}件):</label>
              <div className="recent-files">
                {config.user_preferences.recent_files.map((file, index) => (
                  <div key={index} className="recent-file">
                    <span>{file}</span>
                  </div>
                ))}
                {config.user_preferences.recent_files.length === 0 && (
                  <p className="no-files">最近使用したファイルはありません</p>
                )}
                <button onClick={clearRecentFiles} className="btn-warning">
                  履歴をクリア
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'aws' && (
          <div className="config-section">
            <h3>AWS設定</h3>
            
            <div className="config-group">
              <label>デフォルトリージョン:</label>
              <select
                value={config.aws_settings.default_region}
                onChange={(e) => updateConfigValue('aws_settings.default_region', e.target.value)}
              >
                <option value="us-east-1">US East (N. Virginia)</option>
                <option value="us-west-2">US West (Oregon)</option>
                <option value="ap-northeast-1">Asia Pacific (Tokyo)</option>
                <option value="ap-northeast-2">Asia Pacific (Seoul)</option>
                <option value="eu-west-1">Europe (Ireland)</option>
                <option value="eu-central-1">Europe (Frankfurt)</option>
              </select>
            </div>

            <div className="config-group">
              <label>タイムアウト (秒):</label>
              <input
                type="number"
                min="1"
                max="3600"
                value={config.aws_settings.timeout_seconds}
                onChange={(e) => updateConfigValue('aws_settings.timeout_seconds', parseInt(e.target.value))}
              />
            </div>

            <div className="config-group">
              <label>最大リトライ回数:</label>
              <input
                type="number"
                min="0"
                max="10"
                value={config.aws_settings.max_retries}
                onChange={(e) => updateConfigValue('aws_settings.max_retries', parseInt(e.target.value))}
              />
            </div>

            <div className="config-group">
              <label>プロファイル名:</label>
              <input
                type="text"
                value={config.aws_settings.profile_name || ''}
                onChange={(e) => updateConfigValue('aws_settings.profile_name', e.target.value || null)}
                placeholder="プロファイル名を入力（オプション）"
              />
            </div>
          </div>
        )}
      </div>

      <div className="config-info">
        <p>設定バージョン: {config.version}</p>
        <p>設定は自動的にアプリケーションデータディレクトリに保存されます</p>
      </div>
    </div>
  );
}; 