// Tauri APIの呼び出しをラップするサービス層
// 型定義は src/types/tauri-commands.ts から import

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  // ファイル操作API関連
  FileInfo,
  WatchConfig,
  
  // AWS操作API関連
  AwsConfig,
  ConnectionTestResult,
  S3Object,
  UploadProgress,
  RestoreInfo,
  RestoreStatusResult,
  DownloadProgress,
  RestoreNotification,
  
  // ライフサイクル管理API関連
  LifecyclePolicyResult,
  LifecyclePolicyStatus,
  LifecycleRule,
  LifecycleTransition,
  
  // AWS認証API関連
  AwsCredentials,
  AwsAuthResult,
  AwsUserIdentity,
  PermissionCheck,
  
  // 設定管理API関連
  AppConfig,
  AppSettings,
  UserPreferences,
  AwsSettings,
  ConfigValidationResult,
  ConfigUpdate,
  
  // 状態管理API関連
  AppState,
  UploadItem,
  UploadStatistics,
  FileSelection,
  UploadConfig,
  UploadProgressInfo,
  UploadStatistics as UploadStats,
  S3KeyConfig,
  AppStatistics,
  SystemStatus,
  StateUpdate
} from '../types/tauri-commands';

// UploadStatusをenumとして再export
export enum UploadStatus {
  Pending = "Pending",
  InProgress = "InProgress", 
  Completed = "Completed",
  Failed = "Failed",
  Paused = "Paused",
  Cancelled = "Cancelled",
}

// ===== ファイル操作API =====

export const FileOperations = {
  async listFiles(path: string): Promise<FileInfo[]> {
    return invoke('list_files', { path });
  },

  async getFileInfo(path: string): Promise<FileInfo> {
    return invoke('get_file_info', { path });
  },

  async openFileDialog(multiple: boolean, filters?: string[]): Promise<FileSelection> {
    return invoke('open_file_dialog', { multiple, filters });
  }
};

// ===== AWS操作API =====

export const AwsOperations = {
  async testS3BucketAccess(credentials: AwsCredentials, bucketName: string): Promise<ConnectionTestResult> {
    return invoke('test_s3_bucket_access', { credentials, bucketName });
  },

  async listS3Objects(config: AwsConfig, prefix?: string): Promise<S3Object[]> {
    return invoke('list_s3_objects', { config, prefix });
  },

  async getS3Object(bucketName: string, key: string): Promise<S3Object> {
    return invoke('get_s3_object', { bucketName, key });
  },

  async downloadS3File(key: string, localPath: string, config: AwsConfig): Promise<void> {
    return invoke('download_s3_file', { key, localPath, config });
  },

  async downloadRestoredFile(key: string, localPath: string, config: AwsConfig): Promise<void> {
    return invoke('download_restored_file', { key, localPath, config });
  }
};

// ===== アップロードAPI =====

export const UploadOperations = {
  async initializeUploadQueue(config: UploadConfig): Promise<void> {
    return invoke('initialize_upload_queue', { config });
  },

  async addFilesToUploadQueue(filePaths: string[], s3KeyConfig: S3KeyConfig): Promise<void> {
    return invoke('add_files_to_upload_queue', { filePaths, s3KeyConfig });
  },

  async startUploadProcessing(): Promise<void> {
    return invoke('start_upload_processing');
  },

  async stopUploadProcessing(): Promise<void> {
    return invoke('stop_upload_processing');
  },

  async clearUploadQueue(): Promise<void> {
    return invoke('clear_upload_queue');
  },

  async getUploadQueueItems(): Promise<UploadItem[]> {
    return invoke('get_upload_queue_items');
  },

  async getUploadQueueStatus(): Promise<UploadStatistics> {
    return invoke('get_upload_queue_status');
  },

  async retryUploadItem(itemId: string): Promise<void> {
    return invoke('retry_upload_item', { itemId });
  },

  async removeUploadItem(itemId: string): Promise<void> {
    return invoke('remove_upload_item', { itemId });
  }
};

// ===== 復元API =====

export const RestoreOperations = {
  async restoreFile(key: string, config: AwsConfig, tier: string): Promise<RestoreInfo> {
    return invoke('restore_file', { key, config, tier });
  },

  async checkRestoreStatus(key: string, config: AwsConfig): Promise<RestoreStatusResult> {
    return invoke('check_restore_status', { key, config });
  },

  async listRestoreJobs(): Promise<RestoreInfo[]> {
    return invoke('list_restore_jobs');
  },

  async getRestoreNotifications(): Promise<RestoreNotification[]> {
    return invoke('get_restore_notifications');
  },

  async clearRestoreHistory(): Promise<void> {
    return invoke('clear_restore_history');
  }
};

// ===== ライフサイクル管理API =====

export const LifecycleOperations = {
  async getLifecycleStatus(config: AwsConfig): Promise<LifecyclePolicyStatus> {
    return invoke('get_lifecycle_status', { config });
  },

  async listLifecycleRules(config: AwsConfig): Promise<LifecycleRule[]> {
    return invoke('list_lifecycle_rules', { config });
  },

  async enableReelvaultLifecycle(config: AwsConfig): Promise<LifecyclePolicyResult> {
    return invoke('enable_reelvault_lifecycle', { config });
  },

  async validateLifecycleConfig(config: AwsConfig): Promise<boolean> {
    return invoke('validate_lifecycle_config', { config });
  }
};

// ===== AWS認証API =====

