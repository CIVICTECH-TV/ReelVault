import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FileOperations,
  AwsOperations,
  UploadOperations,
  RestoreOperations,
  LifecycleOperations,
  AuthOperations,
  ConfigOperations,
  StateOperations,
  EventListeners,
  TauriCommands,
  UploadStatus
} from '../tauriCommands';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// Tauri APIのモック
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

// モックデータ
const mockFileInfo = {
  name: 'test.mp4',
  path: '/path/to/test.mp4',
  size: 1024,
  modified: new Date().toISOString(),
  is_directory: false,
  extension: 'mp4',
};

const mockAwsCredentials = {
  access_key_id: 'test-access-key',
  secret_access_key: 'test-secret-key',
  region: 'ap-northeast-1',
  session_token: 'test-session-token',
};

const mockAwsConfig = {
  access_key_id: 'test-access-key',
  secret_access_key: 'test-secret-key',
  region: 'ap-northeast-1',
  bucket_name: 'test-bucket',
};

const mockS3Object = {
  key: 'test-file.mp4',
  size: 1024,
  last_modified: new Date().toISOString(),
  storage_class: 'STANDARD',
  etag: 'test-etag',
};

const mockUploadItem = {
  id: 'test-upload-id',
  file_path: '/path/to/test.mp4',
  s3_key: 'uploads/test.mp4',
  status: UploadStatus.Pending,
  progress: 0,
  uploaded_bytes: 0,
  file_size: 1024,
  speed_mbps: 0,
  created_at: new Date().toISOString(),
  retry_count: 0,
};

const mockAppConfig = {
  version: '0.1.0',
  app_settings: {
    log_level: 'info',
    theme: 'dark',
    language: 'ja',
  },
  user_preferences: {
    default_bucket_name: 'test-bucket',
    default_storage_class: 'STANDARD',
  },
  aws_settings: {
    default_region: 'ap-northeast-1',
    timeout_seconds: 60,
    max_retries: 3,
    profile_name: 'default',
  },
};

const mockAppState = {
  is_watching: false,
  upload_queue: [mockUploadItem],
  current_uploads: [],
  statistics: {
    total_files: 1,
    completed_files: 0,
    failed_files: 0,
    pending_files: 1,
    in_progress_files: 0,
    total_bytes: 1024,
    uploaded_bytes: 0,
    average_speed_mbps: 0,
  },
  system_status: {
    aws_connected: true,
    disk_space_gb: 100,
    memory_usage_mb: 2048,
    cpu_usage_percent: 10,
    network_available: true,
    last_heartbeat: new Date().toISOString(),
  },
};

const uploadConfig = {
  aws_credentials: mockAwsCredentials,
  bucket_name: 'test-bucket',
  max_concurrent_uploads: 3,
  chunk_size_mb: 5,
  retry_attempts: 3,
  timeout_seconds: 60,
  auto_create_metadata: false,
  max_concurrent_parts: 1,
  adaptive_chunk_size: false,
  min_chunk_size_mb: 5,
  max_chunk_size_mb: 5,
  enable_resume: false,
  tier: 'Free' as const,
};

const s3KeyConfig = {
  prefix: 'uploads/',
  use_date_folder: false,
  preserve_directory_structure: true,
};

