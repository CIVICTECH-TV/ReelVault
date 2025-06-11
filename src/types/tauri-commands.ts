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
  restore_status: string;
  expiry_date?: string;
  tier: string;
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
}

// ===== 設定管理API関連の型定義 =====

export interface AppConfig {
  version: string;
  app_settings: AppSettings;
  user_preferences: UserPreferences;
  aws_settings: AwsSettings;
}

export interface AppSettings {
  auto_save: boolean;
  backup_enabled: boolean;
  log_level: string;
  theme: string;
  language: string;
}

export interface UserPreferences {
  default_bucket_name?: string;
  default_storage_class: string;
  compression_enabled: boolean;
  notification_enabled: boolean;
  recent_files: string[];
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
  status: UploadStatus;
  created_at: string;
  progress: number;
}

export enum UploadStatus {
  Pending = "Pending",
  InProgress = "InProgress", 
  Completed = "Completed",
  Failed = "Failed",
  Paused = "Paused",
}

export interface UploadProgressInfo {
  item_id: string;
  uploaded_bytes: number;
  total_bytes: number;
  percentage: number;
  speed_mbps: number;
  eta_seconds?: number;
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

// API関数のラッパー
export const TauriCommands = {
  // ファイル操作API
  listFiles: (directory: string): Promise<FileInfo[]> =>
    invoke('list_files', { directory }),
  
  getFileInfo: (filePath: string): Promise<FileInfo> =>
    invoke('get_file_info', { filePath }),
  
  watchDirectory: (config: WatchConfig): Promise<string> =>
    invoke('watch_directory', { config }),

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
  
  deleteAwsCredentialsSecure: (profileName: string): Promise<string> =>
    invoke('delete_aws_credentials_secure', { profileName }),

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
  
  backupConfig: (): Promise<string> =>
    invoke('backup_config'),
  
  restoreConfig: (backupPath: string): Promise<AppConfig> =>
    invoke('restore_config', { backupPath }),
  
  addRecentFile: (filePath: string): Promise<AppConfig> =>
    invoke('add_recent_file', { filePath }),
  
  clearRecentFiles: (): Promise<AppConfig> =>
    invoke('clear_recent_files'),

  // 状態管理API
  getAppState: (): Promise<AppState> =>
    invoke('get_app_state'),
  
  setAppState: (newState: AppState): Promise<string> =>
    invoke('set_app_state', { newState }),
  
  updateAppState: (update: StateUpdate): Promise<string> =>
    invoke('update_app_state', { update }),
  
  addToUploadQueue: (filePath: string): Promise<string> =>
    invoke('add_to_upload_queue', { filePath }),
  
  removeFromUploadQueue: (itemId: string): Promise<string> =>
    invoke('remove_from_upload_queue', { itemId }),
  
  updateSystemStats: (): Promise<SystemStatus> =>
    invoke('update_system_stats'),
  
  resetAppState: (): Promise<string> =>
    invoke('reset_app_state'),
  
}; 