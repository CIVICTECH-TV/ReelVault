import React, { useState, useEffect, useCallback } from 'react';
import { RestoreService } from '../services/restoreService';
import {
  AwsConfig,
  RestoreInfo,
  RestoreStatusResult,
  RestoreNotification,
  S3Object,
} from '../types/tauri-commands';
import './RestoreManager.css';

interface RestoreManagerProps {
  awsConfig: AwsConfig;
  s3Objects: S3Object[];
  onError: (error: string) => void;
  onSuccess: (message: string) => void;
}

export const RestoreManager: React.FC<RestoreManagerProps> = ({
  awsConfig,
  s3Objects,
  onError,
  onSuccess,
}) => {
  const [restoreJobs, setRestoreJobs] = useState<RestoreInfo[]>([]);
  const [notifications, setNotifications] = useState<RestoreNotification[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectedTier, setSelectedTier] = useState<'Standard' | 'Expedited' | 'Bulk'>('Standard');
  const [isLoading, setIsLoading] = useState(false);
  const [monitoringJobs, setMonitoringJobs] = useState<Map<string, () => void>>(new Map());

  // 復元ジョブ一覧を更新
  const refreshRestoreJobs = useCallback(async () => {
    try {
      const jobs = await RestoreService.listRestoreJobs();
      setRestoreJobs(jobs);
    } catch (error) {
      console.error('Failed to refresh restore jobs:', error);
    }
  }, []);

  // 通知を更新
  const refreshNotifications = useCallback(async () => {
    try {
      const newNotifications = await RestoreService.getRestoreNotifications();
      setNotifications(newNotifications);
    } catch (error) {
      console.error('Failed to refresh notifications:', error);
    }
  }, []);

  // 初期化
  useEffect(() => {
    refreshRestoreJobs();
    refreshNotifications();
    
    // 定期的に通知を更新
    const notificationInterval = setInterval(refreshNotifications, 30000);
    
    return () => {
      clearInterval(notificationInterval);
      // 監視中のジョブを停止
      monitoringJobs.forEach(stopMonitoring => stopMonitoring());
    };
  }, [refreshRestoreJobs, refreshNotifications, monitoringJobs]);

  // ファイル選択の切り替え
  const toggleFileSelection = (s3Key: string) => {
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(s3Key)) {
      newSelection.delete(s3Key);
    } else {
      newSelection.add(s3Key);
    }
    setSelectedFiles(newSelection);
  };

  // 全選択/全解除
  const toggleSelectAll = () => {
    if (selectedFiles.size === s3Objects.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(s3Objects.map(obj => obj.key)));
    }
  };

  // 復元リクエスト送信
  const handleRestoreRequest = async () => {
    if (selectedFiles.size === 0) {
      onError('復元するファイルを選択してください');
      return;
    }

    setIsLoading(true);
    try {
      const promises = Array.from(selectedFiles).map(async (s3Key) => {
        const restoreInfo = await RestoreService.restoreFile(s3Key, awsConfig, selectedTier);
        
        // 監視を開始
        const stopMonitoring = await RestoreService.startRestoreMonitoring(
          s3Key,
          awsConfig,
          (status: RestoreStatusResult) => {
            console.log(`Status update for ${s3Key}:`, status);
            refreshRestoreJobs();
            if (status.restore_status === 'completed') {
              onSuccess(`ファイル ${s3Key} の復元が完了しました`);
            }
          }
        );
        
        setMonitoringJobs(prev => new Map(prev.set(s3Key, stopMonitoring)));
        return restoreInfo;
      });

      await Promise.all(promises);
      onSuccess(`${selectedFiles.size}個のファイルの復元リクエストを送信しました`);
      setSelectedFiles(new Set());
      refreshRestoreJobs();
    } catch (error) {
      onError(`復元リクエストに失敗しました: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ファイルダウンロード
  const handleDownload = async (s3Key: string) => {
    try {
      // ファイル保存ダイアログを表示（実際の実装では@tauri-apps/plugin-dialogを使用）
      const fileName = s3Key.split('/').pop() || 'downloaded_file';
      const localPath = `~/Downloads/${fileName}`;
      
      const progress = await RestoreService.downloadRestoredFile(s3Key, localPath, awsConfig);
      onSuccess(`ファイル ${s3Key} のダウンロードが完了しました: ${progress.local_path}`);
    } catch (error) {
      onError(`ダウンロードに失敗しました: ${error}`);
    }
  };

  // 復元ジョブキャンセル
  const handleCancelJob = async (s3Key: string) => {
    try {
      const success = await RestoreService.cancelRestoreJob(s3Key);
      if (success) {
        onSuccess(`復元ジョブ ${s3Key} をキャンセルしました`);
        
        // 監視を停止
        const stopMonitoring = monitoringJobs.get(s3Key);
        if (stopMonitoring) {
          stopMonitoring();
          setMonitoringJobs(prev => {
            const newMap = new Map(prev);
            newMap.delete(s3Key);
            return newMap;
          });
        }
        
        refreshRestoreJobs();
      } else {
        onError(`復元ジョブ ${s3Key} をキャンセルできませんでした`);
      }
    } catch (error) {
      onError(`キャンセルに失敗しました: ${error}`);
    }
  };

  // 履歴クリア
  const handleClearHistory = async () => {
    try {
      const count = await RestoreService.clearRestoreHistory();
      onSuccess(`${count}個の復元履歴をクリアしました`);
      setRestoreJobs([]);
      setNotifications([]);
    } catch (error) {
      onError(`履歴のクリアに失敗しました: ${error}`);
    }
  };

  // Deep Archiveファイルのフィルタリング
  const deepArchiveFiles = s3Objects.filter(obj => obj.storage_class === 'DEEP_ARCHIVE');

  return (
    <div className="restore-manager">
      <div className="restore-header">
        <h2>ファイル復元管理</h2>
        <div className="restore-controls">
          <select
            value={selectedTier}
            onChange={(e) => setSelectedTier(e.target.value as 'Standard' | 'Expedited' | 'Bulk')}
            className="tier-select"
          >
            <option value="Standard">標準復元 (3-5時間)</option>
            <option value="Expedited">高速復元 (1-5分)</option>
            <option value="Bulk">一括復元 (5-12時間)</option>
          </select>
          <button
            onClick={handleRestoreRequest}
            disabled={selectedFiles.size === 0 || isLoading}
            className="restore-button primary"
          >
            {isLoading ? '復元中...' : `復元開始 (${selectedFiles.size}個)`}
          </button>
        </div>
      </div>

      {/* 通知エリア */}
      {notifications.length > 0 && (
        <div className="notifications">
          <h3>復元通知</h3>
          {notifications.map((notification, index) => (
            <div key={index} className={`notification ${notification.status}`}>
              <span className="notification-message">{notification.message}</span>
              <span className="notification-time">
                {new Date(notification.timestamp).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="restore-content">
        {/* ファイル選択エリア */}
        <div className="file-selection">
          <div className="section-header">
            <h3>Deep Archiveファイル ({deepArchiveFiles.length}個)</h3>
            <button onClick={toggleSelectAll} className="select-all-button">
              {selectedFiles.size === deepArchiveFiles.length ? '全解除' : '全選択'}
            </button>
          </div>
          
          <div className="file-list">
            {deepArchiveFiles.map((file) => (
              <div
                key={file.key}
                className={`file-item ${selectedFiles.has(file.key) ? 'selected' : ''}`}
                onClick={() => toggleFileSelection(file.key)}
              >
                <input
                  type="checkbox"
                  checked={selectedFiles.has(file.key)}
                  onChange={() => toggleFileSelection(file.key)}
                />
                <div className="file-info">
                  <div className="file-name">{file.key}</div>
                  <div className="file-details">
                    {RestoreService.formatFileSize(file.size)} • 
                    {new Date(file.last_modified).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 復元ジョブ一覧 */}
        <div className="restore-jobs">
          <div className="section-header">
            <h3>復元ジョブ ({restoreJobs.length}個)</h3>
            <button onClick={handleClearHistory} className="clear-button">
              履歴クリア
            </button>
          </div>
          
          <div className="job-list">
            {restoreJobs.map((job) => (
              <div key={job.key} className={`job-item ${job.restore_status}`}>
                <div className="job-info">
                  <div className="job-name">{job.key}</div>
                  <div className="job-details">
                    <span className="job-status">
                      {RestoreService.getRestoreStatusText(job.restore_status)}
                    </span>
                    <span className="job-tier">
                      {RestoreService.getRestoreTierInfo(job.tier).name}
                    </span>
                    <span className="job-time">
                      開始: {new Date(job.request_time).toLocaleString()}
                    </span>
                    {job.completion_time && (
                      <span className="job-completion">
                        完了: {new Date(job.completion_time).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="job-actions">
                  {job.restore_status === 'completed' && (
                    <button
                      onClick={() => handleDownload(job.key)}
                      className="download-button"
                    >
                      ダウンロード
                    </button>
                  )}
                  {job.restore_status === 'in-progress' && (
                    <button
                      onClick={() => handleCancelJob(job.key)}
                      className="cancel-button"
                    >
                      キャンセル
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}; 