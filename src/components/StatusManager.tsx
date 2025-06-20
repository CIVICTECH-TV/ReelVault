import React from 'react';
import { AppConfig, AppState, LifecyclePolicyStatus } from '../services/tauriCommands';
import { getRegionDescription } from '../constants/aws-regions';

interface StatusManagerProps {
  config: AppConfig;
  appState: AppState;
  appVersion: string;
  lifecycleStatus: LifecyclePolicyStatus | null;
  isLifecycleHealthy: boolean;
  lastHealthCheck: Date | null;
  updateConfigValue: (path: string, value: any) => void;
}

export const StatusManager: React.FC<StatusManagerProps> = ({
  config,
  appState,
  appVersion,
  lifecycleStatus,
  isLifecycleHealthy,
  lastHealthCheck,
  updateConfigValue,
}) => {
  return (
    <div className="content-container">
      <h3 className="section-title">
        <span className="icon">📊</span>
        システム状態
      </h3>

      <div className="form-row">
        <label>S3バケット名:</label>
        <div className="control">
          <div className="data-box">{config.user_preferences.default_bucket_name || '未設定'}</div>
        </div>
      </div>

      <div className="form-row">
        <label>AWSリージョン:</label>
        <div className="control">
          <div className="data-box">{getRegionDescription(config.aws_settings.default_region)}</div>
        </div>
      </div>

      <div className="form-row">
        <label>タイムアウト:</label>
        <div className="control">
          <div className="data-box">{`${config.aws_settings.timeout_seconds}秒`}</div>
        </div>
      </div>

      <div className="form-row">
        <label>S3ライフサイクル:</label>
        <div className="control">
          <div className="data-box">
            {config.user_preferences.default_bucket_name ? (
              lifecycleStatus ? (
                lifecycleStatus.error_message
                  ? `⚠️ ${lifecycleStatus.error_message}`
                  : lifecycleStatus.enabled
                  ? `✅ 有効 (${lifecycleStatus.transition_days || 'N/A'}日後 → ${
                      lifecycleStatus.storage_class || 'N/A'
                    })`
                  : '❌ 無効'
              ) : (
                '🔄 確認中...'
              )
            ) : (
              '⚠️ バケット未設定'
            )}
          </div>
        </div>
      </div>

      <div className="form-row">
        <label>アップロード安全性:</label>
        <div className="control">
          <div className="data-box">
            {isLifecycleHealthy
              ? `✅ 準備完了${
                  lastHealthCheck ? ` (最終確認: ${lastHealthCheck.toLocaleTimeString()})` : ''
                }`
              : '⚠️ 設定に問題あり'}
          </div>
        </div>
      </div>

      <div className="form-row">
        <label>アプリバージョン:</label>
        <div className="control">
          <div className="data-box">{appVersion || '読み込み中...'}</div>
        </div>
      </div>

      <div className="form-row">
        <label>デバッグログ:</label>
        <div className="control">
          <div
            className="toggle-switch"
            onClick={() => {
              const newValue = config.app_settings.log_level === 'debug' ? 'info' : 'debug';
              updateConfigValue('app_settings.log_level', newValue);
            }}
          >
            <input type="checkbox" checked={config.app_settings.log_level === 'debug'} readOnly />
            <span className="toggle-slider" />
          </div>
        </div>
      </div>

      {appState.upload_queue.length > 0 && (
        <div className="config-group">
          <label>アップロードキュー ({appState.upload_queue.length}件):</label>
          <div className="upload-queue">
            {appState.upload_queue.slice(0, 5).map((item) => (
              <div key={item.id} className="queue-item">
                <p><strong>{item.file_name}</strong></p>
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
        <div className="config-group">
          <label>現在のアップロード:</label>
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
        <div className="config-group">
          <label>最近のエラー:</label>
          <div className="alert alert-error">
            {appState.last_error}
          </div>
        </div>
      )}
    </div>
  );
}; 