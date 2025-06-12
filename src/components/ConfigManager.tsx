import React, { useState, useEffect } from 'react';
import { 
  TauriCommands, 
  AppConfig, 
  AppState,
  ConfigValidationResult,
  AwsCredentials,
  AwsAuthResult,
  PermissionCheck,
  LifecyclePolicyStatus,
  AwsConfig
} from '../types/tauri-commands';
import { AWS_REGIONS, DEFAULT_REGION } from '../constants/aws-regions';
import './ConfigManager.css';

interface ConfigManagerProps {
  initialConfig: AppConfig;
  initialState: AppState;
  onConfigChange: (config: AppConfig) => void;
  onStateChange: (state: AppState) => void;
  onAuthSuccess: () => void;
  onHealthStatusChange?: (status: { isHealthy: boolean; lastCheck: Date | null; bucketName: string | undefined }) => void;
}

type ActiveTab = 'status' | 'api_test' | 'auth' | 'app' | 'aws_settings';

export const ConfigManager: React.FC<ConfigManagerProps> = ({ 
  initialConfig,
  initialState,
  onConfigChange, 
  onStateChange,
  onAuthSuccess,
  onHealthStatusChange
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
  const [_isDeveloperMode, _setIsDeveloperMode] = useState(false);

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

  // --- Lifecycle Management State ---
  const [lifecycleStatus, setLifecycleStatus] = useState<LifecyclePolicyStatus | null>(null);
  const [isLifecycleLoading, setIsLifecycleLoading] = useState(false);

  const [lifecycleSetupStatus, setLifecycleSetupStatus] = useState<{
    isVerifying: boolean;
    message: string;
    remainingSeconds?: number;
  }>({ isVerifying: false, message: '' });
  
  // ライフサイクル整合性監視
  const [isLifecycleHealthy, setIsLifecycleHealthy] = useState<boolean>(true);
  const [lastHealthCheck, setLastHealthCheck] = useState<Date | null>(null);
  const [healthCheckInterval, setHealthCheckInterval] = useState<number | null>(null);

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

  // バケット設定時に自動でライフサイクル状況をチェック + 健全性監視開始
  useEffect(() => {
    const autoCheckLifecycle = async () => {
      // バケット名と認証情報が揃っている場合のみ実行
      if (config.user_preferences.default_bucket_name && 
          credentials.access_key_id && 
          credentials.secret_access_key &&
          !isLifecycleLoading) {
        
        console.log('自動ライフサイクル状況チェック開始:', config.user_preferences.default_bucket_name);
        
        try {
          await checkLifecycleStatus();
          // 健全性チェックも実行
          await checkLifecycleHealth();
        } catch (err) {
          console.log('自動ライフサイクル状況チェックでエラー（非致命的）:', err);
          // エラーの場合はライフサイクル状況をクリア（未設定状態として表示）
          setLifecycleStatus(null);
          setIsLifecycleHealthy(false);
        }
      }
    };
    
    // 初回読み込み時は少し遅延を設ける
    const timeoutId = setTimeout(autoCheckLifecycle, 1000);
    
    return () => clearTimeout(timeoutId);
  }, [config.user_preferences.default_bucket_name, credentials.access_key_id, credentials.secret_access_key]);

  // 定期健全性監視（5分間隔）
  useEffect(() => {
    // 既存のインターバルをクリア
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
    }

    // バケットが設定されている場合のみ定期監視を開始
    if (config.user_preferences.default_bucket_name && 
        credentials.access_key_id && 
        credentials.secret_access_key) {
      
      console.log('ライフサイクル定期監視を開始（5分間隔）');
      
      const interval = window.setInterval(async () => {
        console.log('定期ライフサイクル健全性チェック実行');
        await checkLifecycleHealth();
      }, 5 * 60 * 1000); // 5分間隔

      setHealthCheckInterval(interval);

      return () => {
        clearInterval(interval);
        setHealthCheckInterval(null);
      };
    }
  }, [config.user_preferences.default_bucket_name, credentials.access_key_id, credentials.secret_access_key]);

  // アプリ終了時のクリーンアップ
  useEffect(() => {
    return () => {
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
      }
    };
  }, []);

  // 健全性状態変化を親に通知
  useEffect(() => {
    if (onHealthStatusChange) {
      onHealthStatusChange({
        isHealthy: isLifecycleHealthy,
        lastCheck: lastHealthCheck,
        bucketName: config.user_preferences.default_bucket_name
      });
    }
  }, [isLifecycleHealthy, lastHealthCheck, config.user_preferences.default_bucket_name]);



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

  const testRestoreOperations = async () => {
    addTestResult("🔄 復元機能テストを開始...");
    
    // テスト用のデータ
    const testS3Key = "videos/test-video.mp4";
    const testConfig = {
      access_key_id: "test_access_key",
      secret_access_key: "test_secret_key",
      region: "us-east-1",
      bucket_name: "test-bucket"
    };
    
    try {
      // 1. 復元ジョブ一覧取得テスト
      const jobs = await TauriCommands.listRestoreJobs();
      addTestResult(`✅ 復元ジョブ一覧取得: ${jobs.length}個のジョブ`);

      // 2. 復元通知取得テスト
      const notifications = await TauriCommands.getRestoreNotifications();
      addTestResult(`✅ 復元通知取得: ${notifications.length}個の通知`);

      // 3. 復元リクエストテスト
      const restoreResult = await TauriCommands.restoreFile(testS3Key, testConfig, 'Standard');
      addTestResult(`✅ 復元リクエスト成功: ${restoreResult.restore_status}`);

      // 4. 復元状況確認テスト
      const statusResult = await TauriCommands.checkRestoreStatus(testS3Key, testConfig);
      addTestResult(`✅ 復元状況確認: ${statusResult.restore_status}`);

      // 5. 履歴クリアテスト
      const clearResult = await TauriCommands.clearRestoreHistory();
      addTestResult(`✅ 復元履歴クリア: ${clearResult}`);

      addTestResult("🎉 復元機能テスト完了!");

    } catch (error) {
      addTestResult(`❌ 復元機能エラー: ${error}`);
    }
  };

  const testLifecycleOperations = async () => {
    addTestResult('=== ライフサイクル管理テスト開始 ===');
    
    // デモ用の認証情報とバケット設定
    const testConfig: AwsConfig = {
      access_key_id: credentials.access_key_id || 'DEMO_ACCESS_KEY',
      secret_access_key: credentials.secret_access_key || 'DEMO_SECRET_KEY',
      region: credentials.region || 'ap-northeast-1',
      bucket_name: bucketName || config.user_preferences.default_bucket_name || 'test-bucket'
    };

    try {
      // 1. ライフサイクル設定検証
      addTestResult('1. ライフサイクル設定検証...');
      const isValid = await TauriCommands.validateLifecycleConfig(testConfig);
      addTestResult(`   設定有効性: ${isValid ? '✅ 有効' : '❌ 無効'}`);

      // 2. 現在のライフサイクル状況確認
      addTestResult('2. 現在のライフサイクル状況確認...');
      const status = await TauriCommands.getLifecycleStatus(testConfig);
      addTestResult(`   現在の状況: ${JSON.stringify(status)}`);

      // 3. ライフサイクルルール一覧取得
      addTestResult('3. ライフサイクルルール一覧取得...');
      const rules = await TauriCommands.listLifecycleRules(testConfig);
      addTestResult(`   ルール数: ${rules.length}件`);

      // 4. ReelVaultライフサイクル有効化テスト
      addTestResult('4. ReelVaultライフサイクル有効化テスト...');
      const enableResult = await TauriCommands.enableReelvaultLifecycle(testConfig);
      addTestResult(`   有効化結果: ${JSON.stringify(enableResult)}`);

      // 5. 有効化後の状況再確認
      addTestResult('5. 有効化後の状況再確認...');
      const newStatus = await TauriCommands.getLifecycleStatus(testConfig);
      addTestResult(`   更新後状況: ${JSON.stringify(newStatus)}`);

      addTestResult('✅ ライフサイクル管理テスト完了');
    } catch (error) {
      addTestResult(`❌ ライフサイクル管理テストエラー: ${error}`);
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
    setLifecycleSetupStatus({ 
      isVerifying: true, 
      message: 'バケットアクセステスト実行中...',
      remainingSeconds: undefined
    });

    let countdownInterval: number | null = null;

    try {
      // バケットアクセステスト実行（内部でライフサイクル設定も含む）
      setLifecycleSetupStatus({ 
        isVerifying: true, 
        message: 'ライフサイクル設定確認中...',
        remainingSeconds: 60
      });

      // カウントダウンタイマーを開始
      countdownInterval = window.setInterval(() => {
        setLifecycleSetupStatus(prev => {
          if (prev.remainingSeconds && prev.remainingSeconds > 0) {
            return {
              ...prev,
              remainingSeconds: prev.remainingSeconds - 1,
              message: `ライフサイクル設定確認中... (残り ${prev.remainingSeconds - 1}秒)`
            };
          }
          return prev;
        });
      }, 1000);

      const result = await TauriCommands.testS3BucketAccess(credentials, bucketName);
      
      // カウントダウン停止
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
      
      setPermissionCheck(result);
      
      // S3バケットアクセステスト（ライフサイクル設定含む）が成功した場合のみ、バケット名を保存
      if (result.allowed) {
        setLifecycleSetupStatus({ 
          isVerifying: false, 
          message: '✅ ライフサイクル設定完了！バケット名を保存中...'
        });
        
        console.log(`S3バケットアクセステスト成功（ライフサイクル設定確認済み）: ${bucketName} をS3バケット名として保存します`);
        
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
          
          console.log(`S3バケット名「${bucketName}」とライフサイクル設定を自動保存しました`);
          
          setLifecycleSetupStatus({ 
            isVerifying: false, 
            message: '✅ 設定完了！ライフサイクルポリシーが有効になりました。'
          });
          
          // 成功メッセージを3秒後にクリア（完了状態を表示）
          setTimeout(() => {
            setLifecycleSetupStatus({ 
              isVerifying: false, 
              message: '🎉 S3バケット設定完了！ライフサイクルポリシーが有効です。'
            });
            setPermissionCheck(null); // バケットアクセステスト結果はクリア
            
            // 完了状態メッセージも5秒後にクリア
            setTimeout(() => {
              setLifecycleSetupStatus({ isVerifying: false, message: '' });
            }, 5000);
          }, 3000);
          
          // ライフサイクル状況を自動チェック
          setTimeout(async () => {
            try {
              await checkLifecycleStatus();
            } catch (err) {
              console.log('ライフサイクル状況の自動取得でエラー（非致命的）:', err);
            }
          }, 1000);
          
          // 成功メッセージを表示（5秒後に自動消去）
          setSuccess(`✅ バケットアクセステスト成功！\n📋 S3バケット名「${bucketName}」を保存しました\n🔄 ReelVaultライフサイクルポリシーの状況を確認中...`);
          setTimeout(() => setSuccess(null), 5000);
          
        } catch (saveError) {
          console.error('デフォルトバケット名の自動保存に失敗:', saveError);
          // 保存エラーの場合は警告として表示（致命的ではない）
          setAuthError(`バケットアクセスは成功しましたが、設定の自動保存に失敗しました: ${saveError instanceof Error ? saveError.message : '不明なエラー'}`);
        }
      }
    } catch (err) {
      // カウントダウン停止
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
      
      setLifecycleSetupStatus({ 
        isVerifying: false, 
        message: '❌ ライフサイクル設定に失敗しました。'
      });
      
      setAuthError(err instanceof Error ? err.message : 'バケットアクセステストに失敗しました');
      
      // エラーメッセージを5秒後にクリア
      setTimeout(() => {
        setLifecycleSetupStatus({ isVerifying: false, message: '' });
      }, 5000);
    } finally {
      setIsAuthLoading(false);
    }
  };

  // --- Lifecycle Management Functions ---
  
  const getAwsConfigFromCredentials = (): AwsConfig => ({
    access_key_id: credentials.access_key_id,
    secret_access_key: credentials.secret_access_key,
    region: credentials.region,
    bucket_name: bucketName || config.user_preferences.default_bucket_name || '',
  });

  const checkLifecycleStatus = async () => {
    const awsConfig = getAwsConfigFromCredentials();
    
    if (!awsConfig.bucket_name) {
      console.error('バケット名が設定されていません');
      return;
    }

    setIsLifecycleLoading(true);

    try {
      console.log('Checking lifecycle status for bucket:', awsConfig.bucket_name);
      const status = await TauriCommands.getLifecycleStatus(awsConfig);
      console.log('Lifecycle status received:', status);
      setLifecycleStatus(status);
    } catch (err) {
      console.error('Error checking lifecycle status:', err);
      console.error('ライフサイクル状況の取得に失敗しました:', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLifecycleLoading(false);
    }
  };



  // ライフサイクル健全性チェック
  const checkLifecycleHealth = async (): Promise<boolean> => {
    try {
      if (!config.user_preferences.default_bucket_name) {
        console.log('バケット未設定のため健全性チェックをスキップ');
        setIsLifecycleHealthy(true); // バケット未設定は問題なし
        return true;
      }

      console.log(`ライフサイクル健全性チェック開始: ${config.user_preferences.default_bucket_name}`);
      
      // ライフサイクル状況を確認
      const awsConfig = getAwsConfigFromCredentials();
      awsConfig.bucket_name = config.user_preferences.default_bucket_name;
      const status = await TauriCommands.getLifecycleStatus(awsConfig);

      const healthy = status.enabled;
      setIsLifecycleHealthy(healthy);
      setLastHealthCheck(new Date());

      if (!healthy) {
        console.warn(`⚠️ ライフサイクル設定異常を検出: ${config.user_preferences.default_bucket_name}`);
      } else {
        console.log(`✅ ライフサイクル設定正常: ${config.user_preferences.default_bucket_name}`);
      }

      return healthy;
    } catch (err) {
      console.error('ライフサイクル健全性チェックでエラー:', err);
      setIsLifecycleHealthy(false);
      return false;
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
            ☁️ AWS S3設定
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
                  <p><strong>🪣 S3バケット名:</strong> {config.user_preferences.default_bucket_name || "未設定"}</p>

                  <p><strong>🌍 AWSリージョン:</strong> {config.aws_settings.default_region}</p>
                  <p><strong>⏱️ タイムアウト:</strong> {config.aws_settings.timeout_seconds}秒</p>
                  <p><strong>🔄 S3ライフサイクル:</strong> 
                    {config.user_preferences.default_bucket_name ? (
                      lifecycleStatus ? (
                        lifecycleStatus.error_message ? (
                          <span className="status-error">⚠️ {lifecycleStatus.error_message}</span>
                        ) : lifecycleStatus.enabled ? (
                          <span className="status-enabled">
                            ✅ 有効 ({lifecycleStatus.transition_days || 'N/A'}日後 → {lifecycleStatus.storage_class || 'N/A'})
                          </span>
                        ) : (
                          <span className="status-disabled">❌ 無効</span>
                        )
                      ) : (
                        <span className="status-checking">🔄 確認中...</span>
                      )
                    ) : (
                      <span className="status-unavailable">⚠️ バケット未設定</span>
                    )}
                  </p>
                  <p><strong>🩺 アップロード安全性:</strong> 
                    {isLifecycleHealthy ? (
                      <span className="status-enabled">✅ 準備完了</span>
                    ) : (
                      <span className="status-error">⚠️ 設定に問題あり</span>
                    )}
                    {lastHealthCheck && (
                      <small style={{marginLeft: '8px', opacity: 0.7}}>
                        (最終確認: {lastHealthCheck.toLocaleTimeString()})
                      </small>
                    )}
                  </p>
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
              
              {/* 設定管理ボタン */}
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
                <h4>設定の管理</h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  ※ AWS認証情報は含まれません。セキュリティ上、認証情報は別途管理されます。
                </p>
                <div className="config-actions-group">
                  <button onClick={exportConfig} className="btn-secondary">
                    📤 アプリ設定エクスポート
                  </button>
                  <button onClick={importConfig} className="btn-secondary">
                    📥 アプリ設定インポート
                  </button>
                </div>
              </div>

              <div className="danger-zone">
                <h4>危険な操作</h4>
                <p>以下の操作は元に戻せません。実行する前に、内容をよく確認してください。</p>
                <div className="danger-actions">
                    <button onClick={resetConfig} className="btn-danger">
                      🔄 すべての設定をリセット
                    </button>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                  ※ すべてのアプリ設定が初期値に戻されます。AWS認証情報も削除されます。
                </p>
              </div>

            </div>
          )}
          {activeTab === 'auth' && (
            <div className="config-section">
              <h3>AWS認証</h3>
              {authError && (
                <div className="status-card error">
                  <h4>認証エラー</h4>
                  <p>❌ {authError}</p>
                  <button 
                    onClick={() => setAuthError(null)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      float: 'right',
                      fontSize: '18px',
                      marginTop: '-32px'
                    }}
                  >
                    ×
                  </button>
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
                <div className={`status-card ${authResult.success ? 'success' : 'error'}`}>
                  <h4>AWS認証結果</h4>
                  <p><strong>ステータス:</strong> {authResult.success ? '✅ 成功' : '❌ 失敗'}</p>
                  <p><strong>メッセージ:</strong> {authResult.message}</p>
                  
                  {authResult.user_identity && (
                    <div className="status-details">
                      <h5>ユーザー詳細</h5>
                      <p><strong>User ID:</strong> {authResult.user_identity.user_id}</p>
                      <p><strong>ARN:</strong> {authResult.user_identity.arn}</p>
                      <p><strong>アカウント:</strong> {authResult.user_identity.account}</p>
                    </div>
                  )}

                  {authResult.permissions.length > 0 && (
                    <div className="status-details">
                      <h5>認可された権限</h5>
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
                        placeholder={
                          config.user_preferences.default_bucket_name 
                            ? `現在設定: ${config.user_preferences.default_bucket_name}`
                            : "テストするバケット名を入力"
                        }
                      />
                                            <button
                        onClick={handleTestBucketAccess}
                        disabled={isAuthLoading || !bucketName}
                        className={
                          bucketName === config.user_preferences.default_bucket_name && 
                          lifecycleStatus?.enabled 
                            ? "btn-secondary" 
                            : "btn-success"
                        }
                      >
                        {isAuthLoading ? 'テスト中...' : 
                         bucketName === config.user_preferences.default_bucket_name ? 
                           (lifecycleStatus?.enabled ? 
                            '✅ 設定完了' : 
                            '🔄 ライフサイクル再設定') : 
                         'アクセスをテスト'}
                      </button>
                      {config.user_preferences.default_bucket_name && (
                        <small style={{ 
                          display: 'block', 
                          marginTop: '8px', 
                          color: lifecycleStatus?.enabled ? 'var(--status-success-text)' : 'var(--status-warning-text)', 
                          fontSize: '12px' 
                        }}>
                          {lifecycleStatus?.enabled ? (
                            <>💡 「{config.user_preferences.default_bucket_name}」の設定が完了しています。別のバケットをテストする場合は異なる名前を入力してください。</>
                          ) : (
                            <>⚠️ 「{config.user_preferences.default_bucket_name}」のライフサイクル設定が見つかりません。同じバケット名でライフサイクル設定を再適用できます。</>
                          )}
                        </small>
                      )}
                    </div>
                                      )}

                  {/* 不整合状態の警告表示 */}
                  {config.user_preferences.default_bucket_name && 
                   lifecycleStatus !== null && 
                   !lifecycleStatus.enabled && 
                   !lifecycleSetupStatus.message && (
                    <div className="status-card warning">
                      <h4>⚠️ 設定不整合を検出</h4>
                      <p>
                        バケット「{config.user_preferences.default_bucket_name}」は登録されていますが、
                        ライフサイクルポリシーが見つかりません。
                      </p>
                      <p>
                        <strong>対処方法:</strong> 同じバケット名で「🔄 ライフサイクル再設定」ボタンを押して修復してください。
                      </p>
                    </div>
                  )}

                  {/* ライフサイクル設定進行状況表示 */}
                  {lifecycleSetupStatus.message && (
                    <div className={`status-card ${
                      lifecycleSetupStatus.isVerifying ? 'warning' : 
                      lifecycleSetupStatus.message.includes('✅') ? 'success' : 
                      lifecycleSetupStatus.message.includes('❌') ? 'error' : 'info'
                    }`}>
                      <h4>ライフサイクル設定状況</h4>
                      <p>{lifecycleSetupStatus.message}</p>
                      {lifecycleSetupStatus.isVerifying && lifecycleSetupStatus.remainingSeconds && (
                        <div className="status-progress">
                          <div 
                            className="status-progress-bar"
                            style={{
                              width: `${((60 - lifecycleSetupStatus.remainingSeconds) / 60) * 100}%`
                            }}
                          ></div>
                        </div>
                      )}
                    </div>
                  )}

                   {permissionCheck && (
                      <div className={`status-card ${permissionCheck.allowed ? 'success' : 'error'}`}>
                        <h4>バケットアクセステスト結果</h4>
                        <p>
                          {permissionCheck.allowed
                            ? `✅ バケット「${bucketName}」へのアクセスは許可されています。`
                            : `❌ バケット「${bucketName}」へのアクセスは拒否されました。`}
                        </p>
                        {permissionCheck.error && (
                          <p><strong>エラー詳細:</strong> {permissionCheck.error}</p>
                        )}
                      </div>
                    )}
                </div>
              )}
            </div>
          )}
          {activeTab === 'aws_settings' && (
            <div className="config-section">
              <h3>AWS S3設定</h3>
              
              <div className="config-group centered-field">
                <label>S3バケット名:</label>
                <input
                  type="text"
                  value={config.user_preferences.default_bucket_name || ''}
                  disabled
                  className="readonly-input"
                  placeholder="AWS認証タブでバケットアクセステスト時に自動設定されます"
                />
                <small className="field-help">
                  💡 AWS認証タブでバケットアクセステストが成功すると自動的に設定されます
                </small>
              </div>

              <div className="config-group centered-field">
                <label>S3ライフサイクル設定:</label>
                <select
                  value={
                    lifecycleStatus?.enabled ? 
                      `${lifecycleStatus.transition_days}日後-${lifecycleStatus.storage_class}` : 
                      lifecycleStatus === null ? 'checking' : 'disabled'
                  }
                  disabled
                  className="readonly-select"
                >
                  <option value="checking">🔄 確認中...</option>
                  <option value="disabled">❌ 無効</option>
                  <option value="1日後-DEEP_ARCHIVE">✅ 1日後 → DEEP_ARCHIVE</option>
                  <option value="7日後-DEEP_ARCHIVE">✅ 7日後 → DEEP_ARCHIVE</option>
                  <option value="30日後-GLACIER">✅ 30日後 → GLACIER</option>
                </select>
                <small className="field-help">
                  {config.user_preferences.default_bucket_name && 
                   lifecycleStatus !== null && 
                   !lifecycleStatus.enabled ? (
                    <>⚠️ ライフサイクル設定が見つかりません。AWS認証タブで「🔄 ライフサイクル再設定」を実行してください。</>
                  ) : (
                    <>💡 ライフサイクル設定はAWS認証タブのバケットアクセステスト時に自動適用されます（表示専用）</>
                  )}
                </small>
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
                  <button onClick={testRestoreOperations}>復元機能テスト</button>
                  <button onClick={testLifecycleOperations}>ライフサイクル管理テスト</button>
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