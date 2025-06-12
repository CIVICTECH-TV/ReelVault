import { invoke } from '@tauri-apps/api/core';
import type { 
  FileMetadata, 
  MetadataSearchQuery, 
  CreateMetadataRequest, 
  UpdateMetadataRequest 
} from '../types/metadata';

class MetadataService {
  private dbPath: string;

  constructor(dbPath: string = './metadata.db') {
    this.dbPath = dbPath;
  }

  /**
   * メタデータデータベースを初期化
   */
  async initializeDatabase(): Promise<string> {
    try {
      const result = await invoke<string>('initialize_metadata_db', {
        dbPath: this.dbPath
      });
      return result;
    } catch (error) {
      throw new Error(`Database initialization failed: ${error}`);
    }
  }

  /**
   * ファイルメタデータを作成
   */
  async createFileMetadata(request: CreateMetadataRequest): Promise<FileMetadata> {
    try {
      const metadata = await invoke<FileMetadata>('create_file_metadata', {
        filePath: request.file_path,
        tags: request.tags,
        customFields: request.custom_fields
      });
      return metadata;
    } catch (error) {
      throw new Error(`Failed to create metadata: ${error}`);
    }
  }

  /**
   * ファイルメタデータを保存
   */
  async saveFileMetadata(metadata: FileMetadata): Promise<number> {
    try {
      const id = await invoke<number>('save_file_metadata', {
        metadata,
        dbPath: this.dbPath
      });
      return id;
    } catch (error) {
      throw new Error(`Failed to save metadata: ${error}`);
    }
  }

  /**
   * メタデータを検索
   */
  async searchFileMetadata(query: MetadataSearchQuery): Promise<FileMetadata[]> {
    try {
      const results = await invoke<FileMetadata[]>('search_file_metadata', {
        query,
        dbPath: this.dbPath
      });
      return results;
    } catch (error) {
      throw new Error(`Search failed: ${error}`);
    }
  }

  /**
   * ファイルメタデータを更新
   */
  async updateFileMetadata(request: UpdateMetadataRequest): Promise<string> {
    try {
      const result = await invoke<string>('update_file_metadata', {
        filePath: request.file_path,
        tags: request.tags,
        customFields: request.custom_fields,
        dbPath: this.dbPath
      });
      return result;
    } catch (error) {
      throw new Error(`Failed to update metadata: ${error}`);
    }
  }

  /**
   * ファイルメタデータを削除
   */
  async deleteFileMetadata(filePath: string): Promise<string> {
    try {
      const result = await invoke<string>('delete_file_metadata', {
        filePath,
        dbPath: this.dbPath
      });
      return result;
    } catch (error) {
      throw new Error(`Failed to delete metadata: ${error}`);
    }
  }

  /**
   * すべてのタグを取得
   */
  async getAllTags(): Promise<string[]> {
    try {
      const tags = await invoke<string[]>('get_all_tags', {
        dbPath: this.dbPath
      });
      return tags;
    } catch (error) {
      throw new Error(`Failed to get tags: ${error}`);
    }
  }

  /**
   * ファイルパスでメタデータを検索
   */
  async getMetadataByPath(filePath: string): Promise<FileMetadata | null> {
    try {
      const results = await this.searchFileMetadata({});
      return results.find(m => m.file_path === filePath) || null;
    } catch (error) {
      throw new Error(`Failed to get metadata by path: ${error}`);
    }
  }

  /**
   * タグでメタデータを検索
   */
  async getMetadataByTags(tags: string[]): Promise<FileMetadata[]> {
    try {
      const results = await this.searchFileMetadata({ tags });
      return results;
    } catch (error) {
      throw new Error(`Failed to get metadata by tags: ${error}`);
    }
  }

  /**
   * 動画ファイルのメタデータを検索
   */
  async getVideoMetadata(): Promise<FileMetadata[]> {
    try {
      const results = await this.searchFileMetadata({ 
        mime_type: 'video/' 
      });
      return results.filter(m => m.mime_type.startsWith('video/'));
    } catch (error) {
      throw new Error(`Failed to get video metadata: ${error}`);
    }
  }

  /**
   * ファイルサイズ範囲でメタデータを検索
   */
  async getMetadataBySizeRange(sizeMin?: number, sizeMax?: number): Promise<FileMetadata[]> {
    try {
      const results = await this.searchFileMetadata({ 
        size_min: sizeMin,
        size_max: sizeMax
      });
      return results;
    } catch (error) {
      throw new Error(`Failed to get metadata by size range: ${error}`);
    }
  }

  /**
   * ファイル名パターンでメタデータを検索
   */
  async getMetadataByPattern(pattern: string): Promise<FileMetadata[]> {
    try {
      const results = await this.searchFileMetadata({ 
        file_name_pattern: pattern 
      });
      return results;
    } catch (error) {
      throw new Error(`Failed to get metadata by pattern: ${error}`);
    }
  }
}

// デフォルトインスタンスをエクスポート
export const metadataService = new MetadataService();
export default MetadataService; 