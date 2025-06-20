import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';

import { 
  TauriCommands, 
  UploadConfig, 
  UploadItem,
  UploadStatus,
  UploadProgress,
  AppConfig,
  AppState,
  AwsCredentials
} from '../services/tauriCommands';
import { debugLog, debugError, debugInfo } from '../utils/debug';
import './UploadManager.css';

// アイコンのインポート
import backupIcon from '../assets/icons/backup.svg';

// ファイルサイズフォーマット関数
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

interface UploadManagerProps {
  config: AppConfig;
  onConfigChange: (path: string, value: any) => void;
  onStateChange: (state: AppState) => void;
  onError: (error: string) => void;
  onSuccess: (message: string) => void;
}

// 無料版制限
const FREE_TIER_LIMITS = {
  MAX_CONCURRENT_UPLOADS: 1,
  MAX_CONCURRENT_PARTS: 1,
  CHUNK_SIZE_MB: 5,
  RETRY_ATTEMPTS: 3,
  TIMEOUT_SECONDS: 600,
  ENABLE_RESUME: false,
  ADAPTIVE_CHUNK_SIZE: false,
  MIN_CHUNK_SIZE_MB: 5,
  MAX_CHUNK_SIZE_MB: 5
};

// プレミアム版制限
const PREMIUM_TIER_LIMITS = {
  MAX_CONCURRENT_UPLOADS: 8,
  MAX_CONCURRENT_PARTS: 8,
  CHUNK_SIZE_MB: 10,
  RETRY_ATTEMPTS: 10,
  TIMEOUT_SECONDS: 1800,
  ENABLE_RESUME: true,
  ADAPTIVE_CHUNK_SIZE: true,
  MIN_CHUNK_SIZE_MB: 5,
  MAX_CHUNK_SIZE_MB: 1024
};