describe('tauriCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('FileOperations', () => {
    it('should list files successfully', async () => {
      vi.mocked(invoke).mockResolvedValue([mockFileInfo]);
      const result = await FileOperations.listFiles('/test/path');
      expect(invoke).toHaveBeenCalledWith('list_files', { path: '/test/path' });
      expect(result).toEqual([mockFileInfo]);
    });

    it('should get file info successfully', async () => {
      vi.mocked(invoke).mockResolvedValue(mockFileInfo);
      const result = await FileOperations.getFileInfo('/test/path/file.mp4');
      expect(invoke).toHaveBeenCalledWith('get_file_info', { path: '/test/path/file.mp4' });
      expect(result).toEqual(mockFileInfo);
    });

    it('should open file dialog successfully', async () => {
      const mockSelection = { files: ['/path/to/file1.mp4', '/path/to/file2.mp4'] };
      vi.mocked(invoke).mockResolvedValue(mockSelection);
      const result = await FileOperations.openFileDialog(true, ['*.mp4', '*.mov']);
      expect(invoke).toHaveBeenCalledWith('open_file_dialog', { multiple: true, filters: ['*.mp4', '*.mov'] });
      expect(result).toEqual(mockSelection);
    });
  });

  describe('AwsOperations', () => {
    it('should test S3 bucket access successfully', async () => {
      vi.mocked(invoke).mockResolvedValue({ success: true, message: 'Access granted' });
      const result = await AwsOperations.testS3BucketAccess(mockAwsCredentials, 'test-bucket');
      expect(invoke).toHaveBeenCalledWith('test_s3_bucket_access', { 
        credentials: mockAwsCredentials, 
        bucketName: 'test-bucket' 
      });
      expect(result).toEqual({ success: true, message: 'Access granted' });
    });

    it('should list S3 objects successfully', async () => {
      vi.mocked(invoke).mockResolvedValue([mockS3Object]);
      const result = await AwsOperations.listS3Objects(mockAwsConfig, 'prefix/');
      expect(invoke).toHaveBeenCalledWith('list_s3_objects', {
        config: mockAwsConfig,
        prefix: 'prefix/'
      });
      expect(result).toEqual([mockS3Object]);
    });

    it('should get S3 object successfully', async () => {
      vi.mocked(invoke).mockResolvedValue(mockS3Object);
      const result = await AwsOperations.getS3Object('test-bucket', 'test-key');
      expect(invoke).toHaveBeenCalledWith('get_s3_object', { 
        bucketName: 'test-bucket', 
        key: 'test-key' 
      });
      expect(result).toEqual(mockS3Object);
    });

    it('should download S3 file successfully', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      await AwsOperations.downloadS3File('test-key', '/local/path', mockAwsConfig);
      expect(invoke).toHaveBeenCalledWith('download_s3_file', { 
        key: 'test-key', 
        localPath: '/local/path', 
        config: mockAwsConfig 
      });
    });

    it('should download restored file successfully', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      await AwsOperations.downloadRestoredFile('test-key', '/local/path', mockAwsConfig);
      expect(invoke).toHaveBeenCalledWith('download_restored_file', { 
        key: 'test-key', 
        localPath: '/local/path', 
        config: mockAwsConfig 
      });
    });
  });

  describe('UploadOperations', () => {
    it('should initialize upload queue successfully', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      await UploadOperations.initializeUploadQueue(uploadConfig);
      expect(invoke).toHaveBeenCalledWith('initialize_upload_queue', { config: uploadConfig });
    });

    it('should add files to upload queue successfully', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      const filePaths = ['/path/to/file1.mp4', '/path/to/file2.mp4'];
      await UploadOperations.addFilesToUploadQueue(filePaths, s3KeyConfig);
      expect(invoke).toHaveBeenCalledWith('add_files_to_upload_queue', { 
        filePaths, 
        s3KeyConfig 
      });
    });

    it('should start upload processing successfully', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      await UploadOperations.startUploadProcessing();
      expect(invoke).toHaveBeenCalledWith('start_upload_processing');
    });

    it('should stop upload processing successfully', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      await UploadOperations.stopUploadProcessing();
      expect(invoke).toHaveBeenCalledWith('stop_upload_processing');
    });

    it('should clear upload queue successfully', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      await UploadOperations.clearUploadQueue();
      expect(invoke).toHaveBeenCalledWith('clear_upload_queue');
    });

    it('should get upload queue items successfully', async () => {
      vi.mocked(invoke).mockResolvedValue([mockUploadItem]);
      const result = await UploadOperations.getUploadQueueItems();
      expect(invoke).toHaveBeenCalledWith('get_upload_queue_items');
      expect(result).toEqual([mockUploadItem]);
    });

    it('should get upload queue status successfully', async () => {
      vi.mocked(invoke).mockResolvedValue({ totalUploads: 1, completedUploads: 0, failedUploads: 0 });
      const result = await UploadOperations.getUploadQueueStatus();
      expect(invoke).toHaveBeenCalledWith('get_upload_queue_status');
      expect(result).toEqual({ totalUploads: 1, completedUploads: 0, failedUploads: 0 });
    });

    it('should retry upload item successfully', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      await UploadOperations.retryUploadItem('test-item-id');
      expect(invoke).toHaveBeenCalledWith('retry_upload_item', { itemId: 'test-item-id' });
    });

    it('should remove upload item successfully', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      await UploadOperations.removeUploadItem('test-item-id');
      expect(invoke).toHaveBeenCalledWith('remove_upload_item', { itemId: 'test-item-id' });
    });
  });

  describe('RestoreOperations', () => {
    it('should restore file successfully', async () => {
      vi.mocked(invoke).mockResolvedValue({ 
        key: 'test-key', 
        status: 'InProgress', 
        requestTime: new Date().toISOString() 
      });
      const result = await RestoreOperations.restoreFile('test-key', mockAwsConfig, 'Standard');
      expect(invoke).toHaveBeenCalledWith('restore_file', { 
        key: 'test-key', 
        config: mockAwsConfig, 
        tier: 'Standard' 
      });
      expect(result).toEqual({ 
        key: 'test-key', 
        status: 'InProgress', 
        requestTime: new Date().toISOString() 
      });
    });

    it('should check restore status successfully', async () => {
      const mockExpiryDate = '2025-06-19T12:32:56.820Z';
      vi.mocked(invoke).mockResolvedValue({ 
        key: 'test-key', 
        status: 'Completed', 
        expiryDate: mockExpiryDate 
      });
      const result = await RestoreOperations.checkRestoreStatus('test-key', mockAwsConfig);
      expect(invoke).toHaveBeenCalledWith('check_restore_status', { 
        key: 'test-key', 
        config: mockAwsConfig 
      });
      expect(result).toEqual({ 
        key: 'test-key', 
        status: 'Completed', 
        expiryDate: mockExpiryDate 
      });
    });

    it('should list restore jobs successfully', async () => {
      vi.mocked(invoke).mockResolvedValue([{ key: 'test-key', status: 'Completed' }]);
      const result = await RestoreOperations.listRestoreJobs();
      expect(invoke).toHaveBeenCalledWith('list_restore_jobs');
      expect(result).toEqual([{ key: 'test-key', status: 'Completed' }]);
    });

    it('should get restore notifications successfully', async () => {
      vi.mocked(invoke).mockResolvedValue([{ key: 'test-key', message: 'Restore completed' }]);
      const result = await RestoreOperations.getRestoreNotifications();
      expect(invoke).toHaveBeenCalledWith('get_restore_notifications');
      expect(result).toEqual([{ key: 'test-key', message: 'Restore completed' }]);
    });

    it('should clear restore history successfully', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      await RestoreOperations.clearRestoreHistory();
      expect(invoke).toHaveBeenCalledWith('clear_restore_history');
    });
  });

  describe('LifecycleOperations', () => {
    it('should get lifecycle status successfully', async () => {
      vi.mocked(invoke).mockResolvedValue({ 
        enabled: true, 
        ruleId: 'test-rule', 
        transitionDays: 30 
      });
      const result = await LifecycleOperations.getLifecycleStatus(mockAwsConfig);
      expect(invoke).toHaveBeenCalledWith('get_lifecycle_status', { config: mockAwsConfig });
      expect(result).toEqual({ 
        enabled: true, 
        ruleId: 'test-rule', 
        transitionDays: 30 
      });
    });

    it('should list lifecycle rules successfully', async () => {
      vi.mocked(invoke).mockResolvedValue([{ id: 'test-rule', status: 'Enabled' }]);
      const result = await LifecycleOperations.listLifecycleRules(mockAwsConfig);
      expect(invoke).toHaveBeenCalledWith('list_lifecycle_rules', { config: mockAwsConfig });
      expect(result).toEqual([{ id: 'test-rule', status: 'Enabled' }]);
    });

    it('should enable ReelVault lifecycle successfully', async () => {
      vi.mocked(invoke).mockResolvedValue({ success: true, message: 'Lifecycle enabled' });
      const result = await LifecycleOperations.enableReelvaultLifecycle(mockAwsConfig);
      expect(invoke).toHaveBeenCalledWith('enable_reelvault_lifecycle', { config: mockAwsConfig });
      expect(result).toEqual({ success: true, message: 'Lifecycle enabled' });
    });

    it('should validate lifecycle config successfully', async () => {
      vi.mocked(invoke).mockResolvedValue(true);
      const result = await LifecycleOperations.validateLifecycleConfig(mockAwsConfig);
      expect(invoke).toHaveBeenCalledWith('validate_lifecycle_config', { config: mockAwsConfig });
      expect(result).toBe(true);
    });
  });

  describe('AuthOperations', () => {
    it('should authenticate AWS successfully', async () => {
      vi.mocked(invoke).mockResolvedValue({ 
        success: true, 
        userIdentity: { userId: 'test-user', account: 'test-account' } 
      });
      const result = await AuthOperations.authenticateAws(mockAwsCredentials);
      expect(invoke).toHaveBeenCalledWith('authenticate_aws', { credentials: mockAwsCredentials });
      expect(result).toEqual({ 
        success: true, 
        userIdentity: { userId: 'test-user', account: 'test-account' } 
      });
    });

    it('should save AWS credentials securely successfully', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      await AuthOperations.saveAwsCredentialsSecure(mockAwsCredentials, 'test-profile');
      expect(invoke).toHaveBeenCalledWith('save_aws_credentials_secure', { 
        credentials: mockAwsCredentials, 
        profileName: 'test-profile' 
      });
    });

    it('should load AWS credentials securely successfully', async () => {
      vi.mocked(invoke).mockResolvedValue(mockAwsCredentials);
      const result = await AuthOperations.loadAwsCredentialsSecure('test-profile');
      expect(invoke).toHaveBeenCalledWith('load_aws_credentials_secure', { 
        profileName: 'test-profile' 
      });
      expect(result).toEqual(mockAwsCredentials);
    });

    it('should check basic permissions successfully', async () => {
      vi.mocked(invoke).mockResolvedValue([{ service: 's3', permission: 'ListBucket', granted: true }]);
      const result = await AuthOperations.checkBasicPermissions(mockAwsCredentials);
      expect(invoke).toHaveBeenCalledWith('check_basic_permissions', { 
        credentials: mockAwsCredentials 
      });
      expect(result).toEqual([{ service: 's3', permission: 'ListBucket', granted: true }]);
    });
  });

  describe('ConfigOperations', () => {
    it('should get config successfully', async () => {
      vi.mocked(invoke).mockResolvedValue(mockAppConfig);
      const result = await ConfigOperations.getConfig();
      expect(invoke).toHaveBeenCalledWith('get_config');
      expect(result).toEqual(mockAppConfig);
    });

    it('should set config successfully', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      await ConfigOperations.setConfig(mockAppConfig);
      expect(invoke).toHaveBeenCalledWith('set_config', { config: mockAppConfig });
    });

    it('should update config successfully', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      const updates = { aws: { bucketName: 'new-bucket' } };
      await ConfigOperations.updateConfig(updates);
      expect(invoke).toHaveBeenCalledWith('update_config', { updates });
    });

    it('should reset config successfully', async () => {
      vi.mocked(invoke).mockResolvedValue(mockAppConfig);
      const result = await ConfigOperations.resetConfig();
      expect(invoke).toHaveBeenCalledWith('reset_config');
      expect(result).toEqual(mockAppConfig);
    });

    it('should validate config successfully', async () => {
      vi.mocked(invoke).mockResolvedValue({ valid: true, errors: [] });
      const result = await ConfigOperations.validateConfig(mockAppConfig);
      expect(invoke).toHaveBeenCalledWith('validate_config', { config: mockAppConfig });
      expect(result).toEqual({ valid: true, errors: [] });
    });

    it('should validate config file successfully', async () => {
      vi.mocked(invoke).mockResolvedValue({ valid: true, errors: [] });
      const result = await ConfigOperations.validateConfigFile();
      expect(invoke).toHaveBeenCalledWith('validate_config_file');
      expect(result).toEqual({ valid: true, errors: [] });
    });
  });

  describe('StateOperations', () => {
    it('should get app state successfully', async () => {
      vi.mocked(invoke).mockResolvedValue(mockAppState);
      const result = await StateOperations.getAppState();
      expect(invoke).toHaveBeenCalledWith('get_app_state');
      expect(result).toEqual(mockAppState);
    });

    it('should update app state successfully', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      const update = { field: 'upload_queue', value: [] };
      await StateOperations.updateAppState(update);
      expect(invoke).toHaveBeenCalledWith('update_app_state', { update });
    });

    it('should update system stats successfully', async () => {
      vi.mocked(invoke).mockResolvedValue({ isOnline: true, diskSpace: 1000000000, memoryUsage: 50 });
      const result = await StateOperations.updateSystemStats();
      expect(invoke).toHaveBeenCalledWith('update_system_stats');
      expect(result).toEqual({ isOnline: true, diskSpace: 1000000000, memoryUsage: 50 });
    });
  });

  describe('EventListeners', () => {
    it('should listen to upload progress successfully', async () => {
      const mockUnlisten = vi.fn();
      vi.mocked(listen).mockResolvedValue(mockUnlisten);
      const callback = vi.fn();
      const result = await EventListeners.listenToUploadProgress(callback);
      expect(listen).toHaveBeenCalledWith('upload-progress', expect.any(Function));
      expect(result).toBe(mockUnlisten);
    });

    it('should listen to test event successfully', async () => {
      const mockUnlisten = vi.fn();
      vi.mocked(listen).mockResolvedValue(mockUnlisten);
      const callback = vi.fn();
      const result = await EventListeners.listenToTestEvent(callback);
      expect(listen).toHaveBeenCalledWith('test-event', callback);
      expect(result).toBe(mockUnlisten);
    });
  });

  describe('TauriCommands (統合API)', () => {
    it('should provide all file operations through TauriCommands', () => {
      expect(TauriCommands.listFiles).toBe(FileOperations.listFiles);
      expect(TauriCommands.getFileInfo).toBe(FileOperations.getFileInfo);
      expect(TauriCommands.openFileDialog).toBe(FileOperations.openFileDialog);
    });

    it('should provide all AWS operations through TauriCommands', () => {
      expect(TauriCommands.testS3BucketAccess).toBe(AwsOperations.testS3BucketAccess);
      expect(TauriCommands.listS3Objects).toBe(AwsOperations.listS3Objects);
      expect(TauriCommands.getS3Object).toBe(AwsOperations.getS3Object);
      expect(TauriCommands.downloadS3File).toBe(AwsOperations.downloadS3File);
      expect(TauriCommands.downloadRestoredFile).toBe(AwsOperations.downloadRestoredFile);
    });

    it('should provide all upload operations through TauriCommands', () => {
      expect(TauriCommands.initializeUploadQueue).toBe(UploadOperations.initializeUploadQueue);
      expect(TauriCommands.addFilesToUploadQueue).toBe(UploadOperations.addFilesToUploadQueue);
      expect(TauriCommands.startUploadProcessing).toBe(UploadOperations.startUploadProcessing);
      expect(TauriCommands.stopUploadProcessing).toBe(UploadOperations.stopUploadProcessing);
      expect(TauriCommands.clearUploadQueue).toBe(UploadOperations.clearUploadQueue);
      expect(TauriCommands.getUploadQueueItems).toBe(UploadOperations.getUploadQueueItems);
      expect(TauriCommands.getUploadQueueStatus).toBe(UploadOperations.getUploadQueueStatus);
      expect(TauriCommands.retryUploadItem).toBe(UploadOperations.retryUploadItem);
      expect(TauriCommands.removeUploadItem).toBe(UploadOperations.removeUploadItem);
    });

    it('should provide all restore operations through TauriCommands', () => {
      expect(TauriCommands.restoreFile).toBe(RestoreOperations.restoreFile);
      expect(TauriCommands.checkRestoreStatus).toBe(RestoreOperations.checkRestoreStatus);
      expect(TauriCommands.listRestoreJobs).toBe(RestoreOperations.listRestoreJobs);
      expect(TauriCommands.getRestoreNotifications).toBe(RestoreOperations.getRestoreNotifications);
      expect(TauriCommands.clearRestoreHistory).toBe(RestoreOperations.clearRestoreHistory);
    });

    it('should provide all lifecycle operations through TauriCommands', () => {
      expect(TauriCommands.getLifecycleStatus).toBe(LifecycleOperations.getLifecycleStatus);
      expect(TauriCommands.listLifecycleRules).toBe(LifecycleOperations.listLifecycleRules);
      expect(TauriCommands.enableReelvaultLifecycle).toBe(LifecycleOperations.enableReelvaultLifecycle);
      expect(TauriCommands.validateLifecycleConfig).toBe(LifecycleOperations.validateLifecycleConfig);
    });

    it('should provide all auth operations through TauriCommands', () => {
      expect(TauriCommands.authenticateAws).toBe(AuthOperations.authenticateAws);
      expect(TauriCommands.saveAwsCredentialsSecure).toBe(AuthOperations.saveAwsCredentialsSecure);
      expect(TauriCommands.loadAwsCredentialsSecure).toBe(AuthOperations.loadAwsCredentialsSecure);
      expect(TauriCommands.checkBasicPermissions).toBe(AuthOperations.checkBasicPermissions);
    });

    it('should provide all config operations through TauriCommands', () => {
      expect(TauriCommands.getConfig).toBe(ConfigOperations.getConfig);
      expect(TauriCommands.setConfig).toBe(ConfigOperations.setConfig);
      expect(TauriCommands.updateConfig).toBe(ConfigOperations.updateConfig);
      expect(TauriCommands.resetConfig).toBe(ConfigOperations.resetConfig);
      expect(TauriCommands.validateConfig).toBe(ConfigOperations.validateConfig);
      expect(TauriCommands.validateConfigFile).toBe(ConfigOperations.validateConfigFile);
    });

    it('should provide all state operations through TauriCommands', () => {
      expect(TauriCommands.getAppState).toBe(StateOperations.getAppState);
      expect(TauriCommands.updateAppState).toBe(StateOperations.updateAppState);
      expect(TauriCommands.updateSystemStats).toBe(StateOperations.updateSystemStats);
    });
  });

  describe('UploadStatus enum', () => {
    it('should have correct enum values', () => {
      expect(UploadStatus.Pending).toBe('Pending');
      expect(UploadStatus.InProgress).toBe('InProgress');
      expect(UploadStatus.Completed).toBe('Completed');
      expect(UploadStatus.Failed).toBe('Failed');
      expect(UploadStatus.Paused).toBe('Paused');
      expect(UploadStatus.Cancelled).toBe('Cancelled');
    });
  });
}); 