import { invoke } from '@tauri-apps/api/core';
import {
  AwsConfig,
  RestoreInfo,
  RestoreStatusResult,
  DownloadProgress,
  RestoreNotification,
} from '../types/tauri-commands';

/**
 * 復元機能サービス
 * AWS S3 Deep Archiveからのファイル復元を管理
 */
export class RestoreService {
  /**
   * ファイルの復元リクエストを送信
   */
  static async restoreFile(
    s3Key: string,
    config: AwsConfig,
    tier: 'Standard' | 'Expedited' | 'Bulk' = 'Standard'
  ): Promise<RestoreInfo> {
    try {
      const result = await invoke<RestoreInfo>('restore_file', {
        s3Key,
        config,
        tier,
      });
      console.log(`Restore request sent for: ${s3Key}`, result);
      return result;
    } catch (error) {
      console.error('Failed to restore file:', error);
      throw new Error(`復元リクエストに失敗しました: ${error}`);
    }
  }

  /**
   * 復元状況を確認
   */
  static async checkRestoreStatus(
    s3Key: string,
    config: AwsConfig
  ): Promise<RestoreStatusResult> {
    try {
      const result = await invoke<RestoreStatusResult>('check_restore_status', {
        s3Key,
        config,
      });
      console.log(`Restore status for ${s3Key}:`, result);
      return result;
    } catch (error) {
      console.error('Failed to check restore status:', error);
      throw new Error(`復元状況の確認に失敗しました: ${error}`);
    }
  }

  /**
   * 復元通知を取得
   */
  static async getRestoreNotifications(): Promise<RestoreNotification[]> {
    try {
      const notifications = await invoke<RestoreNotification[]>('get_restore_notifications');
      console.log('Restore notifications:', notifications);
      return notifications;
    } catch (error) {
      console.error('Failed to get restore notifications:', error);
      throw new Error(`復元通知の取得に失敗しました: ${error}`);
    }
  }

  /**
   * 復元されたファイルをダウンロード
   */
  static async downloadRestoredFile(
    s3Key: string,
    localPath: string,
    config: AwsConfig
  ): Promise<DownloadProgress> {
    try {
      const result = await invoke<DownloadProgress>('download_restored_file', {
        s3Key,
        localPath,
        config,
      });
      console.log(`Download started for ${s3Key} to ${localPath}:`, result);
      return result;
    } catch (error) {
      console.error('Failed to download restored file:', error);
      throw new Error(`ファイルのダウンロードに失敗しました: ${error}`);
    }
  }

  /**
   * 復元ジョブ一覧を取得
   */
  static async listRestoreJobs(): Promise<RestoreInfo[]> {
    try {
      const jobs = await invoke<RestoreInfo[]>('list_restore_jobs');
      console.log('Restore jobs:', jobs);
      return jobs;
    } catch (error) {
      console.error('Failed to list restore jobs:', error);
      throw new Error(`復元ジョブ一覧の取得に失敗しました: ${error}`);
    }
  }

  /**
   * 復元ジョブをキャンセル
   */
  static async cancelRestoreJob(s3Key: string): Promise<boolean> {
    try {
      const result = await invoke<boolean>('cancel_restore_job', { s3Key });
      console.log(`Restore job ${result ? 'cancelled' : 'could not be cancelled'} for: ${s3Key}`);
      return result;
    } catch (error) {
      console.error('Failed to cancel restore job:', error);
      throw new Error(`復元ジョブのキャンセルに失敗しました: ${error}`);
    }
  }

  /**
   * 復元履歴をクリア
   */
  static async clearRestoreHistory(): Promise<number> {
    try {
      const count = await invoke<number>('clear_restore_history');
      console.log(`Cleared ${count} restore job(s) from history`);
      return count;
    } catch (error) {
      console.error('Failed to clear restore history:', error);
      throw new Error(`復元履歴のクリアに失敗しました: ${error}`);
    }
  }

  /**
   * 復元ティアの説明を取得
   */
  static getRestoreTierInfo(tier: string): {
    name: string;
    description: string;
    estimatedTime: string;
    cost: string;
  } {
    switch (tier) {
      case 'Expedited':
        return {
          name: '高速復元',
          description: '最も高速な復元オプション',
          estimatedTime: '1-5分',
          cost: '高',
        };
      case 'Standard':
        return {
          name: '標準復元',
          description: 'バランスの取れた復元オプション',
          estimatedTime: '3-5時間',
          cost: '中',
        };
      case 'Bulk':
        return {
          name: '一括復元',
          description: '最も経済的な復元オプション',
          estimatedTime: '5-12時間',
          cost: '低',
        };
      default:
        return {
          name: '不明',
          description: '不明な復元ティア',
          estimatedTime: '不明',
          cost: '不明',
        };
    }
  }

  /**
   * 復元状況の日本語表示を取得
   */
  static getRestoreStatusText(status: string): string {
    switch (status) {
      case 'in-progress':
        return '復元中';
      case 'completed':
        return '復元完了';
      case 'failed':
        return '復元失敗';
      case 'cancelled':
        return 'キャンセル済み';
      case 'not-found':
        return '見つかりません';
      default:
        return status;
    }
  }

  /**
   * ファイルサイズを人間が読みやすい形式に変換
   */
  static formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * 復元進捗の監視を開始
   */
  static async startRestoreMonitoring(
    s3Key: string,
    config: AwsConfig,
    onStatusUpdate: (status: RestoreStatusResult) => void,
    intervalMs: number = 30000 // 30秒間隔
  ): Promise<() => void> {
    let isMonitoring = true;

    const monitor = async () => {
      while (isMonitoring) {
        try {
          const status = await this.checkRestoreStatus(s3Key, config);
          onStatusUpdate(status);

          // 復元完了または失敗した場合は監視を停止
          if (status.restore_status === 'completed' || 
              status.restore_status === 'failed' ||
              status.restore_status === 'cancelled') {
            break;
          }

          await new Promise(resolve => setTimeout(resolve, intervalMs));
        } catch (error) {
          console.error('Error during restore monitoring:', error);
          break;
        }
      }
    };

    // 監視を開始
    monitor();

    // 監視停止関数を返す
    return () => {
      isMonitoring = false;
    };
  }
} 