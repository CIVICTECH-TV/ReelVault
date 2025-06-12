import { TauriCommands } from '../types/tauri-commands';
import { 
  UploadConfig, 
  UploadItem, 
  UploadStatistics, 
  FileSelection, 
  S3KeyConfig,
  UploadProgressInfo,
  AwsCredentials 
} from '../types/tauri-commands';
import { listen } from '@tauri-apps/api/event';

/**
 * アップロードシステムサービス
 * Issue #4 (ファイルアップロード機能) と Issue #31 (バックグラウンドアップロード) の統合実装
 */
export class UploadService {
  private static instance: UploadService;
  private isInitialized = false;
  private progressListeners: ((progress: UploadProgressInfo) => void)[] = [];
  private statusListeners: ((status: UploadStatistics) => void)[] = [];

  private constructor() {}

  public static getInstance(): UploadService {
    if (!UploadService.instance) {
      UploadService.instance = new UploadService();
    }
    return UploadService.instance;
  }

  /**
   * アップロードシステムを初期化
   */
  public async initialize(config: UploadConfig): Promise<void> {
    try {
      await TauriCommands.initializeUploadQueue(config);
      
      // 進捗イベントリスナーを設定
      await listen<UploadProgressInfo>('upload-progress', (event) => {
        this.notifyProgressListeners(event.payload);
      });

      this.isInitialized = true;
      console.log('Upload system initialized successfully');
    } catch (error) {
      console.error('Failed to initialize upload system:', error);
      throw error;
    }
  }

  /**
   * アップロード設定をテスト
   */
  public async testConfiguration(config: UploadConfig): Promise<string> {
    try {
      return await TauriCommands.testUploadConfig(config);
    } catch (error) {
      console.error('Upload configuration test failed:', error);
      throw error;
    }
  }

  /**
   * ファイル選択ダイアログを開く
   */
  public async openFileDialog(multiple: boolean = true, fileTypes?: string[]): Promise<FileSelection> {
    try {
      return await TauriCommands.openFileDialog(multiple, fileTypes);
    } catch (error) {
      console.error('Failed to open file dialog:', error);
      throw error;
    }
  }

  /**
   * ファイルをアップロードキューに追加
   */
  public async addFilesToQueue(
    filePaths: string[], 
    s3KeyConfig: S3KeyConfig
  ): Promise<string[]> {
    this.ensureInitialized();
    
    try {
      const itemIds = await TauriCommands.addFilesToUploadQueue(filePaths, s3KeyConfig);
      console.log(`Added ${filePaths.length} files to upload queue`);
      return itemIds;
    } catch (error) {
      console.error('Failed to add files to upload queue:', error);
      throw error;
    }
  }

