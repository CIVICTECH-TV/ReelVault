import React, { useState, useEffect } from 'react';
import { 
  TauriCommands, 
  AppConfig, 
  AppState,
  ConfigValidationResult,
  AwsCredentials,
  AwsAuthResult,
  PermissionCheck
} from '../types/tauri-commands';
import { AWS_REGIONS, DEFAULT_REGION } from '../constants/aws-regions';
import './ConfigManager.css';

interface ConfigManagerProps {
  initialConfig: AppConfig;
  initialState: AppState;
  onConfigChange: (config: AppConfig) => void;
  onStateChange: (state: AppState) => void;
  onAuthSuccess: () => void;
}

type ActiveTab = 'status' | 'api_test' | 'auth' | 'app' | 'aws_settings';

export const ConfigManager: React.FC<ConfigManagerProps> = ({ 
  initialConfig,
  initialState,
  onConfigChange, 
  onStateChange,
  onAuthSuccess 
}) => {
  const [config, setConfig] = useState<AppConfig>(initialConfig);
  const [appState, setAppState] = useState<AppState>(initialState);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [validation, setValidation] = useState<ConfigValidationResult | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('status');

  // 未保存の変更追跡
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [originalConfig, setOriginalConfig] = useState<AppConfig>(initialConfig);

  // API Test State
  const [testResults, setTestResults] = useState<string[]>([]);

  // 開発者モード（隠しAPIテストメニュー用）
  const [isDeveloperMode, setIsDeveloperMode] = useState(false);

  // --- AWS Auth State ---
  const [credentials, setCredentials] = useState<AwsCredentials>({
    access_key_id: '',
    secret_access_key: '',
    region: DEFAULT_REGION,
    session_token: undefined,
  });
  const [authResult, setAuthResult] = useState<AwsAuthResult | null>(null);
  const [permissionCheck, setPermissionCheck] = useState<PermissionCheck | null>(null);
  const [bucketName, setBucketName] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    console.log('初期設定更新:', initialConfig); // デバッグ用ログ
    setConfig(initialConfig);
    setOriginalConfig(initialConfig);
    setHasUnsavedChanges(false);
  }, [initialConfig]);

  useEffect(() => {
    setAppState(initialState);
  }, [initialState]);

  // アプリ起動時にdefaultプロファイルから認証情報を自動読み込み
  useEffect(() => {
    const loadSavedCredentials = async () => {
      try {
        const savedCredentials = await TauriCommands.loadAwsCredentialsSecure('default');
        setCredentials(savedCredentials);
      } catch (err) {
        // 保存された認証情報がない場合は無視（初回起動時など）
        console.log('保存された認証情報がありません（初回起動時は正常）');
      }
    };
    
    loadSavedCredentials();
  }, []);

  // 設定変更を検知
  useEffect(() => {
    // 初期化時はスキップ
    if (!config || !originalConfig) {
      console.log('初期化中のためスキップ'); // デバッグ用ログ
      return;
    }
    
    const currentStr = JSON.stringify(config);
    const originalStr = JSON.stringify(originalConfig);
    const hasChanges = currentStr !== originalStr;
    
    console.log('設定変更検知:', { 
      current: currentStr.substring(0, 100), 
      original: originalStr.substring(0, 100),
      hasChanges: hasChanges
    }); // デバッグ用ログ
    
    if (hasChanges) {
      console.log('未保存変更を検知しました'); // デバッグ用ログ
      setHasUnsavedChanges(true);
    } else {
      console.log('変更なし'); // デバッグ用ログ
      setHasUnsavedChanges(false);
    }
  }, [config, originalConfig]);

  // 設定を保存
  const saveConfig = async () => {
    if (!config) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      // 保存前に設定を検証
      const validationResult = await validateCurrentConfig();
      if (!validationResult.valid) {
        setValidation(validationResult);
        setError(`設定に問題があるため保存できません: ${validationResult.errors.join(', ')}`);
        return;
      }

      // 警告がある場合は表示するが保存は続行
      if (validationResult.warnings.length > 0) {
        setValidation(validationResult);
      }

      await TauriCommands.setConfig(config);
      setSuccess('設定を保存しました');
      onConfigChange(config);
      
      // 保存後は未保存状態をリセット
      setOriginalConfig(config);
      setHasUnsavedChanges(false);
      
      // 警告のみの場合は検証結果を自動で消す
      if (validationResult.warnings.length > 0) {
        setTimeout(() => setValidation(null), 5000);
      }
      
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
      onConfigChange(defaultConfig);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定のリセットに失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // 内部的な設定検証（保存時・インポート時に使用）
  const validateCurrentConfig = async (): Promise<ConfigValidationResult> => {
    if (!config) {
      throw new Error('設定が読み込まれていません');
    }

    try {
      const result = await TauriCommands.validateConfig(config);
      return result;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '設定の検証に失敗しました');
    }
  };



  // 設定エクスポート
  const exportConfig = async () => {
    try {
      const exportPath = await TauriCommands.exportConfig();
      setSuccess(`設定をエクスポートしました: ${exportPath}`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定のエクスポートに失敗しました');
    }
  };

  // 設定インポート（ファイル内容直接読み取り）
  const importConfig = async () => {
    try {
      console.log('インポートボタンがクリックされました'); // デバッグ用ログ
      
      // HTML5 file input を使用
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.multiple = false;
      
      input.onchange = async (event: any) => {
        console.log('ファイルが選択されました'); // デバッグ用ログ
        
        const file = event.target.files[0];
        if (!file) {
          console.log('ファイルが選択されていません');
          return;
        }
        
        console.log('選択されたファイル:', file.name); // デバッグ用ログ
        
        try {
          // ファイル内容を直接読み取り
          const fileContent = await file.text();
          console.log('ファイル内容読み取り完了'); // デバッグ用ログ
          
          // JSONとして解析
          const importedConfig = JSON.parse(fileContent);
          console.log('JSON解析成功:', importedConfig); // デバッグ用ログ
          
          // インポートした設定を一時的に適用して検証
          const currentConfig = config;
          setConfig(importedConfig);
          
          try {
            // インポートした設定を検証
            const validationResult = await validateCurrentConfig();
            if (!validationResult.valid) {
              // 無効な設定の場合は元に戻す
              setConfig(currentConfig);
              setValidation(validationResult);
              setError(`インポートされた設定に問題があります: ${validationResult.errors.join(', ')}`);
              return;
            }

            // 警告がある場合は表示
            if (validationResult.warnings.length > 0) {
              setValidation(validationResult);
              setTimeout(() => setValidation(null), 5000);
            }

            // 設定を適用
            setSuccess(`設定をインポートしました (${file.name})`);
            onConfigChange(importedConfig);
            
            // インポート後は未保存状態をリセット
            setOriginalConfig(importedConfig);
            setHasUnsavedChanges(false);
            
            setTimeout(() => setSuccess(null), 3000);
            
          } catch (validationError) {
            // 検証エラーの場合は元の設定に戻す
            setConfig(currentConfig);
            setError('インポートした設定の検証に失敗しました');
          }
          
        } catch (err) {
          console.error('インポートエラー:', err); // デバッグ用ログ
          if (err instanceof SyntaxError) {
            setError('JSONファイルの形式が正しくありません');
          } else {
            setError(err instanceof Error ? err.message : 'ファイルの読み込みに失敗しました');
          }
        }
      };
      
      console.log('ファイルダイアログを表示します'); // デバッグ用ログ
      input.click();
      
    } catch (err) {
      console.error('ファイル選択エラー:', err); // デバッグ用ログ
      setError(err instanceof Error ? err.message : 'ファイル選択に失敗しました');
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
      onConfigChange(updatedConfig);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ファイル履歴のクリアに失敗しました');
    }
  };

  // 設定値を更新
  const updateConfigValue = (path: string, value: any) => {
    if (!config) return;

    console.log(`設定値更新: ${path} = ${value}`); // デバッグ用ログ
    console.log('現在のoriginalConfig:', originalConfig); // デバッグ用ログ

    const keys = path.split('.');
    const newConfig = JSON.parse(JSON.stringify(config));
    
    let current = newConfig;
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;

    console.log('更新後の設定:', newConfig); // デバッグ用ログ
    console.log('設定が変更されたか?:', JSON.stringify(newConfig) !== JSON.stringify(originalConfig)); // デバッグ用ログ
    
    setConfig(newConfig);
    // 親コンポーネントに通知はするが、未保存状態をマークするのはuseEffectで行う
    // onConfigChange(newConfig);
  };

  // --- API Test Handlers ---
  const addTestResult = (message: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const clearTestResults = () => {
    setTestResults([]);
  };

  const testFileOperations = async () => {
    try {
      const homeDir = "/Users"; // macOS想定
      const files = await TauriCommands.listFiles(homeDir);
      addTestResult(`✅ ファイル一覧取得: ${files.length}個のファイル/フォルダ`);
      
      if (files.length > 0) {
        const firstFile = files[0];
        const fileInfo = await TauriCommands.getFileInfo(firstFile.path);
        addTestResult(`✅ ファイル詳細取得: ${fileInfo.name} (${fileInfo.size} bytes)`);
      }
    } catch (error) {
      addTestResult(`❌ ファイル操作エラー: ${error}`);
    }
  };

  const testAwsOperations = async () => {
    if (!config) {
      addTestResult("❌ 設定が読み込まれていません");
      return;
    }
    // 注意: このテストはまだ不完全です。実際の認証情報を使用する必要があります。
    addTestResult("ℹ️ AWS操作テストは現在モックデータを使用しています。");
  };

  const testConfigOperations = async () => {
    try {
      const updateResult = await TauriCommands.updateConfig({
        "user_preferences.notification_enabled": !config.user_preferences.notification_enabled
      });
      addTestResult(`✅ 設定更新完了`);
      setConfig(updateResult);
      onConfigChange(updateResult);

      const validation = await TauriCommands.validateConfigFile();
      addTestResult(`✅ 設定検証: ${validation.valid ? "有効" : "無効"}`);
    } catch (error) {
      addTestResult(`❌ 設定操作エラー: ${error}`);
    }
  };
  
  const testStateOperations = async () => {
    try {
      const newWatchingState = !appState.is_watching;
      await TauriCommands.updateAppState({ field: "is_watching", value: newWatchingState });
      addTestResult(`✅ 監視状態更新: ${newWatchingState ? "ON" : "OFF"}`);

      const systemStats = await TauriCommands.updateSystemStats();
      addTestResult(`✅ システム統計更新: ディスク容量 ${systemStats.disk_space_gb}GB`);
      
      const newState = await TauriCommands.getAppState();
      setAppState(newState);
      onStateChange(newState);
    } catch (error) {
      addTestResult(`❌ 状態操作エラー: ${error}`);
    }
  };

  // --- AWS Auth Handlers ---
  const handleInputChange = (field: keyof AwsCredentials, value: string) => {
    setCredentials(prev => ({
      ...prev,
      [field]: value === '' ? undefined : value,
    }));
  };

  const handleAuthenticate = async () => {
    setIsAuthLoading(true);
    setAuthError(null);
    setAuthResult(null);
    setPermissionCheck(null);

    try {
      const result = await TauriCommands.authenticateAws(credentials);
      setAuthResult(result);
      if (result.success) {
        // 認証成功時に自動的にdefaultプロファイルで保存
        try {
          await TauriCommands.saveAwsCredentialsSecure(credentials, 'default');
        } catch (saveErr) {
          console.warn('認証情報の保存に失敗しました:', saveErr);
          // 保存失敗は警告のみで、認証成功は継続
        }
        onAuthSuccess();
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : '認証に失敗しました');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleTestBucketAccess = async () => {
    if (!bucketName) {
      setAuthError('バケット名を入力してください');
      return;
    }

    setIsAuthLoading(true);
    setAuthError(null);

    try {
      const result = await TauriCommands.testS3BucketAccess(credentials, bucketName);
      setPermissionCheck(result);
      
      // S3バケットアクセステストが成功した場合、自動的にデフォルトバケット名として保存
      if (result.allowed) {
        console.log(`S3バケットアクセステスト成功: ${bucketName} をデフォルトバケット名として保存します`);
        
        // デフォルトバケット名を更新
        updateConfigValue('user_preferences.default_bucket_name', bucketName);
        
        // 設定を自動保存（バックグラウンドで実行）
        try {
          await TauriCommands.setConfig({
            ...config,
            user_preferences: {
              ...config.user_preferences,
              default_bucket_name: bucketName
            }
          });
          
          // 親コンポーネントにも設定変更を通知
          onConfigChange({
            ...config,
            user_preferences: {
              ...config.user_preferences,
              default_bucket_name: bucketName
            }
          });
          
          console.log(`デフォルトバケット名「${bucketName}」を自動保存しました`);
          
          // 成功メッセージを表示（3秒後に自動消去）
          setSuccess(`✅ バケットアクセステスト成功！デフォルトバケット名「${bucketName}」を自動保存しました。`);
          setTimeout(() => setSuccess(null), 3000);
          
        } catch (saveError) {
          console.error('デフォルトバケット名の自動保存に失敗:', saveError);
          // 保存エラーの場合は警告として表示（致命的ではない）
          setAuthError(`バケットアクセスは成功しましたが、設定の自動保存に失敗しました: ${saveError instanceof Error ? saveError.message : '不明なエラー'}`);
        }
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'バケットアクセステストに失敗しました');
    } finally {
      setIsAuthLoading(false);
    }
  };



  if (saving) {
    return (
      <div className="config-manager loading">
        <div className="loading-spinner"></div>
        <p>設定を保存中...</p>
      </div>
    );
  }

  return (
    <div className="config-manager">
      <div className="config-header">
        <h2>ReelVault</h2>
        <div className="config-actions">
          <button onClick={exportConfig} className="btn-secondary">
            📤 エクスポート
          </button>
          <button onClick={importConfig} className="btn-secondary">
            📥 インポート
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

      {hasUnsavedChanges && (
        <div className="alert alert-warning">
          <span>⚠️ 設定が変更されています。保存してください。</span>
          <button onClick={saveConfig} className="btn-primary" style={{marginLeft: '10px'}}>
            💾 保存
          </button>
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

      <div className="main-layout">
        <div className="config-tabs">
          <button 
            className={`tab ${activeTab === 'status' ? 'active' : ''}`}
            onClick={() => setActiveTab('status')}
          >
            📊 状態
          </button>
          <button 
            className={`tab ${activeTab === 'app' ? 'active' : ''}`}
            onClick={() => setActiveTab('app')}
          >
            🖥️ アプリ設定
          </button>
          <button 
            className={`tab ${activeTab === 'auth' ? 'active' : ''}`}
            onClick={() => setActiveTab('auth')}
          >
            🔐 AWS認証
          </button>
          <button 
            className={`tab ${activeTab === 'aws_settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('aws_settings')}
          >
            ☁️ AWS設定
          </button>
          <button 
            className={`tab ${activeTab === 'api_test' ? 'active' : ''}`}
            onClick={() => setActiveTab('api_test')}
          >
            🧪 APIテスト
          </button>
        </div>

        <div className="config-content">
          {activeTab === 'status' && (
            <div className="status-container">
              <div className="section">
                <h2>⚙️ 重要な設定サマリー</h2>
                <div className="config-display">
                  <p><strong>🪣 デフォルトBucket:</strong> {config.user_preferences.default_bucket_name || "未設定"}</p>
                  <p><strong>🗂️ ストレージクラス:</strong> {config.user_preferences.default_storage_class}</p>
                  <p><strong>🌍 AWSリージョン:</strong> {config.aws_settings.default_region}</p>
                  <p><strong>⏱️ タイムアウト:</strong> {config.aws_settings.timeout_seconds}秒</p>
                  <p><strong>🏷️ アプリバージョン:</strong> {config.version}</p>
                </div>
              </div>

              <div className="section">
                <h2>🚦 システム状態</h2>
                <div className="state-display">
                  <p><strong>👁️ ファイル監視:</strong> {appState.is_watching ? "🟢 実行中" : "🔴 停止中"}</p>
                  <p><strong>☁️ AWS接続:</strong> {appState.system_status.aws_connected ? "🟢 接続済み" : "🔴 未接続"}</p>
                  <p><strong>🌐 ネットワーク:</strong> {appState.system_status.network_available ? "🟢 利用可能" : "🔴 利用不可"}</p>
                  <p><strong>⏰ 最終ヘルスチェック:</strong> {new Date(appState.system_status.last_heartbeat).toLocaleString()}</p>
                </div>
              </div>

              <div className="section">
                <h2>📊 パフォーマンス</h2>
                <div className="performance-display">
                  <p><strong>💾 ディスク容量:</strong> {appState.system_status.disk_space_gb.toFixed(1)}GB</p>
                  <p><strong>🧠 メモリ使用量:</strong> {appState.system_status.memory_usage_mb.toFixed(0)}MB</p>
                  <p><strong>⚡ CPU使用率:</strong> {appState.system_status.cpu_usage_percent.toFixed(1)}%</p>
                </div>
              </div>

              <div className="section">
                <h2>📈 アップロード統計</h2>
                <div className="statistics-display">
                  <p><strong>📤 キュー内:</strong> {appState.upload_queue.length}個のファイル</p>
                  <p><strong>✅ 成功:</strong> {appState.statistics.successful_uploads}件</p>
                  <p><strong>❌ 失敗:</strong> {appState.statistics.failed_uploads}件</p>
                  <p><strong>📈 総転送量:</strong> {(appState.statistics.total_bytes_uploaded / (1024 * 1024 * 1024)).toFixed(2)}GB</p>
                  <p><strong>🏎️ 平均速度:</strong> {appState.statistics.average_upload_speed_mbps.toFixed(2)}Mbps</p>
                </div>
              </div>

              <div className="section">
                <h2>🔧 機能設定</h2>
                <div className="features-display">
                  <p><strong>🔔 通知:</strong> {config.user_preferences.notification_enabled ? "🟢 有効" : "🔴 無効"}</p>
                  <p><strong>📦 圧縮:</strong> {config.user_preferences.compression_enabled ? "🟢 有効" : "🔴 無効"}</p>
                  <p><strong>💾 自動保存:</strong> {config.app_settings.auto_save ? "🟢 有効" : "🔴 無効"}</p>
                  <p><strong>🛡️ バックアップ:</strong> {config.app_settings.backup_enabled ? "🟢 有効" : "🔴 無効"}</p>
                  <p><strong>📂 最近のファイル:</strong> {config.user_preferences.recent_files.length}件保存</p>
                  <p><strong>📄 ログレベル:</strong> {config.app_settings.log_level}</p>
                  <p><strong>🎨 UIテーマ:</strong> {config.app_settings.theme}</p>
                </div>
              </div>

              {appState.upload_queue.length > 0 && (
                <div className="section">
                  <h2>📤 アップロードキュー ({appState.upload_queue.length}件)</h2>
                  <div className="upload-queue">
                    {appState.upload_queue.slice(0, 5).map((item) => (
                      <div key={item.id} className="queue-item">
                        <p><strong>📄 {item.file_name}</strong></p>
                        <p>サイズ: {(item.file_size / (1024 * 1024)).toFixed(2)}MB | 状態: {item.status} | 進捗: {item.progress}%</p>
                      </div>
                    ))}
                    {appState.upload_queue.length > 5 && (
                      <p className="queue-more">...他 {appState.upload_queue.length - 5}件</p>
                    )}
                  </div>
                </div>
              )}

              {appState.current_uploads.length > 0 && (
                <div className="section">
                  <h2>⚡ 現在のアップロード</h2>
                  <div className="current-uploads">
                    {appState.current_uploads.map((upload) => (
                      <div key={upload.item_id} className="upload-progress">
                        <p><strong>進行中:</strong> {upload.percentage.toFixed(1)}%</p>
                        <p>速度: {upload.speed_mbps.toFixed(2)}Mbps | 残り時間: {upload.eta_seconds ? `${Math.round(upload.eta_seconds)}秒` : '計算中'}</p>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{width: `${upload.percentage}%`}}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {appState.last_error && (
                <div className="section">
                  <h2>⚠️ 最近のエラー</h2>
                  <div className="error-display">
                    <p className="error-message">{appState.last_error}</p>
                  </div>
                </div>
              )}
            </div>
          )}
          {activeTab === 'app' && (
            <div className="config-section">
              <h3>アプリケーション設定</h3>
              
              <div className="config-group centered-field">
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

              <div className="config-group centered-field">
                <label>テーマ:</label>
                <select
                  value={config.app_settings.theme}
                  onChange={(e) => updateConfigValue('app_settings.theme', e.target.value)}
                >
                  <option value="dark">ダーク</option>
                  <option value="light">ライト</option>
                  <option value="auto">自動</option>
                </select>
              </div>

              <div className="config-group">
                <div className="settings-group-container">
                  <div className="setting-row">
                    <label htmlFor="auto-save-toggle">自動保存を有効にする</label>
                    <label className="toggle-switch">
                      <input 
                        id="auto-save-toggle"
                        type="checkbox" 
                        checked={config.app_settings.auto_save}
                        onChange={(e) => updateConfigValue('app_settings.auto_save', e.target.checked)} 
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                  <div className="setting-row">
                    <label htmlFor="backupSwitch">バックアップを有効にする</label>
                    <label className="toggle-switch">
                      <input 
                        id="backupSwitch"
                        type="checkbox" 
                        checked={config.app_settings.backup_enabled}
                        onChange={(e) => updateConfigValue('app_settings.backup_enabled', e.target.checked)} 
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="danger-zone">
                <h4>危険な操作</h4>
                <p>以下の操作は元に戻せません。実行する前に、内容をよく確認してください。</p>
                <div className="danger-actions">
                    <button onClick={resetConfig} className="btn-danger">
                      🔄 設定をリセット
                    </button>
                </div>
              </div>

            </div>
          )}
          {activeTab === 'auth' && (
            <div className="config-section">
              <h3>AWS認証</h3>
              {authError && (
                <div className="alert alert-error">
                  <span>❌ {authError}</span>
                  <button onClick={() => setAuthError(null)}>×</button>
                </div>
              )}



              <div className="config-group centered-field">
                <label htmlFor="accessKeyId">アクセスキーID:</label>
                <input
                  id="accessKeyId"
                  type="text"
                  value={credentials.access_key_id}
                  onChange={(e) => handleInputChange('access_key_id', e.target.value)}
                  placeholder="AKIA..."
                  autoComplete="username"
                />
              </div>

              <div className="config-group centered-field">
                <label htmlFor="secretAccessKey">シークレットアクセスキー:</label>
                <input
                  id="secretAccessKey"
                  type="password"
                  value={credentials.secret_access_key}
                  onChange={(e) => handleInputChange('secret_access_key', e.target.value)}
                  placeholder="シークレットアクセスキーを入力"
                  autoComplete="current-password"
                />
              </div>

              <div className="config-group centered-field">
                <label htmlFor="region">AWSリージョン:</label>
                <select
                  id="region"
                  value={credentials.region}
                  onChange={(e) => handleInputChange('region', e.target.value)}
                >
                  {AWS_REGIONS.map(region => (
                    <option key={region.code} value={region.code}>
                      {region.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="config-group centered-field">
                <label htmlFor="sessionToken">セッショントークン (任意):</label>
                <input
                  id="sessionToken"
                  type="password"
                  value={credentials.session_token || ''}
                  onChange={(e) => handleInputChange('session_token', e.target.value)}
                  placeholder="一時的な認証情報の場合に入力"
                />
              </div>
              
              <div className="config-group centered-field">
                <button 
                  onClick={handleAuthenticate}
                  disabled={isAuthLoading || !credentials.access_key_id || !credentials.secret_access_key}
                  className="btn-primary"
                >
                  {isAuthLoading ? '認証中...' : '🔐 AWS認証'}
                </button>
              </div>


              {authResult && (
                <div className={`auth-result ${authResult.success ? 'success' : 'failure'}`}>
                  <h3>認証結果</h3>
                  <p><strong>ステータス:</strong> {authResult.success ? '✅ 成功' : '❌ 失敗'}</p>
                  <p><strong>メッセージ:</strong> {authResult.message}</p>
                  
                  {authResult.user_identity && (
                    <div className="user-identity">
                      <h4>ユーザーID</h4>
                      <p><strong>User ID:</strong> {authResult.user_identity.user_id}</p>
                      <p><strong>ARN:</strong> {authResult.user_identity.arn}</p>
                      <p><strong>アカウント:</strong> {authResult.user_identity.account}</p>
                    </div>
                  )}

                  {authResult.permissions.length > 0 && (
                    <div className="permissions">
                      <h4>権限</h4>
                      <ul>
                        {authResult.permissions.map((perm, index) => (
                          <li key={index}>{perm}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {authResult.success && (
                    <div className="config-group centered-field">
                      <label htmlFor="bucketName">S3バケット名:</label>
                      <input
                        id="bucketName"
                        type="text"
                        value={bucketName}
                        onChange={(e) => setBucketName(e.target.value)}
                        placeholder="テストするバケット名を入力"
                      />
                      <button
                        onClick={handleTestBucketAccess}
                        disabled={isAuthLoading || !bucketName}
                        className="btn-success"
                      >
                        {isAuthLoading ? 'テスト中...' : 'アクセスをテスト'}
                      </button>
                    </div>
                  )}
                   {permissionCheck && (
                      <div className={`permission-result ${permissionCheck.allowed ? 'allowed' : 'denied'}`}>
                        <h4>テスト結果</h4>
                        <p>
                          {permissionCheck.allowed
                            ? `✅ バケット「${bucketName}」へのアクセスは許可されています。`
                            : `❌ バケット「${bucketName}」へのアクセスは拒否されました。`}
                        </p>
                        {permissionCheck.error && (
                          <p><strong>エラー:</strong> {permissionCheck.error}</p>
                        )}
                      </div>
                    )}
                </div>
              )}
            </div>
          )}
          {activeTab === 'aws_settings' && (
            <div className="config-section">
              <h3>AWS設定</h3>
              
              <div className="config-group centered-field">
                <label>デフォルトバケット名:</label>
                <input
                  type="text"
                  value={config.user_preferences.default_bucket_name || ''}
                  onChange={(e) => updateConfigValue('user_preferences.default_bucket_name', e.target.value || null)}
                  placeholder="バケット名を入力"
                />
              </div>

              <div className="config-group centered-field">
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

              <div className="config-group centered-field">
                <label>タイムアウト (秒):</label>
                <input
                  type="number"
                  min="1"
                  max="3600"
                  value={config.aws_settings.timeout_seconds}
                  onChange={(e) => updateConfigValue('aws_settings.timeout_seconds', parseInt(e.target.value))}
                />
              </div>

              <div className="config-group centered-field">
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
                <div className="settings-group-container">
                  <div className="setting-row">
                    <label htmlFor="compressionSwitch">圧縮を有効にする</label>
                    <label className="toggle-switch">
                      <input 
                        id="compressionSwitch"
                        type="checkbox" 
                        checked={config.user_preferences.compression_enabled}
                        onChange={(e) => updateConfigValue('user_preferences.compression_enabled', e.target.checked)} 
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                  <div className="setting-row">
                    <label htmlFor="notificationSwitch">通知を有効にする</label>
                    <label className="toggle-switch">
                      <input 
                        id="notificationSwitch"
                        type="checkbox" 
                        checked={config.user_preferences.notification_enabled}
                        onChange={(e) => updateConfigValue('user_preferences.notification_enabled', e.target.checked)} 
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>
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
          {activeTab === 'api_test' && (
            <div className="api-test-container">
              <div className="section">
                <h2>Command API テスト</h2>
                <div className="test-buttons">
                  <button onClick={testFileOperations}>ファイル操作 API</button>
                  <button onClick={testAwsOperations}>AWS操作 API</button>
                  <button onClick={testConfigOperations}>設定管理 API</button>
                  <button onClick={testStateOperations}>状態管理 API</button>
                </div>
              </div>
              <div className="section">
                <h2>テスト結果</h2>
                <div className="test-results-header">
                  <button onClick={clearTestResults}>結果をクリア</button>
                </div>
                <div className="test-results">
                  {testResults.map((result, index) => (
                    <div key={index} className="test-result">
                      {result}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="config-info">
        <p>ReelVault - 映像制作者のためのアーカイブツール</p>
        <p>© 2025 CIVICTECH.TV, LLC</p>
      </div>
    </div>
  );
}; 