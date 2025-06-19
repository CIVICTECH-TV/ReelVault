import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { RestoreService } from '../restoreService';
import type {
  AwsConfig,
  RestoreInfo,
  RestoreStatusResult,
  DownloadProgress,
  RestoreNotification,
} from '../../types/tauri-commands';

// Tauri APIのモック
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

// モックデータ
const mockAwsConfig: AwsConfig = {
  region: 'us-east-1',
  bucket_name: 'test-bucket',
  access_key_id: 'test-access-key',
  secret_access_key: 'test-secret-key',
};

const mockRestoreInfo: RestoreInfo = {
  key: 'test-file.mp4',
  restore_status: 'in-progress',
  tier: 'Standard',
  request_time: '2024-01-01T00:00:00Z',
  completion_time: '2024-01-01T03:00:00Z',
};

const mockRestoreStatusResult: RestoreStatusResult = {
  key: 'test-file.mp4',
  is_restored: false,
  restore_status: 'in-progress',
};

const mockDownloadProgress: DownloadProgress = {
  key: 'test-file.mp4',
  local_path: '/local/path/test-file.mp4',
  downloaded_bytes: 1024000,
  total_bytes: 2048000,
  percentage: 50,
  status: 'downloading',
};

const mockRestoreNotification: RestoreNotification = {
  key: 'test-file.mp4',
  message: '復元が完了しました',
  timestamp: '2024-01-01T03:00:00Z',
  status: 'completed',
};