export const AuthOperations = {
  async authenticateAws(credentials: AwsCredentials): Promise<AwsAuthResult> {
    return invoke('authenticate_aws', { credentials });
  },

  async saveAwsCredentialsSecure(credentials: AwsCredentials, profileName: string): Promise<void> {
    return invoke('save_aws_credentials_secure', { credentials, profileName });
  },

  async loadAwsCredentialsSecure(profileName: string): Promise<AwsCredentials> {
    return invoke('load_aws_credentials_secure', { profileName });
  },

  async checkBasicPermissions(credentials: AwsCredentials): Promise<PermissionCheck[]> {
    return invoke('check_basic_permissions', { credentials });
  }
};

// ===== 設定管理API =====

export const ConfigOperations = {
  async getConfig(): Promise<AppConfig> {
    return invoke('get_config');
  },

  async setConfig(config: AppConfig): Promise<void> {
    return invoke('set_config', { config });
  },

  async updateConfig(updates: ConfigUpdate): Promise<void> {
    return invoke('update_config', { updates });
  },

  async resetConfig(): Promise<AppConfig> {
    return invoke('reset_config');
  },

  async validateConfig(config: AppConfig): Promise<ConfigValidationResult> {
    return invoke('validate_config', { config });
  },

  async validateConfigFile(): Promise<ConfigValidationResult> {
    return invoke('validate_config_file');
  }
};

// ===== 状態管理API =====

export const StateOperations = {
  async getAppState(): Promise<AppState> {
    return invoke('get_app_state');
  },

  async updateAppState(update: StateUpdate): Promise<void> {
    return invoke('update_app_state', { update });
  },

  async updateSystemStats(): Promise<SystemStatus> {
    return invoke('update_system_stats');
  }
};

// ===== イベントリスナー =====

export const EventListeners = {
  async listenToUploadProgress(callback: (progress: UploadProgressInfo) => void): Promise<() => void> {
    return listen<UploadProgressInfo>('upload-progress', (event) => {
      callback(event.payload);
    });
  },

  async listenToTestEvent(callback: (event: any) => void): Promise<() => void> {
    return listen('test-event', callback);
  }
};

// ===== 統合API（後方互換性のため） =====

export const TauriCommands = {
  // ファイル操作
  listFiles: FileOperations.listFiles,
  getFileInfo: FileOperations.getFileInfo,
  openFileDialog: FileOperations.openFileDialog,

  // AWS操作
  testS3BucketAccess: AwsOperations.testS3BucketAccess,
  listS3Objects: AwsOperations.listS3Objects,
  getS3Object: AwsOperations.getS3Object,
  downloadS3File: AwsOperations.downloadS3File,
  downloadRestoredFile: AwsOperations.downloadRestoredFile,

  // アップロード
  initializeUploadQueue: UploadOperations.initializeUploadQueue,
  addFilesToUploadQueue: UploadOperations.addFilesToUploadQueue,
  startUploadProcessing: UploadOperations.startUploadProcessing,
  stopUploadProcessing: UploadOperations.stopUploadProcessing,
  clearUploadQueue: UploadOperations.clearUploadQueue,
  getUploadQueueItems: UploadOperations.getUploadQueueItems,
  getUploadQueueStatus: UploadOperations.getUploadQueueStatus,
  retryUploadItem: UploadOperations.retryUploadItem,
  removeUploadItem: UploadOperations.removeUploadItem,

  // 復元
  restoreFile: RestoreOperations.restoreFile,
  checkRestoreStatus: RestoreOperations.checkRestoreStatus,
  listRestoreJobs: RestoreOperations.listRestoreJobs,
  getRestoreNotifications: RestoreOperations.getRestoreNotifications,
  clearRestoreHistory: RestoreOperations.clearRestoreHistory,

  // ライフサイクル
  getLifecycleStatus: LifecycleOperations.getLifecycleStatus,
  listLifecycleRules: LifecycleOperations.listLifecycleRules,
  enableReelvaultLifecycle: LifecycleOperations.enableReelvaultLifecycle,
  validateLifecycleConfig: LifecycleOperations.validateLifecycleConfig,

  // 認証
  authenticateAws: AuthOperations.authenticateAws,
  saveAwsCredentialsSecure: AuthOperations.saveAwsCredentialsSecure,
  loadAwsCredentialsSecure: AuthOperations.loadAwsCredentialsSecure,
  checkBasicPermissions: AuthOperations.checkBasicPermissions,

  // 設定
  getConfig: ConfigOperations.getConfig,
  setConfig: ConfigOperations.setConfig,
  updateConfig: ConfigOperations.updateConfig,
  resetConfig: ConfigOperations.resetConfig,
  validateConfig: ConfigOperations.validateConfig,
  validateConfigFile: ConfigOperations.validateConfigFile,

  // 状態
  getAppState: StateOperations.getAppState,
  updateAppState: StateOperations.updateAppState,
  updateSystemStats: StateOperations.updateSystemStats
};

// 型エクスポート（後方互換性のため）
export type {
  FileInfo,
  WatchConfig,
  AwsConfig,
  ConnectionTestResult,
  S3Object,
  UploadProgress,
  RestoreInfo,
  RestoreStatusResult,
  DownloadProgress,
  RestoreNotification,
  LifecyclePolicyResult,
  LifecyclePolicyStatus,
  LifecycleRule,
  LifecycleTransition,
  AwsCredentials,
  AwsAuthResult,
  AwsUserIdentity,
  PermissionCheck,
  AppConfig,
  AppSettings,
  UserPreferences,
  AwsSettings,
  ConfigValidationResult,
  ConfigUpdate,
  AppState,
  UploadItem,
  UploadStatistics,
  FileSelection,
  UploadConfig,
  UploadProgressInfo,
  S3KeyConfig,
  AppStatistics,
  SystemStatus,
  StateUpdate
}; 