  /**
   * アップロードキューからアイテムを削除
   */
  public async removeFromQueue(itemId: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      await TauriCommands.removeUploadItem(itemId);
      console.log(`Removed item ${itemId} from upload queue`);
    } catch (error) {
      console.error('Failed to remove item from upload queue:', error);
      throw error;
    }
  }

  /**
   * アップロード処理を開始
   */
  public async startProcessing(): Promise<void> {
    this.ensureInitialized();
    
    try {
      await TauriCommands.startUploadProcessing();
      console.log('Upload processing started');
    } catch (error) {
      console.error('Failed to start upload processing:', error);
      throw error;
    }
  }

  /**
   * アップロード処理を停止
   */
  public async stopProcessing(): Promise<void> {
    this.ensureInitialized();
    
    try {
      await TauriCommands.stopUploadProcessing();
      console.log('Upload processing stopped');
    } catch (error) {
      console.error('Failed to stop upload processing:', error);
      throw error;
    }
  }

  /**
   * アップロードキューの統計を取得
   */
  public async getQueueStatistics(): Promise<UploadStatistics> {
    this.ensureInitialized();
    
    try {
      return await TauriCommands.getUploadQueueStatus();
    } catch (error) {
      console.error('Failed to get upload queue statistics:', error);
      throw error;
    }
  }

  /**
   * アップロードキューの全アイテムを取得
   */
  public async getQueueItems(): Promise<UploadItem[]> {
    this.ensureInitialized();
    
    try {
      return await TauriCommands.getUploadQueueItems();
    } catch (error) {
      console.error('Failed to get upload queue items:', error);
      throw error;
    }
  }

  /**
   * 失敗したアップロードを再試行
   */
  public async retryUpload(itemId: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      await TauriCommands.retryUploadItem(itemId);
      console.log(`Retry scheduled for upload item: ${itemId}`);
    } catch (error) {
      console.error('Failed to retry upload:', error);
      throw error;
    }
  }

  /**
   * アップロードキューをクリア
   */
  public async clearQueue(): Promise<void> {
    this.ensureInitialized();
    
    try {
      await TauriCommands.clearUploadQueue();
      console.log('Upload queue cleared');
    } catch (error) {
      console.error('Failed to clear upload queue:', error);
      throw error;
    }
  }

  /**
   * 進捗リスナーを追加
   */
  public addProgressListener(listener: (progress: UploadProgressInfo) => void): void {
    this.progressListeners.push(listener);
  }

  /**
   * 進捗リスナーを削除
   */
  public removeProgressListener(listener: (progress: UploadProgressInfo) => void): void {
    const index = this.progressListeners.indexOf(listener);
    if (index > -1) {
      this.progressListeners.splice(index, 1);
    }
  }

  /**
   * 統計リスナーを追加
   */
  public addStatusListener(listener: (status: UploadStatistics) => void): void {
    this.statusListeners.push(listener);
  }

  /**
   * 統計リスナーを削除
   */
  public removeStatusListener(listener: (status: UploadStatistics) => void): void {
    const index = this.statusListeners.indexOf(listener);
    if (index > -1) {
      this.statusListeners.splice(index, 1);
    }
  }

  /**
   * デフォルトのアップロード設定を生成
   */
  public static createDefaultConfig(
    awsCredentials: AwsCredentials,
    bucketName: string
  ): UploadConfig {
    return {
      aws_credentials: awsCredentials,
      bucket_name: bucketName,
      max_concurrent_uploads: 3,
      chunk_size_mb: 10,
      retry_attempts: 3,
      timeout_seconds: 300,
      auto_create_metadata: true,
      s3_key_prefix: 'uploads',
    };
  }

  /**
   * デフォルトのS3キー設定を生成
   */
  public static createDefaultS3KeyConfig(): S3KeyConfig {
    return {
      prefix: 'uploads',
      use_date_folder: true,
      preserve_directory_structure: false,
      custom_naming_pattern: undefined,
    };
  }

  /**
   * プリセットS3キー設定を生成
   */
  public static createS3KeyPresets(): Record<string, S3KeyConfig> {
    return {
      simple: {
        prefix: 'uploads',
        use_date_folder: false,
        preserve_directory_structure: false,
      },
      organized: {
        prefix: 'media',
        use_date_folder: true,
        preserve_directory_structure: false,
      },
      structured: {
        prefix: 'files',
        use_date_folder: true,
        preserve_directory_structure: true,
      },
      custom: {
        prefix: 'custom',
        use_date_folder: false,
        preserve_directory_structure: false,
        custom_naming_pattern: '{timestamp}_{filename}',
      },
    };
  }

  /**
   * ファイルサイズを人間が読みやすい形式に変換
   */
  public static formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * アップロード速度を人間が読みやすい形式に変換
   */
  public static formatSpeed(mbps: number): string {
    if (mbps < 1) {
      return `${(mbps * 1024).toFixed(1)} KB/s`;
    }
    return `${mbps.toFixed(1)} MB/s`;
  }

  /**
   * 残り時間を人間が読みやすい形式に変換
   */
  public static formatETA(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)}秒`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes}分`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}時間${minutes}分`;
    }
  }

  /**
   * アップロード統計のサマリーを生成
   */
  public static generateStatisticsSummary(stats: UploadStatistics): string {
    const completionRate = stats.total_files > 0 
      ? ((stats.completed_files / stats.total_files) * 100).toFixed(1)
      : '0';
    
    const totalSizeFormatted = UploadService.formatFileSize(stats.total_bytes);
    const uploadedSizeFormatted = UploadService.formatFileSize(stats.uploaded_bytes);
    const speedFormatted = UploadService.formatSpeed(stats.average_speed_mbps);
    
    let summary = `完了率: ${completionRate}% (${stats.completed_files}/${stats.total_files})\n`;
    summary += `データ量: ${uploadedSizeFormatted} / ${totalSizeFormatted}\n`;
    summary += `平均速度: ${speedFormatted}`;
    
    if (stats.estimated_time_remaining) {
      const etaFormatted = UploadService.formatETA(stats.estimated_time_remaining);
      summary += `\n残り時間: ${etaFormatted}`;
    }
    
    return summary;
  }

  /**
   * 定期的に統計を更新
   */
  public async startPeriodicStatusUpdate(intervalMs: number = 2000): Promise<void> {
    const updateStatus = async () => {
      try {
        const stats = await this.getQueueStatistics();
        this.notifyStatusListeners(stats);
      } catch (error) {
        console.error('Failed to update upload statistics:', error);
      }
    };

    // 初回実行
    await updateStatus();
    
    // 定期実行
    setInterval(updateStatus, intervalMs);
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Upload service not initialized. Call initialize() first.');
    }
  }

  private notifyProgressListeners(progress: UploadProgressInfo): void {
    this.progressListeners.forEach(listener => {
      try {
        listener(progress);
      } catch (error) {
        console.error('Error in progress listener:', error);
      }
    });
  }

  private notifyStatusListeners(status: UploadStatistics): void {
    this.statusListeners.forEach(listener => {
      try {
        listener(status);
      } catch (error) {
        console.error('Error in status listener:', error);
      }
    });
  }
}

// シングルトンインスタンスをエクスポート
export const uploadService = UploadService.getInstance(); 