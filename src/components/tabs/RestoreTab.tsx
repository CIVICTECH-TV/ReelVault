import React, { useState, useEffect } from 'react';
import { AppConfig, S3Object, TauriCommands, AwsCredentials, RestoreStatusResult } from '../../services/tauriCommands';
import { debugLog, debugError } from '../../utils/debug';

// 正しいインポートパス
import { RestoreOperations, FileOperations, AwsOperations } from '../../services/tauriCommands';


interface RestoreTabProps {
  config: AppConfig;
  credentials: AwsCredentials;
}

export const RestoreTab: React.FC<RestoreTabProps> = ({ config, credentials }) => {
  const [s3Objects, setS3Objects] = useState<S3Object[]>([]);
  const [isLoadingS3Objects, setIsLoadingS3Objects] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [restoreTier, setRestoreTier] = useState<'Expedited' | 'Standard' | 'Bulk'>('Standard');
  const [sortField, setSortField] = useState<'name' | 'size' | 'type' | 'modified'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [restoreStatus, setRestoreStatus] = useState<{ [key: string]: RestoreStatusResult }>({});

  const handleSuccess = (message: string) => {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 5000);
  };

  const handleError = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 8000);
  };
  
  const getAwsConfig = (): AwsConfig | null => {
    if (!credentials.access_key_id || !config.user_preferences.default_bucket_name) {
      handleError("AWS認証情報またはバケット名が設定されていません。");
      return null;
    }
    return {
      access_key_id: credentials.access_key_id,
      secret_access_key: credentials.secret_access_key,
      region: credentials.region,
      bucket_name: config.user_preferences.default_bucket_name,
    };
  }

  const loadS3Objects = async () => {
    const awsConfig = getAwsConfig();
    if (!awsConfig) return;

    setIsLoadingS3Objects(true);
    setError(null);
    try {
      const objects = await AwsOperations.listS3Objects(awsConfig);
      setS3Objects(objects);
      handleSuccess(`${objects.length}個のオブジェクトを読み込みました。`);
    } catch (err) {
      debugError("S3オブジェクトの読み込みに失敗:", err);
      handleError(err instanceof Error ? err.message : "S3オブジェクトの読み込みに失敗しました。");
    } finally {
      setIsLoadingS3Objects(false);
    }
  };

  const checkRestoreStatus = async () => {
    if (s3Objects.length === 0) return;
    const awsConfig = getAwsConfig();
    if (!awsConfig) return;
    
    handleSuccess("復元ステータスの確認を開始します...");
    const statuses: { [key: string]: RestoreStatusResult } = {};
    for (const obj of s3Objects) {
      if(obj.storage_class === "DEEP_ARCHIVE" || obj.storage_class === "GLACIER") {
        try {
          const status = await RestoreOperations.checkRestoreStatus(obj.key, awsConfig);
          statuses[obj.key] = status;
        } catch (err) {
          debugError(`ステータス確認エラー for ${obj.key}:`, err);
          statuses[obj.key] = { key: obj.key, is_restored: false, restore_status: 'failed', error_message: '確認失敗' };
        }
      }
    }
    setRestoreStatus(statuses);
  };

  const handleSort = (field: 'name' | 'size' | 'type' | 'modified') => {
    const newDirection = sortField === field && sortDirection === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDirection(newDirection);
  };

  const getSortedAndGroupedFiles = () => {
    // Implement sorting and grouping logic here
    return s3Objects; // Placeholder
  };
  
  const handleRestoreRequest = async () => {
    if (selectedFiles.length === 0) return;
    const awsConfig = getAwsConfig();
    if (!awsConfig) return;
    
    handleSuccess(`${selectedFiles.length}個のファイルの復元を開始します...`);
    for (const key of selectedFiles) {
        try {
            await RestoreOperations.restoreFile(key, awsConfig, restoreTier);
            // Update status locally for immediate feedback
            setRestoreStatus(prev => ({...prev, [key]: { key, is_restored: false, restore_status: 'in-progress' }}));
        } catch (err) {
            debugError(`復元リクエスト失敗 for ${key}:`, err);
            handleError(`ファイル[${key}]の復元リクエストに失敗しました。`);
        }
    }
  };
  
  const handleDownload = async (key: string) => {
    const awsConfig = getAwsConfig();
    if (!awsConfig) return;
      
    try {
        handleSuccess(`[${key}] のダウンロード準備中...`);
        const selection = await FileOperations.openFileDialog(true, undefined);
        if (selection && selection.selected_files.length > 0) {
            const localPath = selection.selected_files[0];
            const downloadPath = `${localPath}/${key.split('/').pop()}`;
            handleSuccess(`[${key}] を ${downloadPath} へダウンロードします...`);
            await AwsOperations.downloadRestoredFile(key, downloadPath, awsConfig);
            handleSuccess(`[${key}] を ${downloadPath} にダウンロードしました。`);
        }
    } catch (err) {
        debugError(`ダウンロード失敗 for ${key}:`, err);
        handleError(`ファイル[${key}]のダウンロードに失敗しました。`);
    }
  }

  // Render logic...
  return (
    <div className="config-section">
      <div className="restore-header-bar">
        <h3><span className="icon">🔄</span>リストア</h3>
        <div className="header-buttons">
            <button
            onClick={loadS3Objects}
            disabled={isLoadingS3Objects || !config.user_preferences.default_bucket_name}
            className="btn-primary"
            >
            {isLoadingS3Objects ? '🔄 読み込み中...' : '📦 S3オブジェクト一覧を取得'}
            </button>
            <button
            onClick={checkRestoreStatus}
            disabled={s3Objects.length === 0}
            className="btn-secondary"
            >
            🔍 復元状況確認
            </button>
        </div>
      </div>
      {/* More JSX for errors, success, table, etc. will go here */}
       {error && <div className="alert alert-error">❌ {error}</div>}
       {success && <div className="alert alert-success">✅ {success}</div>}
      <div>...テーブルと復元アクションUIは後で実装...</div>
    </div>
  );
};

// 正しい型定義
interface AwsConfig {
  access_key_id: string;
  secret_access_key: string;
  region: string;
  bucket_name: string;
}