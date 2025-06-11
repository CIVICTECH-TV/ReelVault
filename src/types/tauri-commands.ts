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

// ===== 設定管理API関連の型定義 =====

export interface AppConfig {
  aws: AwsSettings;
  app: AppSettings;
  watch: WatchSettings;
}

export interface AwsSettings {
  region: string;
  bucket_name: string;
  access_key_id: string;
  secret_access_key: string;
}

export interface AppSettings {
  auto_start: boolean;
  notification_enabled: boolean;
  log_level: string;
  theme: string;
  language: string;
}

export interface WatchSettings {
  directories: string[];
  file_patterns: string[];
  recursive: boolean;
  auto_upload: boolean;
  exclude_patterns: string[];
}

export interface ConfigUpdate {
  section: string;
  values: Record<string, any>;
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

declare global {
  interface Window {
    __TAURI__: {
      core: {
        invoke: <T>(command: string, args?: any) => Promise<T>;
      };
    };
  }
}

// API関数のラッパー
export const TauriCommands = {
  // ファイル操作API
  listFiles: (directory: string): Promise<FileInfo[]> =>
    window.__TAURI__.core.invoke('list_files', { directory }),
  
  getFileInfo: (filePath: string): Promise<FileInfo> =>
    window.__TAURI__.core.invoke('get_file_info', { filePath }),
  
  watchDirectory: (config: WatchConfig): Promise<string> =>
    window.__TAURI__.core.invoke('watch_directory', { config }),

  // AWS操作API
  testAwsConnection: (config: AwsConfig): Promise<ConnectionTestResult> =>
    window.__TAURI__.core.invoke('test_aws_connection', { config }),
  
  uploadFile: (filePath: string, s3Key: string, config: AwsConfig): Promise<string> =>
    window.__TAURI__.core.invoke('upload_file', { filePath, s3Key, config }),
  
  listS3Objects: (config: AwsConfig, prefix?: string): Promise<S3Object[]> =>
    window.__TAURI__.core.invoke('list_s3_objects', { config, prefix }),
  
  restoreFile: (s3Key: string, config: AwsConfig, tier: string): Promise<RestoreInfo> =>
    window.__TAURI__.core.invoke('restore_file', { s3Key, config, tier }),

  // 設定管理API
  getConfig: (): Promise<AppConfig> =>
    window.__TAURI__.core.invoke('get_config'),
  
  setConfig: (config: AppConfig): Promise<string> =>
    window.__TAURI__.core.invoke('set_config', { config }),
  
  updateConfig: (update: ConfigUpdate): Promise<string> =>
    window.__TAURI__.core.invoke('update_config', { update }),
  
  resetConfig: (): Promise<string> =>
    window.__TAURI__.core.invoke('reset_config'),

  // 状態管理API
  getAppState: (): Promise<AppState> =>
    window.__TAURI__.core.invoke('get_app_state'),
  
  setAppState: (newState: AppState): Promise<string> =>
    window.__TAURI__.core.invoke('set_app_state', { newState }),
  
  updateAppState: (update: StateUpdate): Promise<string> =>
    window.__TAURI__.core.invoke('update_app_state', { update }),
  
  addToUploadQueue: (filePath: string): Promise<string> =>
    window.__TAURI__.core.invoke('add_to_upload_queue', { filePath }),
  
  removeFromUploadQueue: (itemId: string): Promise<string> =>
    window.__TAURI__.core.invoke('remove_from_upload_queue', { itemId }),
  
  updateSystemStats: (): Promise<SystemStatus> =>
    window.__TAURI__.core.invoke('update_system_stats'),
  
  resetAppState: (): Promise<string> =>
    window.__TAURI__.core.invoke('reset_app_state'),
}; 