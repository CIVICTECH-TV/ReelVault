import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UploadService } from '../uploadService';
import { UploadStatus } from '../../types/tauri-commands';

// Tauri APIのモック
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

// tauriCommandsのモック
vi.mock('../../types/tauri-commands', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    TauriCommands: {
      initializeUploadQueue: vi.fn(),
      testUploadConfig: vi.fn(),
      openFileDialog: vi.fn(),
      addFilesToUploadQueue: vi.fn(),
      removeUploadItem: vi.fn(),
      startUploadProcessing: vi.fn(),
      stopUploadProcessing: vi.fn(),
      getUploadQueueStatus: vi.fn(),
      getUploadQueueItems: vi.fn(),
      retryUploadItem: vi.fn(),
      clearUploadQueue: vi.fn(),
    },
  };
});

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { TauriCommands } from '../../types/tauri-commands';

// モックデータ
const mockAwsCredentials = {
  access_key_id: 'test-access-key',
  secret_access_key: 'test-secret-key',
  region: 'ap-northeast-1',
  session_token: 'test-session-token',
};

const mockUploadConfig = {
  aws_credentials: mockAwsCredentials,
  bucket_name: 'test-bucket',
  max_concurrent_uploads: 3,
  chunk_size_mb: 5,
  retry_attempts: 3,
  timeout_seconds: 60,
  auto_create_metadata: false,
  s3_key_prefix: 'uploads/',
  max_concurrent_parts: 1,
  adaptive_chunk_size: false,
  min_chunk_size_mb: 5,
  max_chunk_size_mb: 5,
  bandwidth_limit_mbps: 0,
  enable_resume: false,
  tier: 'Free' as const,
};

const mockFileSelection = {
  selected_files: ['/path/to/file1.txt', '/path/to/file2.txt'],
  total_size: 1024,
  file_count: 2,
};

const mockUploadStatistics = {
  total_files: 5,
  completed_files: 3,
  failed_files: 1,
  pending_files: 1,
  in_progress_files: 0,
  total_bytes: 1024000,
  uploaded_bytes: 614400,
  average_speed_mbps: 2.5,
  estimated_time_remaining: 300,
};

const mockUploadItem = {
  id: 'upload-1',
  file_name: 'file1.txt',
  file_path: '/path/to/file1.txt',
  file_size: 1024,
  s3_key: 'uploads/file1.txt',
  status: UploadStatus.Completed,
  progress: 100,
  uploaded_bytes: 1024,
  speed_mbps: 2.5,
  eta_seconds: 0,
  created_at: '2025-01-19T12:00:00Z',
  started_at: '2025-01-19T12:00:01Z',
  completed_at: '2025-01-19T12:00:30Z',
  error_message: '',
  retry_count: 0,
};

const mockUploadProgressInfo = {
  item_id: 'upload-1',
  uploaded_bytes: 512,
  total_bytes: 1024,
  percentage: 50,
  speed_mbps: 2.5,
  eta_seconds: 30,
  status: UploadStatus.InProgress,
};

// S3KeyConfigのモック
const mockS3KeyConfig = {
  prefix: 'uploads',
  use_date_folder: true,
  preserve_directory_structure: false,
  custom_naming_pattern: '',
};

