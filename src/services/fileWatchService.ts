import { invoke } from '@tauri-apps/api/core';
import type { WatchConfig, FileInfo } from '../types/tauri-commands';

export interface WatchStatus {
  isActive: boolean;
  config?: WatchConfig;
  startTime?: string;
  filesProcessed: number;
  filesUploaded: number;
  filesWithMetadata: number;
  lastActivity?: string;
  errors: string[];
}

export interface WatchPreset {
  name: string;
  description: string;
  config: WatchConfig;
}

class FileWatchService {
  private currentStatus: WatchStatus = {
    isActive: false,
    filesProcessed: 0,
    filesUploaded: 0,
    filesWithMetadata: 0,
    errors: []
  };

  /**
   * ファイル監視を開始
   */
  async startWatching(config: WatchConfig): Promise<string> {
    try {
      const result = await invoke<string>('watch_directory', { config });
      
      this.currentStatus = {
        isActive: true,
        config,
        startTime: new Date().toISOString(),
        filesProcessed: 0,
        filesUploaded: 0,
        filesWithMetadata: 0,
        lastActivity: new Date().toISOString(),
        errors: []
      };

      console.log('File watching started:', result);
      return result;
    } catch (error) {
      const errorMsg = `Failed to start watching: ${error}`;
      this.currentStatus.errors.push(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * ファイル監視を停止
   */
  async stopWatching(): Promise<void> {
    // TODO: 停止機能の実装
    this.currentStatus.isActive = false;
    console.log('File watching stopped');
  }

  /**
   * 監視状態を取得
   */
  getStatus(): WatchStatus {
    return { ...this.currentStatus };
  }

  /**
   * 監視設定をテスト
   */
  async testWatchConfig(config: WatchConfig): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    // パス存在確認
    try {
      const fileInfo = await invoke<FileInfo>('get_file_info', { filePath: config.path });
      if (!fileInfo.is_directory) {
        issues.push('Specified path is not a directory');
      }
    } catch (error) {
      issues.push(`Path does not exist or is inaccessible: ${config.path}`);
    }

    // パターン検証
    if (config.file_patterns.length === 0) {
      issues.push('At least one file pattern must be specified');
    }

    // サイズ制限検証
    if (config.max_file_size_mb && config.max_file_size_mb <= 0) {
      issues.push('Max file size must be positive');
    }

    // 除外パターン検証
    if (config.exclude_patterns.some(p => p.trim() === '')) {
      issues.push('Empty exclude patterns are not allowed');
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * プリセット設定を取得
   */
  getPresets(): WatchPreset[] {
    return [
      {
        name: "動画ファイル監視",
        description: "一般的な動画ファイル形式を監視し、自動アップロード・メタデータ作成を行います",
        config: {
          path: "",
          recursive: true,
          file_patterns: ["*.mp4", "*.mov", "*.avi", "*.mkv", "*.wmv"],
          max_file_size_mb: 5120, // 5GB
          auto_upload: true,
          exclude_patterns: ["*.tmp", "*.part", "*/.DS_Store", "*/Thumbs.db"],
          exclude_directories: [".git", "node_modules", ".cache"],
          auto_metadata: true
        }
      },
      {
        name: "軽量監視",
        description: "メタデータのみ作成し、アップロードは手動で行います",
        config: {
          path: "",
          recursive: false,
          file_patterns: ["*.mp4", "*.mov"],
          max_file_size_mb: 1024, // 1GB
          auto_upload: false,
          exclude_patterns: ["*.tmp"],
          exclude_directories: [],
          auto_metadata: true
        }
      },
      {
        name: "完全自動化",
        description: "すべての動画ファイルを自動的にアップロード・メタデータ化します",
        config: {
          path: "",
          recursive: true,
          file_patterns: ["*.*"], // すべてのファイル
          max_file_size_mb: 10240, // 10GB
          auto_upload: true,
          exclude_patterns: [
            "*.tmp", "*.part", "*.log", "*.cache",
            "*/.DS_Store", "*/Thumbs.db", "*.swp"
          ],
          exclude_directories: [
            ".git", "node_modules", ".cache", ".tmp",
            "System Volume Information", "$RECYCLE.BIN"
          ],
          auto_metadata: true
        }
      },
      {
        name: "開発環境",
        description: "開発時のテスト用設定（小さなファイルのみ）",
        config: {
          path: "",
          recursive: false,
          file_patterns: ["*.mp4"],
          max_file_size_mb: 100, // 100MB
          auto_upload: false,
          exclude_patterns: ["*.tmp"],
          exclude_directories: [],
          auto_metadata: true
        }
      }
    ];
  }

  /**
   * 除外パターンのサジェスト
   */
  getCommonExcludePatterns(): string[] {
    return [
      "*.tmp",        // 一時ファイル
      "*.part",       // ダウンロード中ファイル
      "*.log",        // ログファイル
      "*.cache",      // キャッシュファイル
      "*.swp",        // Vimスワップファイル
      "*/.DS_Store",  // macOS システムファイル
      "*/Thumbs.db",  // Windows サムネイルファイル
      "*.bak",        // バックアップファイル
      "*.~*",         // 一時バックアップ
    ];
  }

  /**
   * 除外ディレクトリのサジェスト
   */
  getCommonExcludeDirectories(): string[] {
    return [
      ".git",                    // Gitリポジトリ
      "node_modules",            // Node.js依存関係
      ".cache",                  // キャッシュディレクトリ
      ".tmp",                    // 一時ディレクトリ
      "System Volume Information", // Windows システム
      "$RECYCLE.BIN",           // Windows ゴミ箱
      ".Trash",                 // macOS ゴミ箱
      ".snapshots",             // スナップショット
    ];
  }

  /**
   * ファイルパターンのサジェスト
   */
  getCommonFilePatterns(): { [category: string]: string[] } {
    return {
      "動画ファイル": [
        "*.mp4", "*.mov", "*.avi", "*.mkv", "*.wmv",
        "*.flv", "*.webm", "*.m4v", "*.3gp", "*.f4v"
      ],
      "高品質動画": [
        "*.mp4", "*.mov", "*.mkv", "*.avi"
      ],
      "すべてのファイル": [
        "*.*"
      ],
      "特定の拡張子": [
        "*.mp4"  // 例: MP4のみ
      ]
    };
  }

  /**
   * 設定をバリデーション
   */
  validateConfig(config: Partial<WatchConfig>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.path || config.path.trim() === '') {
      errors.push('監視パスは必須です');
    }

    if (!config.file_patterns || config.file_patterns.length === 0) {
      errors.push('少なくとも1つのファイルパターンが必要です');
    }

    if (config.max_file_size_mb !== undefined && config.max_file_size_mb <= 0) {
      errors.push('最大ファイルサイズは正の数である必要があります');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 統計情報を更新
   */
  updateStats(stats: Partial<Pick<WatchStatus, 'filesProcessed' | 'filesUploaded' | 'filesWithMetadata'>>) {
    if (stats.filesProcessed !== undefined) {
      this.currentStatus.filesProcessed = stats.filesProcessed;
    }
    if (stats.filesUploaded !== undefined) {
      this.currentStatus.filesUploaded = stats.filesUploaded;
    }
    if (stats.filesWithMetadata !== undefined) {
      this.currentStatus.filesWithMetadata = stats.filesWithMetadata;
    }
    this.currentStatus.lastActivity = new Date().toISOString();
  }

  /**
   * エラーを追加
   */
  addError(error: string) {
    this.currentStatus.errors.push(`${new Date().toISOString()}: ${error}`);
    // 最新100件のみ保持
    if (this.currentStatus.errors.length > 100) {
      this.currentStatus.errors = this.currentStatus.errors.slice(-100);
    }
  }
}

// デフォルトインスタンスをエクスポート
export const fileWatchService = new FileWatchService();
export default FileWatchService; 