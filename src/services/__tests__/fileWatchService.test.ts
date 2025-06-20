import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import FileWatchService, { fileWatchService } from '../fileWatchService';
import type { WatchConfig, FileInfo } from '../../types/tauri-commands';

// Tauri APIのモック
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

// モックデータ
const mockWatchConfig: WatchConfig = {
  path: '/test/path',
  recursive: true,
  file_patterns: ['*.mp4', '*.mov'],
  max_file_size_mb: 1024,
  auto_upload: true,
  exclude_patterns: ['*.tmp'],
  exclude_directories: ['.git'],
  auto_metadata: true,
};

const mockFileInfo: FileInfo = {
  name: 'test-directory',
  path: '/test/path',
  size: 0,
  modified: '2024-01-01T00:00:00Z',
  is_directory: true,
};

describe('FileWatchService', () => {
  let service: FileWatchService;

  beforeEach(() => {
    service = new FileWatchService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('ファイル監視開始', () => {
    it('should start watching successfully', async () => {
      mockInvoke.mockResolvedValue('Watching started successfully');

      const result = await service.startWatching(mockWatchConfig);

      expect(mockInvoke).toHaveBeenCalledWith('watch_directory', {
        config: mockWatchConfig,
      });
      expect(result).toBe('Watching started successfully');

      const status = service.getStatus();
      expect(status.isActive).toBe(true);
      expect(status.config).toEqual(mockWatchConfig);
      expect(status.startTime).toBeDefined();
      expect(status.filesProcessed).toBe(0);
      expect(status.filesUploaded).toBe(0);
      expect(status.filesWithMetadata).toBe(0);
      expect(status.errors).toHaveLength(0);
    });

    it('should handle start watching error', async () => {
      const error = new Error('Directory not found');
      mockInvoke.mockRejectedValue(error);

      await expect(service.startWatching(mockWatchConfig)).rejects.toThrow(
        'Failed to start watching: Error: Directory not found'
      );

      const status = service.getStatus();
      expect(status.isActive).toBe(false);
      expect(status.errors).toHaveLength(1);
      expect(status.errors[0]).toContain('Failed to start watching');
    });
  });

  describe('ファイル監視停止', () => {
    it('should stop watching successfully', async () => {
      // まず監視を開始
      mockInvoke.mockResolvedValue('Watching started');
      await service.startWatching(mockWatchConfig);

      // 監視を停止
      await service.stopWatching();

      const status = service.getStatus();
      expect(status.isActive).toBe(false);
    });
  });

  describe('監視状態取得', () => {
    it('should return current status', () => {
      const status = service.getStatus();

      expect(status).toEqual({
        isActive: false,
        filesProcessed: 0,
        filesUploaded: 0,
        filesWithMetadata: 0,
        errors: [],
      });
    });

    it('should return status with updated values', async () => {
      mockInvoke.mockResolvedValue('Watching started');
      await service.startWatching(mockWatchConfig);

      service.updateStats({
        filesProcessed: 5,
        filesUploaded: 3,
        filesWithMetadata: 2,
      });

      const status = service.getStatus();
      expect(status.filesProcessed).toBe(5);
      expect(status.filesUploaded).toBe(3);
      expect(status.filesWithMetadata).toBe(2);
      expect(status.lastActivity).toBeDefined();
    });
  });

  describe('監視設定テスト', () => {
    it('should test valid watch config', async () => {
      mockInvoke.mockResolvedValue(mockFileInfo);

      const result = await service.testWatchConfig(mockWatchConfig);

      expect(mockInvoke).toHaveBeenCalledWith('get_file_info', {
        filePath: mockWatchConfig.path,
      });
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect invalid path', async () => {
      const error = new Error('Path not found');
      mockInvoke.mockRejectedValue(error);

      const result = await service.testWatchConfig(mockWatchConfig);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain(`Path does not exist or is inaccessible: ${mockWatchConfig.path}`);
    });

    it('should detect non-directory path', async () => {
      const fileInfo = { ...mockFileInfo, is_directory: false };
      mockInvoke.mockResolvedValue(fileInfo);

      const result = await service.testWatchConfig(mockWatchConfig);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Specified path is not a directory');
    });

    it('should detect empty file patterns', async () => {
      const config = { ...mockWatchConfig, file_patterns: [] };
      mockInvoke.mockResolvedValue(mockFileInfo);

      const result = await service.testWatchConfig(config);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('At least one file pattern must be specified');
    });

    it('should detect invalid max file size', async () => {
      const config = { ...mockWatchConfig, max_file_size_mb: -1 };
      mockInvoke.mockResolvedValue(mockFileInfo);

      const result = await service.testWatchConfig(config);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Max file size must be positive');
    });

    it('should detect empty exclude patterns', async () => {
      const config = { ...mockWatchConfig, exclude_patterns: ['', '*.tmp'] };
      mockInvoke.mockResolvedValue(mockFileInfo);

      const result = await service.testWatchConfig(config);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Empty exclude patterns are not allowed');
    });
  });

  describe('プリセット設定', () => {
    it('should return presets', () => {
      const presets = service.getPresets();

      expect(presets).toHaveLength(4);
      expect(presets[0].name).toBe('動画ファイル監視');
      expect(presets[1].name).toBe('軽量監視');
      expect(presets[2].name).toBe('完全自動化');
      expect(presets[3].name).toBe('開発環境');

      // 各プリセットの設定を確認
      presets.forEach(preset => {
        expect(preset.name).toBeDefined();
        expect(preset.description).toBeDefined();
        expect(preset.config).toBeDefined();
        expect(preset.config.file_patterns.length).toBeGreaterThan(0);
      });
    });

    it('should have video file preset with correct config', () => {
      const presets = service.getPresets();
      const videoPreset = presets.find(p => p.name === '動画ファイル監視');

      expect(videoPreset).toBeDefined();
      expect(videoPreset!.config.file_patterns).toContain('*.mp4');
      expect(videoPreset!.config.file_patterns).toContain('*.mov');
      expect(videoPreset!.config.auto_upload).toBe(true);
      expect(videoPreset!.config.auto_metadata).toBe(true);
    });

    it('should have lightweight preset with correct config', () => {
      const presets = service.getPresets();
      const lightweightPreset = presets.find(p => p.name === '軽量監視');

      expect(lightweightPreset).toBeDefined();
      expect(lightweightPreset!.config.auto_upload).toBe(false);
      expect(lightweightPreset!.config.auto_metadata).toBe(true);
      expect(lightweightPreset!.config.recursive).toBe(false);
    });
  });

  describe('除外パターン', () => {
    it('should return common exclude patterns', () => {
      const patterns = service.getCommonExcludePatterns();

      expect(patterns).toContain('*.tmp');
      expect(patterns).toContain('*.part');
      expect(patterns).toContain('*.log');
      expect(patterns).toContain('*/.DS_Store');
      expect(patterns).toContain('*/Thumbs.db');
    });

    it('should return common exclude directories', () => {
      const directories = service.getCommonExcludeDirectories();

      expect(directories).toContain('.git');
      expect(directories).toContain('node_modules');
      expect(directories).toContain('.cache');
      expect(directories).toContain('System Volume Information');
      expect(directories).toContain('$RECYCLE.BIN');
    });
  });

  describe('ファイルパターン', () => {
    it('should return common file patterns', () => {
      const patterns = service.getCommonFilePatterns();

      expect(patterns).toHaveProperty('動画ファイル');
      expect(patterns).toHaveProperty('高品質動画');
      expect(patterns).toHaveProperty('すべてのファイル');
      expect(patterns).toHaveProperty('特定の拡張子');

      expect(patterns['動画ファイル']).toContain('*.mp4');
      expect(patterns['動画ファイル']).toContain('*.mov');
      expect(patterns['高品質動画']).toContain('*.mp4');
      expect(patterns['すべてのファイル']).toContain('*.*');
    });

    it('should have video file patterns', () => {
      const patterns = service.getCommonFilePatterns();
      const videoPatterns = patterns['動画ファイル'];

      expect(videoPatterns).toContain('*.mp4');
      expect(videoPatterns).toContain('*.mov');
      expect(videoPatterns).toContain('*.avi');
      expect(videoPatterns).toContain('*.mkv');
      expect(videoPatterns).toContain('*.wmv');
    });
  });

  describe('設定バリデーション', () => {
    it('should validate correct config', () => {
      const result = service.validateConfig(mockWatchConfig);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing path', () => {
      const config = { ...mockWatchConfig, path: '' };
      const result = service.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('監視パスは必須です');
    });

    it('should detect missing file patterns', () => {
      const config = { ...mockWatchConfig, file_patterns: [] };
      const result = service.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('少なくとも1つのファイルパターンが必要です');
    });

    it('should detect invalid max file size', () => {
      const config = { ...mockWatchConfig, max_file_size_mb: -1 };
      const result = service.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('最大ファイルサイズは正の数である必要があります');
    });

    it('should detect zero max file size', () => {
      const config = { ...mockWatchConfig, max_file_size_mb: 0 };
      const result = service.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('最大ファイルサイズは正の数である必要があります');
    });
  });

  describe('統計情報更新', () => {
    it('should update files processed', () => {
      service.updateStats({ filesProcessed: 10 });

      const status = service.getStatus();
      expect(status.filesProcessed).toBe(10);
      expect(status.lastActivity).toBeDefined();
    });

    it('should update files uploaded', () => {
      service.updateStats({ filesUploaded: 5 });

      const status = service.getStatus();
      expect(status.filesUploaded).toBe(5);
      expect(status.lastActivity).toBeDefined();
    });

    it('should update files with metadata', () => {
      service.updateStats({ filesWithMetadata: 3 });

      const status = service.getStatus();
      expect(status.filesWithMetadata).toBe(3);
      expect(status.lastActivity).toBeDefined();
    });

    it('should update multiple stats', () => {
      service.updateStats({
        filesProcessed: 20,
        filesUploaded: 15,
        filesWithMetadata: 10,
      });

      const status = service.getStatus();
      expect(status.filesProcessed).toBe(20);
      expect(status.filesUploaded).toBe(15);
      expect(status.filesWithMetadata).toBe(10);
      expect(status.lastActivity).toBeDefined();
    });
  });

  describe('エラー管理', () => {
    it('should add error', () => {
      service.addError('Test error message');

      const status = service.getStatus();
      expect(status.errors).toHaveLength(1);
      expect(status.errors[0]).toContain('Test error message');
      expect(status.errors[0]).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should add multiple errors', () => {
      service.addError('Error 1');
      service.addError('Error 2');
      service.addError('Error 3');

      const status = service.getStatus();
      expect(status.errors).toHaveLength(3);
      expect(status.errors[0]).toContain('Error 1');
      expect(status.errors[1]).toContain('Error 2');
      expect(status.errors[2]).toContain('Error 3');
    });

    it('should limit errors to 100', () => {
      // 101個のエラーを追加
      for (let i = 0; i < 101; i++) {
        service.addError(`Error ${i}`);
      }

      const status = service.getStatus();
      expect(status.errors).toHaveLength(100);
      expect(status.errors[0]).toContain('Error 1'); // 最初のエラーは削除される
      expect(status.errors[99]).toContain('Error 100'); // 最後のエラーは保持される
    });
  });

  describe('デフォルトインスタンス', () => {
    it('should export default instance', () => {
      expect(fileWatchService).toBeInstanceOf(FileWatchService);
    });

    it('should have initial status', () => {
      const status = fileWatchService.getStatus();
      expect(status.isActive).toBe(false);
      expect(status.filesProcessed).toBe(0);
      expect(status.filesUploaded).toBe(0);
      expect(status.filesWithMetadata).toBe(0);
      expect(status.errors).toHaveLength(0);
    });
  });
}); 