describe('UploadService', () => {
  let uploadService: UploadService;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // シングルトンインスタンスをリセット
    (UploadService as any).instance = undefined;
    uploadService = UploadService.getInstance();
    
    // デフォルトのモック設定
    vi.mocked(TauriCommands.initializeUploadQueue).mockResolvedValue(undefined);
    vi.mocked(TauriCommands.testUploadConfig).mockResolvedValue('Configuration test passed');
    vi.mocked(TauriCommands.openFileDialog).mockResolvedValue(mockFileSelection);
    vi.mocked(TauriCommands.addFilesToUploadQueue).mockResolvedValue(['upload-1', 'upload-2']);
    vi.mocked(TauriCommands.removeUploadItem).mockResolvedValue(undefined);
    vi.mocked(TauriCommands.startUploadProcessing).mockResolvedValue(undefined);
    vi.mocked(TauriCommands.stopUploadProcessing).mockResolvedValue(undefined);
    vi.mocked(TauriCommands.getUploadQueueStatus).mockResolvedValue(mockUploadStatistics);
    vi.mocked(TauriCommands.getUploadQueueItems).mockResolvedValue([mockUploadItem]);
    vi.mocked(TauriCommands.retryUploadItem).mockResolvedValue(undefined);
    vi.mocked(TauriCommands.clearUploadQueue).mockResolvedValue(undefined);
    vi.mocked(listen).mockResolvedValue(vi.fn());
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('シングルトンパターン', () => {
    it('should return the same instance', () => {
      const instance1 = UploadService.getInstance();
      const instance2 = UploadService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance only once', () => {
      const instance1 = UploadService.getInstance();
      const instance2 = UploadService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('初期化', () => {
    it('should initialize upload system successfully', async () => {
      await uploadService.initialize(mockUploadConfig);
      
      expect(TauriCommands.initializeUploadQueue).toHaveBeenCalledWith(mockUploadConfig);
      expect(listen).toHaveBeenCalledWith('upload-progress', expect.any(Function));
    });

    it('should handle initialization error', async () => {
      vi.mocked(TauriCommands.initializeUploadQueue).mockRejectedValue(new Error('Init failed'));
      
      await expect(uploadService.initialize(mockUploadConfig)).rejects.toThrow('Init failed');
    });

    it('should set isInitialized flag after successful initialization', async () => {
      await uploadService.initialize(mockUploadConfig);
      
      // isInitializedはprivateなので、間接的に確認
      await expect(uploadService.getQueueStatistics()).resolves.toEqual(mockUploadStatistics);
    });
  });

  describe('設定テスト', () => {
    it('should test upload configuration successfully', async () => {
      const result = await uploadService.testConfiguration(mockUploadConfig);
      
      expect(TauriCommands.testUploadConfig).toHaveBeenCalledWith(mockUploadConfig);
      expect(result).toBe('Configuration test passed');
    });

    it('should handle configuration test error', async () => {
      vi.mocked(TauriCommands.testUploadConfig).mockRejectedValue(new Error('Test failed'));
      
      await expect(uploadService.testConfiguration(mockUploadConfig)).rejects.toThrow('Test failed');
    });
  });

  describe('ファイルダイアログ', () => {
    it('should open file dialog successfully', async () => {
      const result = await uploadService.openFileDialog(true, ['txt', 'pdf']);
      
      expect(TauriCommands.openFileDialog).toHaveBeenCalledWith(true, ['txt', 'pdf']);
      expect(result).toEqual(mockFileSelection);
    });

    it('should open file dialog with default parameters', async () => {
      const result = await uploadService.openFileDialog();
      
      expect(TauriCommands.openFileDialog).toHaveBeenCalledWith(true, undefined);
      expect(result).toEqual(mockFileSelection);
    });

    it('should handle file dialog error', async () => {
      vi.mocked(TauriCommands.openFileDialog).mockRejectedValue(new Error('Dialog failed'));
      
      await expect(uploadService.openFileDialog()).rejects.toThrow('Dialog failed');
    });
  });

  describe('キュー管理', () => {
    beforeEach(async () => {
      await uploadService.initialize(mockUploadConfig);
    });

    it('should add files to upload queue successfully', async () => {
      const filePaths = ['/path/to/file1.txt', '/path/to/file2.txt'];
      const s3KeyConfig = mockS3KeyConfig;
      
      const result = await uploadService.addFilesToQueue(filePaths, s3KeyConfig);
      
      expect(TauriCommands.addFilesToUploadQueue).toHaveBeenCalledWith(filePaths, s3KeyConfig);
      expect(result).toEqual(['upload-1', 'upload-2']);
    });

    it('should remove item from upload queue successfully', async () => {
      await uploadService.removeFromQueue('upload-1');
      
      expect(TauriCommands.removeUploadItem).toHaveBeenCalledWith('upload-1');
    });

    it('should get queue statistics successfully', async () => {
      const result = await uploadService.getQueueStatistics();
      
      expect(TauriCommands.getUploadQueueStatus).toHaveBeenCalled();
      expect(result).toEqual(mockUploadStatistics);
    });

    it('should get queue items successfully', async () => {
      const result = await uploadService.getQueueItems();
      
      expect(TauriCommands.getUploadQueueItems).toHaveBeenCalled();
      expect(result).toEqual([mockUploadItem]);
    });

    it('should clear upload queue successfully', async () => {
      await uploadService.clearQueue();
      
      expect(TauriCommands.clearUploadQueue).toHaveBeenCalled();
    });
  });

  describe('アップロード処理', () => {
    beforeEach(async () => {
      await uploadService.initialize(mockUploadConfig);
    });

    it('should start upload processing successfully', async () => {
      await uploadService.startProcessing();
      
      expect(TauriCommands.startUploadProcessing).toHaveBeenCalled();
    });

    it('should stop upload processing successfully', async () => {
      await uploadService.stopProcessing();
      
      expect(TauriCommands.stopUploadProcessing).toHaveBeenCalled();
    });

    it('should retry upload item successfully', async () => {
      await uploadService.retryUpload('upload-1');
      
      expect(TauriCommands.retryUploadItem).toHaveBeenCalledWith('upload-1');
    });
  });

  describe('リスナー管理', () => {
    beforeEach(async () => {
      await uploadService.initialize(mockUploadConfig);
    });

    it('should add and notify progress listeners', () => {
      const progressListener = vi.fn();
      uploadService.addProgressListener(progressListener);
      
      // 内部のnotifyProgressListenersを直接呼び出し
      (uploadService as any).notifyProgressListeners(mockUploadProgressInfo);
      
      expect(progressListener).toHaveBeenCalledWith(mockUploadProgressInfo);
    });

    it('should remove progress listeners', () => {
      const progressListener = vi.fn();
      uploadService.addProgressListener(progressListener);
      uploadService.removeProgressListener(progressListener);
      
      // 内部のnotifyProgressListenersを直接呼び出し
      (uploadService as any).notifyProgressListeners(mockUploadProgressInfo);
      
      expect(progressListener).not.toHaveBeenCalled();
    });

    it('should add and notify status listeners', () => {
      const statusListener = vi.fn();
      uploadService.addStatusListener(statusListener);
      
      // 内部のnotifyStatusListenersを直接呼び出し
      (uploadService as any).notifyStatusListeners(mockUploadStatistics);
      
      expect(statusListener).toHaveBeenCalledWith(mockUploadStatistics);
    });

    it('should remove status listeners', () => {
      const statusListener = vi.fn();
      uploadService.addStatusListener(statusListener);
      uploadService.removeStatusListener(statusListener);
      
      // 内部のnotifyStatusListenersを直接呼び出し
      (uploadService as any).notifyStatusListeners(mockUploadStatistics);
      
      expect(statusListener).not.toHaveBeenCalled();
    });
  });

  describe('初期化チェック', () => {
    it('should throw error when not initialized', async () => {
      await expect(uploadService.getQueueStatistics()).rejects.toThrow('Upload service not initialized. Call initialize() first.');
    });

    it('should not throw error when initialized', async () => {
      await uploadService.initialize(mockUploadConfig);
      await expect(uploadService.getQueueStatistics()).resolves.toEqual(mockUploadStatistics);
    });
  });

  describe('ユーティリティ関数', () => {
    describe('createDefaultConfig', () => {
      it('should create default config for Free tier', () => {
        const config = UploadService.createDefaultConfig(mockAwsCredentials, 'test-bucket', 'Free');
        
        expect(config.aws_credentials).toEqual(mockAwsCredentials);
        expect(config.bucket_name).toBe('test-bucket');
        expect(config.tier).toBe('Free');
        expect(config.max_concurrent_parts).toBe(1);
        expect(config.adaptive_chunk_size).toBe(false);
        expect(config.enable_resume).toBe(false);
      });

      it('should create default config for Premium tier', () => {
        const config = UploadService.createDefaultConfig(mockAwsCredentials, 'test-bucket', 'Premium');
        
        expect(config.tier).toBe('Premium');
        expect(config.max_concurrent_parts).toBe(8);
        expect(config.adaptive_chunk_size).toBe(true);
        expect(config.enable_resume).toBe(true);
      });
    });

    describe('createDefaultS3KeyConfig', () => {
      it('should create default S3 key config', () => {
        const config = UploadService.createDefaultS3KeyConfig();
        
        expect(config.prefix).toBe('uploads');
        expect(config.use_date_folder).toBe(true);
        expect(config.preserve_directory_structure).toBe(false);
        expect(config.custom_naming_pattern).toBeUndefined();
      });
    });

    describe('createS3KeyPresets', () => {
      it('should create S3 key presets', () => {
        const presets = UploadService.createS3KeyPresets();
        
        expect(presets).toHaveProperty('simple');
        expect(presets).toHaveProperty('organized');
        expect(presets).toHaveProperty('custom');
      });
    });

    describe('formatFileSize', () => {
      it('should format bytes correctly', () => {
        expect(UploadService.formatFileSize(1024)).toBe('1.00 KB');
        expect(UploadService.formatFileSize(1048576)).toBe('1.00 MB');
        expect(UploadService.formatFileSize(1073741824)).toBe('1.00 GB');
      });

      it('should handle zero bytes', () => {
        expect(UploadService.formatFileSize(0)).toBe('0.00 B');
      });
    });

    describe('formatSpeed', () => {
      it('should format speed correctly', () => {
        expect(UploadService.formatSpeed(1.5)).toBe('1.5 MB/s');
        expect(UploadService.formatSpeed(0.5)).toBe('512.0 KB/s');
      });
    });

    describe('formatETA', () => {
      it('should format ETA correctly', () => {
        expect(UploadService.formatETA(30)).toBe('30秒');
        expect(UploadService.formatETA(90)).toBe('1分');
        expect(UploadService.formatETA(3661)).toBe('1時間1分');
      });

      it('should handle zero seconds', () => {
        expect(UploadService.formatETA(0)).toBe('0秒');
      });
    });

    describe('generateStatisticsSummary', () => {
      it('should generate statistics summary', () => {
        const summary = UploadService.generateStatisticsSummary(mockUploadStatistics);
        
        expect(summary).toContain('完了率: 60.0% (3/5)');
        expect(summary).toContain('データ量: 600.00 KB / 1000.00 KB');
        expect(summary).toContain('平均速度: 2.5 MB/s');
        expect(summary).toContain('残り時間: 5分');
      });
    });
  });

  describe('定期ステータス更新', () => {
    beforeEach(async () => {
      await uploadService.initialize(mockUploadConfig);
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should start periodic status update', async () => {
      const statusListener = vi.fn();
      uploadService.addStatusListener(statusListener);
      
      await uploadService.startPeriodicStatusUpdate(1000);
      
      // タイマーを進める
      vi.advanceTimersByTime(1000);
      
      // 非同期処理を待つ
      await vi.runOnlyPendingTimersAsync();
      
      expect(TauriCommands.getUploadQueueStatus).toHaveBeenCalled();
      expect(statusListener).toHaveBeenCalledWith(mockUploadStatistics);
    });
  });

  describe('エラーハンドリング', () => {
    beforeEach(async () => {
      await uploadService.initialize(mockUploadConfig);
    });

    it('should handle add files to queue error', async () => {
      vi.mocked(TauriCommands.addFilesToUploadQueue).mockRejectedValue(new Error('Add failed'));
      
      await expect(uploadService.addFilesToQueue(['file.txt'], mockS3KeyConfig)).rejects.toThrow('Add failed');
    });

    it('should handle remove from queue error', async () => {
      vi.mocked(TauriCommands.removeUploadItem).mockRejectedValue(new Error('Remove failed'));
      
      await expect(uploadService.removeFromQueue('upload-1')).rejects.toThrow('Remove failed');
    });

    it('should handle start processing error', async () => {
      vi.mocked(TauriCommands.startUploadProcessing).mockRejectedValue(new Error('Start failed'));
      
      await expect(uploadService.startProcessing()).rejects.toThrow('Start failed');
    });

    it('should handle stop processing error', async () => {
      vi.mocked(TauriCommands.stopUploadProcessing).mockRejectedValue(new Error('Stop failed'));
      
      await expect(uploadService.stopProcessing()).rejects.toThrow('Stop failed');
    });

    it('should handle get queue statistics error', async () => {
      vi.mocked(TauriCommands.getUploadQueueStatus).mockRejectedValue(new Error('Stats failed'));
      
      await expect(uploadService.getQueueStatistics()).rejects.toThrow('Stats failed');
    });

    it('should handle get queue items error', async () => {
      vi.mocked(TauriCommands.getUploadQueueItems).mockRejectedValue(new Error('Items failed'));
      
      await expect(uploadService.getQueueItems()).rejects.toThrow('Items failed');
    });

    it('should handle retry upload error', async () => {
      vi.mocked(TauriCommands.retryUploadItem).mockRejectedValue(new Error('Retry failed'));
      
      await expect(uploadService.retryUpload('upload-1')).rejects.toThrow('Retry failed');
    });

    it('should handle clear queue error', async () => {
      vi.mocked(TauriCommands.clearUploadQueue).mockRejectedValue(new Error('Clear failed'));
      
      await expect(uploadService.clearQueue()).rejects.toThrow('Clear failed');
    });
  });
}); 