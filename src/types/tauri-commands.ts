// ===== ファイル操作API関連の型定義 =====

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: string;
  is_directory: boolean;
  extension?: string;
}

export interface WatchConfig {
  path: string;
  recursive: boolean;
  file_patterns: string[];
  max_file_size_mb?: number; // ファイルサイズ制限（MB）
  auto_upload: boolean; // 自動アップロード有効
  exclude_patterns: string[]; // 除外パターン (例: ["*.tmp", "*/.DS_Store"])
  exclude_directories: string[]; // 除外ディレクトリ
  auto_metadata: boolean; // 自動メタデータ作成
}

// ===== AWS操作API関連の型定義 =====

export interface AwsConfig {
  access_key_id: string;
  secret_access_key: string;
  region: string;
  bucket_name: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  bucket_accessible: boolean;
}

export interface S3Object {
  key: string;
  size: number;
  last_modified: string;
  storage_class: string;
  etag: string;
}

export interface UploadProgress {
  uploaded_bytes: number;
  total_bytes: number;
  percentage: number;
  status: string;
}

export interface RestoreInfo {
  key: string;
  restore_status: string; // "in-progress", "completed", "failed", "cancelled"
  expiry_date?: string;
  tier: string; // "Standard", "Expedited", "Bulk"
  request_time: string;
  completion_time?: string;
}

// 復元状況監視結果
export interface RestoreStatusResult {
  key: string;
  is_restored: boolean;
  restore_status: string;
  expiry_date?: string;
  error_message?: string;
}

// ダウンロード進捗情報
export interface DownloadProgress {
  key: string;
  downloaded_bytes: number;
  total_bytes: number;
  percentage: number;
  status: string; // "downloading", "completed", "failed"
  local_path?: string;
}

// 復元通知情報
export interface RestoreNotification {
  key: string;
  status: string; // "completed", "failed", "expired"
  message: string;
  timestamp: string;
}

// ===== ライフサイクル管理API関連の型定義 =====

export interface LifecyclePolicyResult {
  success: boolean;
  message: string;
  rule_id: string;
  transition_days: number;
  storage_class: string;
}

export interface LifecyclePolicyStatus {
  enabled: boolean;
  rule_id?: string;
  transition_days?: number;
  storage_class?: string;
  prefix?: string;
  error_message?: string;
}

export interface LifecycleRule {
  id: string;
  status: string; // "Enabled" or "Disabled"
  prefix?: string;
  transitions: LifecycleTransition[];
}

export interface LifecycleTransition {
  days: number;
  storage_class: string;
}

// ===== AWS認証API関連の型定義 =====

export interface AwsCredentials {
  access_key_id: string;
  secret_access_key: string;
  region: string;
  session_token?: string;
}

export interface AwsAuthResult {
  success: boolean;
  message: string;
  user_identity?: AwsUserIdentity;
  permissions: string[];
}

export interface AwsUserIdentity {
  user_id: string;
  arn: string;
  account: string;
}

export interface PermissionCheck {
  service: string;
  action: string;
  resource: string;
  allowed: boolean;
  error?: string;
}

// ===== 設定管理API関連の型定義 =====

export interface AppConfig {
  version: string;
  app_settings: AppSettings;
  user_preferences: UserPreferences;
  aws_settings: AwsSettings;
}

export interface AppSettings {
  log_level: string;
  theme: string;
  language: string;
}

export interface UserPreferences {
  default_bucket_name?: string;
  default_storage_class: string;
}

export interface AwsSettings {
  default_region: string;
  timeout_seconds: number;
  max_retries: number;
  profile_name?: string;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ConfigUpdate {
  [key: string]: any;
}

// ===== 状態管理API関連の型定義 =====

export interface AppState {
  is_watching: boolean;
  upload_queue: UploadItem[];
  current_uploads: UploadProgressInfo[];
  statistics: AppStatistics;
  last_error?: string;
  system_status: SystemStatus;
}

export interface UploadItem {
  id: string;
  file_path: string;
  file_name: string;
  file_size: number;
  s3_key: string;
  status: UploadStatus;
  progress: number;
  uploaded_bytes: number;
  speed_mbps: number;
  eta_seconds?: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  retry_count: number;
}

export enum UploadStatus {
  Pending = "Pending",
  InProgress = "InProgress", 
  Completed = "Completed",
  Failed = "Failed",
  Paused = "Paused",
  Cancelled = "Cancelled",
}

export interface UploadProgressInfo {
  item_id: string;
  uploaded_bytes: number;
  total_bytes: number;
  percentage: number;
  speed_mbps: number;
  eta_seconds?: number;
  status: UploadStatus;
}

// 新しいアップロードシステム用の型定義

export interface UploadConfig {
  aws_credentials: AwsCredentials;
  bucket_name: string;
  max_concurrent_uploads: number;
  chunk_size_mb: number;
  retry_attempts: number;
  timeout_seconds: number;
  auto_create_metadata: boolean;
  s3_key_prefix?: string;
  