export const UploadManager: React.FC<UploadManagerProps> = ({
  config,
  onConfigChange,
  onStateChange,
  onError,
  onSuccess
}) => {
  const [isDragOver, _setIsDragOver] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadConfig, setUploadConfig] = useState<UploadConfig | null>(null);
  const [tempConfig, setTempConfig] = useState<Partial<UploadConfig> | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<{ selected_files: string[]; total_size: number; file_count: number } | null>(null);
  const [currentTier, setCurrentTier] = useState<'Free' | 'Premium'>('Free');
  
  // デバッグ用: propsの状態をログ出力
  useEffect(() => {
    debugLog('🔍 UploadManager props状態:', {
      awsCredentials: config.aws_settings.default_region ? 'あり' : 'なし',
      bucketName: config.user_preferences.default_bucket_name || 'なし',
      uploadConfig: uploadConfig ? 'あり' : 'なし'
    });
  }, [config, uploadConfig]);
  
  // ネイティブファイルダイアログを使用するため、refは不要
  const [_forceUpdate, setForceUpdate] = useState(0);

  // 初期化
  useEffect(() => {
    const initializeUpload = async () => {
      if (!config.user_preferences.default_bucket_name) {
        debugInfo('Bucket name not available');
        return;
      }

      try {
        // 🎯 デフォルトはプレミアム版設定
        const defaultConfig = createConfig(config, 'Premium');
        
        // 🔍 設定内容をデバッグ出力
        debugLog('🔧 生成された設定:', {
          bucket: defaultConfig.bucket_name,
          tier: defaultConfig.tier,
          maxConcurrent: defaultConfig.max_concurrent_uploads,
          chunkSize: defaultConfig.chunk_size_mb,
          retryAttempts: defaultConfig.retry_attempts
        });

        setUploadConfig(defaultConfig);
        setTempConfig(defaultConfig);
        setCurrentTier(defaultConfig.tier);
      } catch (error) {
        debugError('Upload config initialization failed:', error);
        onError('アップロード設定の初期化に失敗しました');
      }
    };

    initializeUpload();
  }, [config]);

  // uploadQueueの変更を監視して強制的に再レンダリング
  useEffect(() => {
    setForceUpdate(prev => prev + 1);
  }, [uploadQueue]);

  // アップロード完了監視
  useEffect(() => {
    if (!uploadConfig || !isUploading) return;

    const interval = setInterval(async () => {
      try {
        const queueItems = await TauriCommands.getUploadQueueItems();
        setUploadQueue(queueItems);

        // 全て完了したかチェック
        const allCompleted = queueItems.every(item => 
          item.status === UploadStatus.Completed || 
          item.status === UploadStatus.Failed || 
          item.status === UploadStatus.Cancelled
        );

        if (allCompleted && queueItems.length > 0) {
          setIsUploading(false);
          debugInfo('🎉 全てのアップロードが完了しました（定期チェック）');
          const completedItems = queueItems.filter(item => item.status === UploadStatus.Completed);
          onSuccess?.(`${completedItems.length}個のファイルがアップロード完了しました`);
        }
      } catch (err) {
        debugError('Upload queue check failed:', err);
        clearInterval(interval);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [uploadConfig, isUploading, onSuccess]);

  // ファイルサイズの検証
  const validateFileSize = (files: File[]): { valid: boolean; message?: string } => {
    const maxSize = 1024 * 1024 * 1024 * 1024; // 1TB
    const oversizedFiles = files.filter(file => file.size > maxSize);
    
    if (oversizedFiles.length > 0) {
      return {
        valid: false,
        message: `${oversizedFiles.length}個のファイルが1TB制限を超えています`
      };
    }
    
    return { valid: true };
  };

  // 🎯 統一された設定生成関数
  const createConfig = (currentConfig: AppConfig, tier: 'Free' | 'Premium'): UploadConfig => {
    const limits = tier === 'Free' ? FREE_TIER_LIMITS : PREMIUM_TIER_LIMITS;
    
    // 認証情報は別途管理されているため、ここでは空のオブジェクトを設定
    // 実際の認証情報はTauriCommands側で管理される
    const awsCredentials: AwsCredentials = {
      access_key_id: '', // 実際の値はTauriCommands側で設定
      secret_access_key: '',
      region: currentConfig.aws_settings.default_region,
      session_token: undefined
    };
    
    return {
      aws_credentials: awsCredentials,
      bucket_name: currentConfig.user_preferences.default_bucket_name || '',
      tier: tier,
      chunk_size_mb: limits.CHUNK_SIZE_MB,
      max_concurrent_uploads: limits.MAX_CONCURRENT_UPLOADS,
      max_concurrent_parts: limits.MAX_CONCURRENT_PARTS,
      adaptive_chunk_size: limits.ADAPTIVE_CHUNK_SIZE,
      min_chunk_size_mb: limits.MIN_CHUNK_SIZE_MB,
      max_chunk_size_mb: limits.MAX_CHUNK_SIZE_MB,
      retry_attempts: limits.RETRY_ATTEMPTS,
      timeout_seconds: limits.TIMEOUT_SECONDS,
      auto_create_metadata: true,
      s3_key_prefix: 'uploads',
      enable_resume: limits.ENABLE_RESUME,
      bandwidth_limit_mbps: undefined
    };
  };

  const handleTierChange = (tier: 'Free' | 'Premium') => {
    setCurrentTier(tier);
  };

  const applySettings = async () => {
    if (!tempConfig || !config.user_preferences.default_bucket_name) return;
    
    try {
      const newConfig = createConfig(config, currentTier);
      setUploadConfig(newConfig);
      setShowSettings(false);
      onSuccess('設定を適用しました');
    } catch (error) {
      debugError('Settings application failed:', error);
      onError('設定の適用に失敗しました');
    }
  };

  const handleStartUpload = async () => {
    if (!uploadConfig || !selectedFiles) {
      onError('アップロード設定またはファイルが選択されていません');
      return;
    }

    try {
      setIsUploading(true);
      
      // まずキューを初期化
      await TauriCommands.initializeUploadQueue(uploadConfig);
      
      // ファイルをキューに追加
      const s3KeyConfig = {
        prefix: uploadConfig.s3_key_prefix,
        use_date_folder: true,
        preserve_directory_structure: false,
        custom_naming_pattern: undefined
      };
      await TauriCommands.addFilesToUploadQueue(selectedFiles.selected_files, s3KeyConfig);
      
      // アップロード処理を開始
      await TauriCommands.startUploadProcessing();
      
      debugInfo('Upload started successfully');
      onSuccess('アップロードを開始しました');
    } catch (error) {
      debugError('Upload start failed:', error);
      onError(error instanceof Error ? error.message : 'アップロード開始に失敗しました');
      setIsUploading(false);
    }
  };

  const handleFileSelect = async () => {
    try {
      // TauriCommandsを使用してファイル選択
      const result = await TauriCommands.openFileDialog(true, undefined);
      
      if (result && result.file_count > 0) {
        setSelectedFiles({
          selected_files: result.selected_files,
          total_size: result.total_size,
          file_count: result.file_count
        });

        debugInfo('Files selected:', { count: result.file_count, totalSize: result.total_size });
      }
    } catch (error) {
      debugError('File selection failed:', error);
      onError('ファイル選択に失敗しました');
    }
  };

  const handleStopUpload = async () => {
    try {
      await TauriCommands.stopUploadProcessing();
      setIsUploading(false);
      onSuccess('アップロードを停止しました');
    } catch (error) {
      debugError('Upload stop failed:', error);
      onError('アップロード停止に失敗しました');
    }
  };

  const handleClearQueue = async () => {
    try {
      await TauriCommands.clearUploadQueue();
      setUploadQueue([]);
      onSuccess('アップロードキューをクリアしました');
    } catch (error) {
      debugError('Queue clear failed:', error);
      onError('キュークリアに失敗しました');
    }
  };

  return (
    <div className="upload-manager">
      {/* メインアップロードエリア */}
      <div className="upload-area">
        <div className="upload-header">
          <h3>📁 ファイルアップロード</h3>
          <div className="upload-controls">
            <button onClick={() => setShowSettings(true)} className="btn-secondary">
              ⚙️ 設定
            </button>
          </div>
        </div>

        {/* ファイル選択エリア */}
        <div className="file-selection-area">
          <button onClick={handleFileSelect} className="btn-primary" disabled={isUploading}>
            📂 ファイルを選択
          </button>
          
          {selectedFiles && (
            <div className="selected-files">
              <h4>選択されたファイル ({selectedFiles.file_count}個)</h4>
              <p>合計サイズ: {formatBytes(selectedFiles.total_size)}</p>
              <ul>
                {selectedFiles.selected_files.slice(0, 5).map((file, index) => (
                  <li key={index}>{file}</li>
                ))}
                {selectedFiles.selected_files.length > 5 && (
                  <li>... 他 {selectedFiles.selected_files.length - 5}個</li>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* アップロード制御 */}
        {selectedFiles && (
          <div className="upload-controls">
            <button 
              onClick={handleStartUpload} 
              disabled={isUploading || !uploadConfig} 
              className="btn-primary"
            >
              {isUploading ? '🔄 アップロード中...' : '🚀 アップロード開始'}
            </button>
            
            {isUploading && (
              <button onClick={handleStopUpload} className="btn-secondary">
                ⏹️ 停止
              </button>
            )}
          </div>
        )}

        {/* アップロードキュー */}
        {uploadQueue.length > 0 && (
          <div className="upload-queue">
            <h4>アップロードキュー ({uploadQueue.length}個)</h4>
            <div className="queue-controls">
              <button onClick={handleClearQueue} className="btn-secondary">
                🗑️ キューをクリア
              </button>
            </div>
            <div className="queue-items">
              {uploadQueue.map((item) => (
                <div key={item.id} className={`queue-item ${item.status.toLowerCase()}`}>
                  <div className="item-info">
                    <span className="item-name">{item.file_path.split('/').pop()}</span>
                    <span className="item-status">{item.status}</span>
                  </div>
                  {item.status === UploadStatus.InProgress && (
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ width: `${item.progress}%` }}
                      ></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 🎯 設定パネル（モーダル） */}
      {showSettings && tempConfig && (
        <div className="settings-modal">
          <div className="settings-content">
            <div className="settings-header">
              <h3>⚙️ アップロード設定</h3>
              <button onClick={() => setShowSettings(false)} className="close-btn">×</button>
            </div>

            <div className="settings-body">
              {/* 基本情報 */}
              <div className="settings-section">
                <h4>📊 基本情報</h4>
                <div className="setting-row">
                  <div className="setting-cell" data-label="認証情報">
                    <input
                      type="text"
                      value={config.aws_settings.default_region ? 'あり' : 'なし'}
                      disabled
                      className="readonly-input"
                    />
                  </div>
                  <div className="setting-cell" data-label="バケット名">
                    <input
                      type="text"
                      value={config.user_preferences.default_bucket_name || '未設定'}
                      disabled
                      className="readonly-input"
                    />
                  </div>
                </div>
              </div>

              {/* 機能ティア選択 */}
              <div className="settings-section">
                <h4>🎯 機能ティア</h4>
                <div className="tier-selection">
                  <label className="tier-option">
                    <input
                      type="radio"
                      name="tier"
                      value="Free"
                      checked={currentTier === 'Free'}
                      onChange={(e) => handleTierChange(e.target.value as 'Free' | 'Premium')}
                    />
                    <span className="tier-label">🆓 無料版</span>
                    <span className="tier-description">
                      1ファイルずつ、5MBチャンク、再開機能なし
                    </span>
                  </label>
                  
                  <label className="tier-option">
                    <input
                      type="radio"
                      name="tier"
                      value="Premium"
                      checked={currentTier === 'Premium'}
                      onChange={(e) => handleTierChange(e.target.value as 'Free' | 'Premium')}
                    />
                    <span className="tier-label">💎 プレミアム版</span>
                    <span className="tier-description">
                      8ファイル同時、動的チャンク、再開機能あり
                    </span>
                  </label>
                </div>
              </div>

              {/* 詳細設定 */}
              <div className="settings-section">
                <h4>🔧 詳細設定</h4>
                <div className="setting-row">
                  <div className="setting-cell">
                    <label htmlFor="concurrent-uploads-input" className="setting-label-complex">
                      <span>同時アップロード数</span>
                      <span className="setting-description-inline">
                        ({currentTier === 'Free' 
                          ? `無料版: ${FREE_TIER_LIMITS.MAX_CONCURRENT_UPLOADS}個に固定` 
                          : '設定範囲: 1～20個'})
                      </span>
                    </label>
                    <input
                      id="concurrent-uploads-input"
                      type="number"
                      min="1"
                      max="20"
                      value={tempConfig.max_concurrent_uploads || 1}
                      disabled={currentTier === 'Free'}
                      onChange={(e) => setTempConfig({
                        ...tempConfig, 
                        max_concurrent_uploads: parseInt(e.target.value)
                      })}
                    />
                  </div>
                  <div className="setting-cell">
                    <label className="setting-label-complex">
                      <span>再開機能</span>
                    </label>
                    <div className="toggle-control">
                      <label className="toggle-switch">
                        <input 
                          type="checkbox" 
                          checked={tempConfig.enable_resume || false}
                          onChange={(e) => setTempConfig({
                            ...tempConfig, 
                            enable_resume: e.target.checked
                          })}
                          disabled={currentTier === 'Free'}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                      <span className="toggle-label">{tempConfig.enable_resume ? '有効' : '無効'}</span>
                    </div>
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-cell">
                    <label htmlFor="chunk-size-input" className="setting-label-complex">
                      <span>チャンクサイズ</span>
                      <span className="setting-description-inline">
                        ({currentTier === 'Free'
                          ? `無料版: ${FREE_TIER_LIMITS.CHUNK_SIZE_MB}MBに固定`
                          : tempConfig.adaptive_chunk_size
                            ? '動的チャンクサイズが有効'
                            : '設定範囲: 5～1024MB'})
                      </span>
                    </label>
                    <input
                      id="chunk-size-input"
                      type="number"
                      min="5"
                      max="1024"
                      value={tempConfig.chunk_size_mb || 5}
                      disabled={currentTier === 'Free' || tempConfig.adaptive_chunk_size}
                      onChange={(e) => setTempConfig({
                        ...tempConfig, 
                        chunk_size_mb: parseInt(e.target.value)
                      })}
                    />
                  </div>
                  <div className="setting-cell">
                    <label className="setting-label-complex">
                      <span>動的チャンクサイズ</span>
                    </label>
                    <div className="toggle-control">
                      <label className="toggle-switch">
                        <input 
                          type="checkbox" 
                          checked={tempConfig.adaptive_chunk_size || false}
                          onChange={(e) => setTempConfig({
                            ...tempConfig, 
                            adaptive_chunk_size: e.target.checked
                          })}
                          disabled={currentTier === 'Free'}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                      <span className="toggle-label">{tempConfig.adaptive_chunk_size ? '有効' : '無効'}</span>
                    </div>
                  </div>
                </div>
                <div className="slider-setting">
                  <label className="setting-label-complex">
                    <span>再試行回数</span>
                    <span className="setting-description-inline">
                      (アップロード失敗時の再試行回数を設定します)
                    </span>
                  </label>
                  <div className="slider-container">
                    <input
                      type="range"
                      min="1" 
                      max="20"
                      value={tempConfig.retry_attempts || 3}
                      onChange={(e) => setTempConfig({
                        ...tempConfig, 
                        retry_attempts: parseInt(e.target.value)
                      })}
                    />
                    <span className="setting-value">{tempConfig.retry_attempts || 3}回</span>
                  </div>
                </div>
              </div>

              <div className="settings-footer">
                <button onClick={applySettings} className="btn-primary">
                  ✅ 設定を適用
                </button>
                <button onClick={() => setShowSettings(false)} className="btn-secondary">
                  ❌ キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 