describe('RestoreService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('ファイル復元', () => {
    it('should restore file successfully with Standard tier', async () => {
      mockInvoke.mockResolvedValue(mockRestoreInfo);

      const result = await RestoreService.restoreFile('test-file.mp4', mockAwsConfig, 'Standard');

      expect(mockInvoke).toHaveBeenCalledWith('restore_file', {
        s3Key: 'test-file.mp4',
        config: mockAwsConfig,
        tier: 'Standard',
      });
      expect(result).toEqual(mockRestoreInfo);
    });

    it('should restore file successfully with Expedited tier', async () => {
      const expeditedInfo = { ...mockRestoreInfo, tier: 'Expedited' };
      mockInvoke.mockResolvedValue(expeditedInfo);

      const result = await RestoreService.restoreFile('test-file.mp4', mockAwsConfig, 'Expedited');

      expect(mockInvoke).toHaveBeenCalledWith('restore_file', {
        s3Key: 'test-file.mp4',
        config: mockAwsConfig,
        tier: 'Expedited',
      });
      expect(result.tier).toBe('Expedited');
    });

    it('should restore file successfully with Bulk tier', async () => {
      const bulkInfo = { ...mockRestoreInfo, tier: 'Bulk' };
      mockInvoke.mockResolvedValue(bulkInfo);

      const result = await RestoreService.restoreFile('test-file.mp4', mockAwsConfig, 'Bulk');

      expect(mockInvoke).toHaveBeenCalledWith('restore_file', {
        s3Key: 'test-file.mp4',
        config: mockAwsConfig,
        tier: 'Bulk',
      });
      expect(result.tier).toBe('Bulk');
    });

    it('should handle restore file error', async () => {
      const error = new Error('File not found in Deep Archive');
      mockInvoke.mockRejectedValue(error);

      await expect(RestoreService.restoreFile('nonexistent.mp4', mockAwsConfig)).rejects.toThrow(
        '復元リクエストに失敗しました: Error: File not found in Deep Archive'
      );
    });
  });

  describe('復元状況確認', () => {
    it('should check restore status successfully', async () => {
      mockInvoke.mockResolvedValue(mockRestoreStatusResult);

      const result = await RestoreService.checkRestoreStatus('test-file.mp4', mockAwsConfig);

      expect(mockInvoke).toHaveBeenCalledWith('check_restore_status', {
        s3Key: 'test-file.mp4',
        config: mockAwsConfig,
      });
      expect(result).toEqual(mockRestoreStatusResult);
    });

    it('should handle check restore status error', async () => {
      const error = new Error('Network error');
      mockInvoke.mockRejectedValue(error);

      await expect(RestoreService.checkRestoreStatus('test-file.mp4', mockAwsConfig)).rejects.toThrow(
        '復元状況の確認に失敗しました: Error: Network error'
      );
    });
  });

  describe('復元通知', () => {
    it('should get restore notifications successfully', async () => {
      const notifications = [mockRestoreNotification];
      mockInvoke.mockResolvedValue(notifications);

      const result = await RestoreService.getRestoreNotifications();

      expect(mockInvoke).toHaveBeenCalledWith('get_restore_notifications');
      expect(result).toEqual(notifications);
    });

    it('should handle get restore notifications error', async () => {
      const error = new Error('Database error');
      mockInvoke.mockRejectedValue(error);

      await expect(RestoreService.getRestoreNotifications()).rejects.toThrow(
        '復元通知の取得に失敗しました: Error: Database error'
      );
    });
  });

  describe('ファイルダウンロード', () => {
    it('should download restored file successfully', async () => {
      mockInvoke.mockResolvedValue(mockDownloadProgress);

      const result = await RestoreService.downloadRestoredFile(
        'test-file.mp4',
        '/local/path/test-file.mp4',
        mockAwsConfig
      );

      expect(mockInvoke).toHaveBeenCalledWith('download_restored_file', {
        s3Key: 'test-file.mp4',
        localPath: '/local/path/test-file.mp4',
        config: mockAwsConfig,
      });
      expect(result).toEqual(mockDownloadProgress);
    });

    it('should handle download restored file error', async () => {
      const error = new Error('File not restored');
      mockInvoke.mockRejectedValue(error);

      await expect(
        RestoreService.downloadRestoredFile('test-file.mp4', '/local/path/', mockAwsConfig)
      ).rejects.toThrow('ファイルのダウンロードに失敗しました: Error: File not restored');
    });
  });

  describe('復元ジョブ管理', () => {
    it('should list restore jobs successfully', async () => {
      const jobs = [mockRestoreInfo];
      mockInvoke.mockResolvedValue(jobs);

      const result = await RestoreService.listRestoreJobs();

      expect(mockInvoke).toHaveBeenCalledWith('list_restore_jobs');
      expect(result).toEqual(jobs);
    });

    it('should handle list restore jobs error', async () => {
      const error = new Error('Database connection failed');
      mockInvoke.mockRejectedValue(error);

      await expect(RestoreService.listRestoreJobs()).rejects.toThrow(
        '復元ジョブ一覧の取得に失敗しました: Error: Database connection failed'
      );
    });

    it('should cancel restore job successfully', async () => {
      mockInvoke.mockResolvedValue(true);

      const result = await RestoreService.cancelRestoreJob('test-file.mp4');

      expect(mockInvoke).toHaveBeenCalledWith('cancel_restore_job', {
        s3Key: 'test-file.mp4',
      });
      expect(result).toBe(true);
    });

    it('should handle cancel restore job error', async () => {
      const error = new Error('Job not found');
      mockInvoke.mockRejectedValue(error);

      await expect(RestoreService.cancelRestoreJob('nonexistent.mp4')).rejects.toThrow(
        '復元ジョブのキャンセルに失敗しました: Error: Job not found'
      );
    });

    it('should clear restore history successfully', async () => {
      mockInvoke.mockResolvedValue(5);

      const result = await RestoreService.clearRestoreHistory();

      expect(mockInvoke).toHaveBeenCalledWith('clear_restore_history');
      expect(result).toBe(5);
    });

    it('should handle clear restore history error', async () => {
      const error = new Error('Permission denied');
      mockInvoke.mockRejectedValue(error);

      await expect(RestoreService.clearRestoreHistory()).rejects.toThrow(
        '復元履歴のクリアに失敗しました: Error: Permission denied'
      );
    });
  });

  describe('復元ティア情報', () => {
    it('should get Expedited tier info', () => {
      const info = RestoreService.getRestoreTierInfo('Expedited');

      expect(info).toEqual({
        name: '高速復元',
        description: '最も高速な復元オプション',
        estimatedTime: '1-5分',
        cost: '高',
      });
    });

    it('should get Standard tier info', () => {
      const info = RestoreService.getRestoreTierInfo('Standard');

      expect(info).toEqual({
        name: '標準復元',
        description: 'バランスの取れた復元オプション',
        estimatedTime: '3-5時間',
        cost: '中',
      });
    });

    it('should get Bulk tier info', () => {
      const info = RestoreService.getRestoreTierInfo('Bulk');

      expect(info).toEqual({
        name: '一括復元',
        description: '最も経済的な復元オプション',
        estimatedTime: '5-12時間',
        cost: '低',
      });
    });

    it('should get unknown tier info', () => {
      const info = RestoreService.getRestoreTierInfo('Unknown');

      expect(info).toEqual({
        name: '不明',
        description: '不明な復元ティア',
        estimatedTime: '不明',
        cost: '不明',
      });
    });
  });

  describe('復元状況テキスト', () => {
    it('should get in-progress status text', () => {
      expect(RestoreService.getRestoreStatusText('in-progress')).toBe('復元中');
    });

    it('should get completed status text', () => {
      expect(RestoreService.getRestoreStatusText('completed')).toBe('復元完了');
    });

    it('should get failed status text', () => {
      expect(RestoreService.getRestoreStatusText('failed')).toBe('復元失敗');
    });

    it('should get cancelled status text', () => {
      expect(RestoreService.getRestoreStatusText('cancelled')).toBe('キャンセル済み');
    });

    it('should get not-found status text', () => {
      expect(RestoreService.getRestoreStatusText('not-found')).toBe('見つかりません');
    });

    it('should return original status for unknown status', () => {
      expect(RestoreService.getRestoreStatusText('unknown-status')).toBe('unknown-status');
    });
  });

  describe('ファイルサイズフォーマット', () => {
    it('should format bytes correctly', () => {
      expect(RestoreService.formatFileSize(1024)).toBe('1.0 KB');
      expect(RestoreService.formatFileSize(1048576)).toBe('1.0 MB');
      expect(RestoreService.formatFileSize(1073741824)).toBe('1.0 GB');
    });

    it('should handle zero bytes', () => {
      expect(RestoreService.formatFileSize(0)).toBe('0.0 B');
    });

    it('should handle small bytes', () => {
      expect(RestoreService.formatFileSize(512)).toBe('512.0 B');
    });

    it('should handle large bytes', () => {
      expect(RestoreService.formatFileSize(1099511627776)).toBe('1.0 TB');
    });
  });

  describe('復元監視', () => {
    it('should start restore monitoring successfully', async () => {
      const onStatusUpdate = vi.fn();
      mockInvoke.mockResolvedValue(mockRestoreStatusResult);

      const stopMonitoring = await RestoreService.startRestoreMonitoring(
        'test-file.mp4',
        mockAwsConfig,
        onStatusUpdate,
        1000
      );

      expect(typeof stopMonitoring).toBe('function');

      // 監視を停止
      stopMonitoring();
    });

    it('should handle monitoring error', async () => {
      const onStatusUpdate = vi.fn();
      const error = new Error('Network error');
      mockInvoke.mockRejectedValue(error);

      const stopMonitoring = await RestoreService.startRestoreMonitoring(
        'test-file.mp4',
        mockAwsConfig,
        onStatusUpdate,
        1000
      );

      expect(typeof stopMonitoring).toBe('function');
      stopMonitoring();
    });

    it('should stop monitoring when restore completed', async () => {
      const onStatusUpdate = vi.fn();
      const completedStatus = { ...mockRestoreStatusResult, restore_status: 'completed' };
      mockInvoke.mockResolvedValue(completedStatus);

      const stopMonitoring = await RestoreService.startRestoreMonitoring(
        'test-file.mp4',
        mockAwsConfig,
        onStatusUpdate,
        1000
      );

      expect(typeof stopMonitoring).toBe('function');
      stopMonitoring();
    });

    it('should stop monitoring when restore failed', async () => {
      const onStatusUpdate = vi.fn();
      const failedStatus = { ...mockRestoreStatusResult, restore_status: 'failed' };
      mockInvoke.mockResolvedValue(failedStatus);

      const stopMonitoring = await RestoreService.startRestoreMonitoring(
        'test-file.mp4',
        mockAwsConfig,
        onStatusUpdate,
        1000
      );

      expect(typeof stopMonitoring).toBe('function');
      stopMonitoring();
    });

    it('should stop monitoring when restore cancelled', async () => {
      const onStatusUpdate = vi.fn();
      const cancelledStatus = { ...mockRestoreStatusResult, restore_status: 'cancelled' };
      mockInvoke.mockResolvedValue(cancelledStatus);

      const stopMonitoring = await RestoreService.startRestoreMonitoring(
        'test-file.mp4',
        mockAwsConfig,
        onStatusUpdate,
        1000
      );

      expect(typeof stopMonitoring).toBe('function');
      stopMonitoring();
    });
  });
}); 