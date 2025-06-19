import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import MetadataService, { metadataService } from '../metadataService';
import type { 
  FileMetadata, 
  MetadataSearchQuery, 
  CreateMetadataRequest, 
  UpdateMetadataRequest 
} from '../../types/metadata';

// Tauri APIのモック
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe('MetadataService', () => {
  let service: MetadataService;

  beforeEach(() => {
    service = new MetadataService('./test-metadata.db');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('初期化', () => {
    it('should initialize database successfully', async () => {
      mockInvoke.mockResolvedValue('Database initialized successfully');

      const result = await service.initializeDatabase();

      expect(mockInvoke).toHaveBeenCalledWith('initialize_metadata_db', {
        dbPath: './test-metadata.db'
      });
      expect(result).toBe('Database initialized successfully');
    });

    it('should handle database initialization error', async () => {
      const error = new Error('Database connection failed');
      mockInvoke.mockRejectedValue(error);

      await expect(service.initializeDatabase()).rejects.toThrow(
        'Database initialization failed: Error: Database connection failed'
      );
    });
  });

  describe('メタデータ作成', () => {
    it('should create file metadata successfully', async () => {
      const request: CreateMetadataRequest = {
        file_path: '/path/to/video.mp4',
        tags: ['video', 'movie'],
        custom_fields: { category: 'entertainment' }
      };

      const mockMetadata: FileMetadata = {
        id: 1,
        file_path: '/path/to/video.mp4',
        file_name: 'video.mp4',
        file_size: 1024000,
        file_hash: 'abc123',
        mime_type: 'video/mp4',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
        tags: ['video', 'movie'],
        custom_fields: { category: 'entertainment' }
      };

      mockInvoke.mockResolvedValue(mockMetadata);

      const result = await service.createFileMetadata(request);

      expect(mockInvoke).toHaveBeenCalledWith('create_file_metadata', {
        filePath: '/path/to/video.mp4',
        tags: ['video', 'movie'],
        customFields: { category: 'entertainment' }
      });
      expect(result).toEqual(mockMetadata);
    });

    it('should handle metadata creation error', async () => {
      const request: CreateMetadataRequest = {
        file_path: '/path/to/video.mp4',
        tags: [],
        custom_fields: {}
      };

      const error = new Error('File not found');
      mockInvoke.mockRejectedValue(error);

      await expect(service.createFileMetadata(request)).rejects.toThrow(
        'Failed to create metadata: Error: File not found'
      );
    });
  });

  describe('メタデータ保存', () => {
    it('should save file metadata successfully', async () => {
      const metadata: FileMetadata = {
        file_path: '/path/to/video.mp4',
        file_name: 'video.mp4',
        file_size: 1024000,
        file_hash: 'abc123',
        mime_type: 'video/mp4',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
        tags: ['video'],
        custom_fields: {}
      };

      mockInvoke.mockResolvedValue(1);

      const result = await service.saveFileMetadata(metadata);

      expect(mockInvoke).toHaveBeenCalledWith('save_file_metadata', {
        metadata,
        dbPath: './test-metadata.db'
      });
      expect(result).toBe(1);
    });

    it('should handle metadata save error', async () => {
      const metadata: FileMetadata = {
        file_path: '/path/to/video.mp4',
        file_name: 'video.mp4',
        file_size: 1024000,
        file_hash: 'abc123',
        mime_type: 'video/mp4',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
        tags: [],
        custom_fields: {}
      };

      const error = new Error('Database write failed');
      mockInvoke.mockRejectedValue(error);

      await expect(service.saveFileMetadata(metadata)).rejects.toThrow(
        'Failed to save metadata: Error: Database write failed'
      );
    });
  });

  describe('メタデータ検索', () => {
    it('should search file metadata successfully', async () => {
      const query: MetadataSearchQuery = {
        tags: ['video'],
        size_min: 1000000,
        mime_type: 'video/'
      };

      const mockResults: FileMetadata[] = [
        {
          id: 1,
          file_path: '/path/to/video1.mp4',
          file_name: 'video1.mp4',
          file_size: 2048000,
          file_hash: 'def456',
          mime_type: 'video/mp4',
          created_at: '2024-01-01T00:00:00Z',
          modified_at: '2024-01-01T00:00:00Z',
          tags: ['video', 'movie'],
          custom_fields: {}
        }
      ];

      mockInvoke.mockResolvedValue(mockResults);

      const result = await service.searchFileMetadata(query);

      expect(mockInvoke).toHaveBeenCalledWith('search_file_metadata', {
        query,
        dbPath: './test-metadata.db'
      });
      expect(result).toEqual(mockResults);
    });

    it('should handle search error', async () => {
      const query: MetadataSearchQuery = {};

      const error = new Error('Search query invalid');
      mockInvoke.mockRejectedValue(error);

      await expect(service.searchFileMetadata(query)).rejects.toThrow(
        'Search failed: Error: Search query invalid'
      );
    });
  });

  describe('メタデータ更新', () => {
    it('should update file metadata successfully', async () => {
      const request: UpdateMetadataRequest = {
        file_path: '/path/to/video.mp4',
        tags: ['video', 'updated'],
        custom_fields: { category: 'updated' },
        db_path: './test-metadata.db'
      };

      mockInvoke.mockResolvedValue('Metadata updated successfully');

      const result = await service.updateFileMetadata(request);

      expect(mockInvoke).toHaveBeenCalledWith('update_file_metadata', {
        filePath: '/path/to/video.mp4',
        tags: ['video', 'updated'],
        customFields: { category: 'updated' },
        dbPath: './test-metadata.db'
      });
      expect(result).toBe('Metadata updated successfully');
    });

    it('should handle metadata update error', async () => {
      const request: UpdateMetadataRequest = {
        file_path: '/path/to/video.mp4',
        tags: ['video'],
        custom_fields: {},
        db_path: './test-metadata.db'
      };

      const error = new Error('File not found');
      mockInvoke.mockRejectedValue(error);

      await expect(service.updateFileMetadata(request)).rejects.toThrow(
        'Failed to update metadata: Error: File not found'
      );
    });
  });

  describe('メタデータ削除', () => {
    it('should delete file metadata successfully', async () => {
      const filePath = '/path/to/video.mp4';

      mockInvoke.mockResolvedValue('Metadata deleted successfully');

      const result = await service.deleteFileMetadata(filePath);

      expect(mockInvoke).toHaveBeenCalledWith('delete_file_metadata', {
        filePath,
        dbPath: './test-metadata.db'
      });
      expect(result).toBe('Metadata deleted successfully');
    });

    it('should handle metadata deletion error', async () => {
      const filePath = '/path/to/video.mp4';

      const error = new Error('File not found');
      mockInvoke.mockRejectedValue(error);

      await expect(service.deleteFileMetadata(filePath)).rejects.toThrow(
        'Failed to delete metadata: Error: File not found'
      );
    });
  });

  describe('タグ管理', () => {
    it('should get all tags successfully', async () => {
      const mockTags = ['video', 'movie', 'document', 'image'];

      mockInvoke.mockResolvedValue(mockTags);

      const result = await service.getAllTags();

      expect(mockInvoke).toHaveBeenCalledWith('get_all_tags', {
        dbPath: './test-metadata.db'
      });
      expect(result).toEqual(mockTags);
    });

    it('should handle get tags error', async () => {
      const error = new Error('Database read failed');
      mockInvoke.mockRejectedValue(error);

      await expect(service.getAllTags()).rejects.toThrow(
        'Failed to get tags: Error: Database read failed'
      );
    });
  });

  describe('パス検索', () => {
    it('should get metadata by path successfully', async () => {
      const filePath = '/path/to/video.mp4';
      const mockResults: FileMetadata[] = [
        {
          id: 1,
          file_path: '/path/to/video.mp4',
          file_name: 'video.mp4',
          file_size: 1024000,
          file_hash: 'abc123',
          mime_type: 'video/mp4',
          created_at: '2024-01-01T00:00:00Z',
          modified_at: '2024-01-01T00:00:00Z',
          tags: ['video'],
          custom_fields: {}
        }
      ];

      mockInvoke.mockResolvedValue(mockResults);

      const result = await service.getMetadataByPath(filePath);

      expect(mockInvoke).toHaveBeenCalledWith('search_file_metadata', {
        query: {},
        dbPath: './test-metadata.db'
      });
      expect(result).toEqual(mockResults[0]);
    });

    it('should return null when metadata not found by path', async () => {
      const filePath = '/path/to/nonexistent.mp4';
      const mockResults: FileMetadata[] = [];

      mockInvoke.mockResolvedValue(mockResults);

      const result = await service.getMetadataByPath(filePath);

      expect(result).toBeNull();
    });
  });

  describe('タグ検索', () => {
    it('should get metadata by tags successfully', async () => {
      const tags = ['video', 'movie'];
      const mockResults: FileMetadata[] = [
        {
          id: 1,
          file_path: '/path/to/video.mp4',
          file_name: 'video.mp4',
          file_size: 1024000,
          file_hash: 'abc123',
          mime_type: 'video/mp4',
          created_at: '2024-01-01T00:00:00Z',
          modified_at: '2024-01-01T00:00:00Z',
          tags: ['video', 'movie'],
          custom_fields: {}
        }
      ];

      mockInvoke.mockResolvedValue(mockResults);

      const result = await service.getMetadataByTags(tags);

      expect(mockInvoke).toHaveBeenCalledWith('search_file_metadata', {
        query: { tags },
        dbPath: './test-metadata.db'
      });
      expect(result).toEqual(mockResults);
    });
  });

  describe('動画メタデータ検索', () => {
    it('should get video metadata successfully', async () => {
      const mockResults: FileMetadata[] = [
        {
          id: 1,
          file_path: '/path/to/video.mp4',
          file_name: 'video.mp4',
          file_size: 1024000,
          file_hash: 'abc123',
          mime_type: 'video/mp4',
          created_at: '2024-01-01T00:00:00Z',
          modified_at: '2024-01-01T00:00:00Z',
          tags: ['video'],
          custom_fields: {}
        },
        {
          id: 2,
          file_path: '/path/to/document.pdf',
          file_name: 'document.pdf',
          file_size: 512000,
          file_hash: 'def456',
          mime_type: 'application/pdf',
          created_at: '2024-01-01T00:00:00Z',
          modified_at: '2024-01-01T00:00:00Z',
          tags: ['document'],
          custom_fields: {}
        }
      ];

      mockInvoke.mockResolvedValue(mockResults);

      const result = await service.getVideoMetadata();

      expect(mockInvoke).toHaveBeenCalledWith('search_file_metadata', {
        query: { mime_type: 'video/' },
        dbPath: './test-metadata.db'
      });
      expect(result).toHaveLength(1);
      expect(result[0].mime_type).toBe('video/mp4');
    });
  });

  describe('サイズ範囲検索', () => {
    it('should get metadata by size range successfully', async () => {
      const sizeMin = 1000000;
      const sizeMax = 5000000;
      const mockResults: FileMetadata[] = [
        {
          id: 1,
          file_path: '/path/to/video.mp4',
          file_name: 'video.mp4',
          file_size: 2048000,
          file_hash: 'abc123',
          mime_type: 'video/mp4',
          created_at: '2024-01-01T00:00:00Z',
          modified_at: '2024-01-01T00:00:00Z',
          tags: ['video'],
          custom_fields: {}
        }
      ];

      mockInvoke.mockResolvedValue(mockResults);

      const result = await service.getMetadataBySizeRange(sizeMin, sizeMax);

      expect(mockInvoke).toHaveBeenCalledWith('search_file_metadata', {
        query: { size_min: sizeMin, size_max: sizeMax },
        dbPath: './test-metadata.db'
      });
      expect(result).toEqual(mockResults);
    });
  });

  describe('パターン検索', () => {
    it('should get metadata by pattern successfully', async () => {
      const pattern = '*.mp4';
      const mockResults: FileMetadata[] = [
        {
          id: 1,
          file_path: '/path/to/video.mp4',
          file_name: 'video.mp4',
          file_size: 1024000,
          file_hash: 'abc123',
          mime_type: 'video/mp4',
          created_at: '2024-01-01T00:00:00Z',
          modified_at: '2024-01-01T00:00:00Z',
          tags: ['video'],
          custom_fields: {}
        }
      ];

      mockInvoke.mockResolvedValue(mockResults);

      const result = await service.getMetadataByPattern(pattern);

      expect(mockInvoke).toHaveBeenCalledWith('search_file_metadata', {
        query: { file_name_pattern: pattern },
        dbPath: './test-metadata.db'
      });
      expect(result).toEqual(mockResults);
    });
  });

  describe('デフォルトインスタンス', () => {
    it('should export default instance', () => {
      expect(metadataService).toBeInstanceOf(MetadataService);
    });

    it('should use default database path', () => {
      const defaultService = new MetadataService();
      expect(defaultService).toBeInstanceOf(MetadataService);
    });
  });
}); 