  // 🎯 統一システム用の制限パラメータ
  max_concurrent_parts: number;        // チャンクレベル並列度（無料版: 1, プレミアム版: 4-8）
  adaptive_chunk_size: boolean;        // 動的チャンクサイズ（無料版: false, プレミアム版: true）
  min_chunk_size_mb: number;          // 最小チャンクサイズ（無料版: 5MB固定）
  max_chunk_size_mb: number;          // 最大チャンクサイズ（無料版: 5MB固定）
  bandwidth_limit_mbps?: number;       // 帯域制限（無料版: なし, プレミアム版: 設定可能）
  enable_resume: boolean;              // 中断・再開機能（無料版: false, プレミアム版: true）
  tier: 'Free' | 'Premium';           // 機能ティア
}

export interface UploadStatistics {
  total_files: number;
  completed_files: number;
  failed_files: number;
  pending_files: number;
  in_progress_files: number;
  total_bytes: number;
  uploaded_bytes: number;
  average_speed_mbps: number;
  estimated_time_remaining?: number;
}

export interface FileSelection {
  selected_files: string[];
  total_size: number;
  file_count: number;
}

export interface S3KeyConfig {
  prefix?: string;
  use_date_folder: boolean;
  preserve_directory_structure: boolean;
  custom_naming_pattern?: string;
}

export interface AppStatistics {
  total_files_uploaded: number;
  total_bytes_uploaded: number;
  files_in_queue: number;
  successful_uploads: number;
  failed_uploads: number;
  average_upload_speed_mbps: number;
}

export interface SystemStatus {
  aws_connected: boolean;
  disk_space_gb: number;
  memory_usage_mb: number;
  cpu_usage_percent: number;
  network_available: boolean;
  last_heartbeat: string;
}

export interface StateUpdate {
  field: string;
  value: any;
}

// ===== Tauri Command API関数の型定義 =====

import { invoke } from '@tauri-apps/api/core';
import { FileMetadata, MetadataSearchQuery } from './metadata';

// API関数のラッパー
export const TauriCommands = {
  // ファイル操作API
  listFiles: (directory: string): Promise<FileInfo[]> =>
    invoke('list_files', { directory }),
  
  getFileInfo: (filePath: string): Promise<FileInfo> =>
    invoke('get_file_info', { filePath }),
  
  watchDirectory: (config: WatchConfig): Promise<string> =>
    invoke('watch_directory', { config }),
    
  testWatchSystem: (config: WatchConfig): Promise<string> =>
    invoke('test_watch_system', { config }),
    
  getSampleWatchConfigs: (): Promise<WatchConfig[]> =>
    invoke('get_sample_watch_configs'),

  // AWS操作API
  testAwsConnection: (config: AwsConfig): Promise<ConnectionTestResult> =>
    invoke('test_aws_connection', { config }),
  
  uploadFile: (filePath: string, s3Key: string, config: AwsConfig): Promise<string> =>
    invoke('upload_file', { filePath, s3Key, config }),
  
  listS3Objects: (config: AwsConfig, prefix?: string): Promise<S3Object[]> =>
    invoke('list_s3_objects', { config, prefix }),
  
  restoreFile: (s3Key: string, config: AwsConfig, tier: string): Promise<RestoreInfo> =>
    invoke('restore_file', { s3Key, config, tier }),

  // AWS認証API
  authenticateAws: (credentials: AwsCredentials): Promise<AwsAuthResult> =>
    invoke('authenticate_aws', { credentials }),
  
  testS3BucketAccess: (credentials: AwsCredentials, bucketName: string): Promise<PermissionCheck> =>
    invoke('test_s3_bucket_access', { credentials, bucketName }),
  
  saveAwsCredentialsSecure: (credentials: AwsCredentials, profileName: string): Promise<string> =>
    invoke('save_aws_credentials_secure', { credentials, profileName }),
  
  loadAwsCredentialsSecure: (profileName: string): Promise<AwsCredentials> =>
    invoke('load_aws_credentials_secure', { profileName }),

  // 設定管理API
  getConfig: (): Promise<AppConfig> =>
    invoke('get_config'),
  
  setConfig: (config: AppConfig): Promise<boolean> =>
    invoke('set_config', { config }),
  
  updateConfig: (updates: ConfigUpdate): Promise<AppConfig> =>
    invoke('update_config', { updates }),
  
  resetConfig: (): Promise<AppConfig> =>
    invoke('reset_config'),
  
  validateConfigFile: (): Promise<ConfigValidationResult> =>
    invoke('validate_config_file'),
  
  validateConfig: (config: AppConfig): Promise<ConfigValidationResult> =>
    invoke('validate_config_data', { config }),
  
  backupConfig: (): Promise<string> =>
    invoke('backup_config'),
  
  exportConfig: (exportPath?: string): Promise<string> =>
    invoke('export_config', { exportPath }),
  
  importConfig: (importPath: string): Promise<AppConfig> =>
    invoke('import_config', { importPath }),
  
  restoreConfig: (backupPath: string): Promise<AppConfig> =>
    invoke('restore_config', { backupPath }),
  


  // 状態管理API
  getAppState: (): Promise<AppState> =>
    invoke('get_app_state'),
  
  setAppState: (newState: AppState): Promise<string> =>
    invoke('set_app_state', { newState }),
  
  updateAppState: (update: StateUpdate): Promise<string> =>
    invoke('update_app_state', { update }),
  
  addToUploadQueue: (filePath: string): Promise<string> =>
    invoke('add_to_upload_queue', { filePath }),
  
  removeUploadItem: (itemId: string): Promise<string> =>
    invoke('remove_upload_item', { itemId }),
  
  updateSystemStats: (): Promise<SystemStatus> =>
    invoke('update_system_stats'),
  
  resetAppState: (): Promise<string> =>
    invoke('reset_app_state'),

  // メタデータ管理API
  initializeMetadataDb: (): Promise<string> =>
    invoke('initialize_metadata_db'),
  
  createFileMetadata: (filePath: string): Promise<FileMetadata> =>
    invoke('create_file_metadata', { filePath }),
  
  saveFileMetadata: (metadata: FileMetadata): Promise<string> =>
    invoke('save_file_metadata', { metadata }),
  
  searchFileMetadata: (query: MetadataSearchQuery): Promise<FileMetadata[]> =>
    invoke('search_file_metadata', { query }),
  
  updateFileMetadata: (metadata: FileMetadata): Promise<string> =>
    invoke('update_file_metadata', { metadata }),
  
  deleteFileMetadata: (filePath: string): Promise<string> =>
    invoke('delete_file_metadata', { filePath }),
  
  getAllTags: (): Promise<string[]> =>
    invoke('get_all_tags'),

  // アップロードシステムAPI
  initializeUploadQueue: (config: UploadConfig): Promise<string> =>
    invoke('initialize_upload_queue', { config }),
  
  openFileDialog: (multiple: boolean, fileTypes?: string[]): Promise<FileSelection> =>
    invoke('open_file_dialog', { multiple, fileTypes }),
  
  addFilesToUploadQueue: (filePaths: string[], s3KeyConfig: S3KeyConfig): Promise<string[]> =>
    invoke('add_files_to_upload_queue', { filePaths, s3KeyConfig }),
  
  startUploadProcessing: (): Promise<string> =>
    invoke('start_upload_processing'),
  
  stopUploadProcessing: (): Promise<string> =>
    invoke('stop_upload_processing'),
  
  getUploadQueueStatus: (): Promise<UploadStatistics> =>
    invoke('get_upload_queue_status'),
  
  getUploadQueueItems: (): Promise<UploadItem[]> =>
    invoke('get_upload_queue_items'),
  
  retryUploadItem: (itemId: string): Promise<string> =>
    invoke('retry_upload_item', { itemId }),
  
  clearUploadQueue: (): Promise<string> =>
    invoke('clear_upload_queue'),
  
  testUploadConfig: (config: UploadConfig): Promise<string> =>
    invoke('test_upload_config', { config }),

  // 復元機能API
  checkRestoreStatus: (s3Key: string, config: AwsConfig): Promise<RestoreStatusResult> =>
    invoke('check_restore_status', { s3Key, config }),
  
  getRestoreNotifications: (): Promise<RestoreNotification[]> =>
    invoke('get_restore_notifications'),
  
  downloadS3File: (s3Key: string, localPath: string, config: AwsConfig): Promise<DownloadProgress> =>
    invoke('download_s3_file', { s3Key, localPath, config }),
  
  downloadRestoredFile: (s3Key: string, localPath: string, config: AwsConfig): Promise<DownloadProgress> =>
    invoke('download_restored_file', { s3Key, localPath, config }),
  
  listRestoreJobs: (): Promise<RestoreInfo[]> =>
    invoke('list_restore_jobs'),
  
  cancelRestoreJob: (s3Key: string): Promise<string> =>
    invoke('cancel_restore_job', { s3Key }),
  
  clearRestoreHistory: (): Promise<string> =>
    invoke('clear_restore_history'),

  // ライフサイクル管理API
  enableReelvaultLifecycle: (config: AwsConfig): Promise<LifecyclePolicyResult> =>
    invoke('enable_reelvault_lifecycle', { config }),
  
  getLifecycleStatus: (config: AwsConfig): Promise<LifecyclePolicyStatus> =>
    invoke('get_lifecycle_status', { config }),
  
  disableLifecyclePolicy: (config: AwsConfig): Promise<LifecyclePolicyResult> =>
    invoke('disable_lifecycle_policy', { config }),
  
  listLifecycleRules: (config: AwsConfig): Promise<LifecycleRule[]> =>
    invoke('list_lifecycle_rules', { config }),
  
  validateLifecycleConfig: (config: AwsConfig): Promise<boolean> =>
    invoke('validate_lifecycle_config', { config }),
  
  checkUploadReadiness: (config: AwsConfig): Promise<{ safe: boolean; message: string; lifecycle_healthy: boolean }> =>
    invoke('check_upload_readiness', { config }),

}; 