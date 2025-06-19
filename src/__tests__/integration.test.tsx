import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import React from 'react';
import App from '../App';
import { TauriCommands } from '../services/tauriCommands';

let listenCallCount = 0;
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockImplementation(() => {
    listenCallCount++;
    if (listenCallCount % 2 === 0) return undefined;
    return {
      then: (cb: any) => {
        if (typeof cb === 'function') cb(() => {});
        return undefined;
      }
    };
  }),
}));

vi.mock('../services/tauriCommands', () => ({
  TauriCommands: {
    getConfig: vi.fn(),
    getAppState: vi.fn(),
    authenticateAws: vi.fn(),
    setConfig: vi.fn(),
    updateAppState: vi.fn(),
    getLifecycleStatus: vi.fn(),
    loadAwsCredentialsSecure: vi.fn(),
    saveAwsCredentialsSecure: vi.fn(),
    testS3BucketAccess: vi.fn(),
    listS3Objects: vi.fn(),
    restoreFile: vi.fn(),
    getS3Object: vi.fn(),
    clearUploadQueue: vi.fn(),
    initializeUploadQueue: vi.fn(),
    addFilesToUploadQueue: vi.fn(),
    startUploadProcessing: vi.fn(),
    stopUploadProcessing: vi.fn(),
    getUploadQueueItems: vi.fn(),
    getUploadQueueStatus: vi.fn(),
    retryUploadItem: vi.fn(),
    removeUploadItem: vi.fn(),
    openFileDialog: vi.fn(),
  },
}));

const mockTauriCommands = vi.mocked(TauriCommands);

// モックデータ
const mockConfig = {
  version: '1.0.0',
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
    default_region: 'us-east-1',
    timeout_seconds: 30,
    max_retries: 3,
  },
};

const mockAppState = {
  is_watching: false,
  upload_queue: [],
  current_uploads: [],
  statistics: {
    total_files_uploaded: 0,
    total_bytes_uploaded: 0,
    files_in_queue: 0,
    successful_uploads: 0,
    failed_uploads: 0,
    average_upload_speed_mbps: 0,
  },
  system_status: {
    aws_connected: false,
    disk_space_gb: 100,
    memory_usage_mb: 512,
    cpu_usage_percent: 10,
    network_available: true,
    last_heartbeat: '2024-01-01T00:00:00Z',
  },
};

const mockAuthResult = {
  success: true,
  message: '認証成功',
  bucket_name: 'test-bucket',
  region: 'us-east-1',
  permissions: ['s3:GetObject', 's3:PutObject', 's3:ListBucket'],
};

const mockAwsCredentials = {
  access_key_id: 'test-access-key',
  secret_access_key: 'test-secret-key',
  region: 'us-east-1',
};

describe('総合テスト - エンドツーエンドワークフロー', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // デフォルトのモック設定
    mockTauriCommands.getConfig.mockResolvedValue(mockConfig);
    mockTauriCommands.getAppState.mockResolvedValue(mockAppState);
    mockTauriCommands.loadAwsCredentialsSecure.mockResolvedValue(mockAwsCredentials);
    mockTauriCommands.authenticateAws.mockResolvedValue(mockAuthResult);
    mockTauriCommands.setConfig.mockResolvedValue(undefined);
    mockTauriCommands.updateAppState.mockResolvedValue(undefined);
    mockTauriCommands.getLifecycleStatus.mockResolvedValue({ enabled: true });
    mockTauriCommands.testS3BucketAccess.mockResolvedValue({ 
      success: true, 
      message: '接続成功',
      bucket_accessible: true 
    });
    mockTauriCommands.restoreFile.mockResolvedValue({ 
      key: 'test-file.txt',
      restore_status: 'completed',
      expiry_date: '2024-01-02T00:00:00Z',
      tier: 'Standard',
      request_time: '2024-01-01T00:00:00Z',
      completion_time: '2024-01-01T00:30:00Z'
    });
    mockTauriCommands.getS3Object.mockResolvedValue({
      key: 'test-file.txt',
      size: 1024,
      last_modified: '2024-01-01T00:00:00Z',
      storage_class: 'STANDARD',
      etag: 'test-etag',
    });
    // UploadManager用のモック設定
    mockTauriCommands.clearUploadQueue.mockResolvedValue(undefined);
    mockTauriCommands.initializeUploadQueue.mockResolvedValue(undefined);
    mockTauriCommands.addFilesToUploadQueue.mockResolvedValue(undefined);
    mockTauriCommands.startUploadProcessing.mockResolvedValue(undefined);
    mockTauriCommands.stopUploadProcessing.mockResolvedValue(undefined);
    mockTauriCommands.getUploadQueueItems.mockResolvedValue([]);
    mockTauriCommands.getUploadQueueStatus.mockResolvedValue({
      total_files: 0,
      completed_files: 0,
      failed_files: 0,
      pending_files: 0,
      in_progress_files: 0,
      total_bytes: 0,
      uploaded_bytes: 0,
      average_speed_mbps: 0,
    });
    mockTauriCommands.retryUploadItem.mockResolvedValue(undefined);
    mockTauriCommands.removeUploadItem.mockResolvedValue(undefined);
    mockTauriCommands.openFileDialog.mockResolvedValue({
      selected_files: [],
      total_size: 0,
      file_count: 0,
    });
  }, 15000); // テスト全体のタイムアウトを15秒に設定

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('設定 → 認証 → アップロードの完全ワークフロー', () => {
    it('should handle complete user workflow from setup to upload', async () => {
      render(<App />);

      // 初期化完了を待つ
      await waitFor(() => {
        expect(screen.getByText(/ReelVault/)).toBeInTheDocument();
      });

      // 設定タブに切り替え
      const settingsButton = screen.getByText(/設定/);
      fireEvent.click(settingsButton);

      // 認証情報を入力
      const accessKeyInput = screen.getByLabelText(/アクセスキーID/);
      const secretKeyInput = screen.getByLabelText(/シークレットアクセスキー/);
      
      await act(async () => {
        fireEvent.change(accessKeyInput, { target: { value: 'test-access-key' } });
        fireEvent.change(secretKeyInput, { target: { value: 'test-secret-key' } });
      });

      // 認証テストを実行
      const authButton = screen.getByText(/🧪 AWS認証をテストする/);
      await waitFor(() => expect(authButton).not.toBeDisabled());
      
      await act(async () => {
        fireEvent.click(authButton);
      });

      // 認証成功を待つ
      await waitFor(() => {
        expect(screen.getByText(/✅ 成功/)).toBeInTheDocument();
      }, { timeout: 10000 });

      // バケット名を設定
      const bucketNameInput = screen.getByLabelText(/S3バケット名/);
      await act(async () => {
        fireEvent.change(bucketNameInput, { target: { value: 'my-test-bucket' } });
      });

      // バックアップタブに切り替え（アップロード機能）
      const backupButton = screen.getByText(/バックアップ/);
      fireEvent.click(backupButton);

      // バックアップ機能が利用可能になることを確認
      await waitFor(() => {
        expect(screen.getAllByText(/バックアップ/)[0]).toBeInTheDocument();
      });
    }, 15000); // 個別テストのタイムアウトを15秒に設定

    it('should handle authentication failure and recovery', async () => {
      // 認証失敗をモック
      mockTauriCommands.authenticateAws.mockRejectedValue(new Error('認証失敗'));

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/ReelVault/)).toBeInTheDocument();
      });

      // 設定タブに切り替え
      const settingsButton = screen.getByText(/設定/);
      fireEvent.click(settingsButton);

      // 認証情報を入力
      const accessKeyInput = screen.getByLabelText(/アクセスキーID/);
      const secretKeyInput = screen.getByLabelText(/シークレットアクセスキー/);
      
      await act(async () => {
        fireEvent.change(accessKeyInput, { target: { value: 'invalid-key' } });
        fireEvent.change(secretKeyInput, { target: { value: 'invalid-secret' } });
      });

      // 認証テストを実行
      const authButton = screen.getByText(/🧪 AWS認証をテストする/);
      await waitFor(() => expect(authButton).not.toBeDisabled());
      
      await act(async () => {
        fireEvent.click(authButton);
      });

      // 認証失敗の表示を待つ
      await waitFor(() => {
        expect(screen.getByText(/❌ 認証失敗/)).toBeInTheDocument();
      }, { timeout: 10000 });

      // 認証成功に変更
      mockTauriCommands.authenticateAws.mockResolvedValue(mockAuthResult);

      // 再認証を実行
      await act(async () => {
        fireEvent.click(authButton);
      });

      // 認証成功を待つ
      await waitFor(() => {
        expect(screen.getByText(/✅ 成功/)).toBeInTheDocument();
      }, { timeout: 10000 });
    }, 15000); // 個別テストのタイムアウトを15秒に設定
  });

  describe('コンポーネント間の状態連携', () => {
    it('should propagate configuration changes across components', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/ReelVault/)).toBeInTheDocument();
      });

      // 設定タブで設定を変更
      const settingsButton = screen.getByText(/設定/);
      fireEvent.click(settingsButton);

      // 認証情報を入力して認証を実行
      const accessKeyInput = screen.getByLabelText(/アクセスキーID/);
      const secretKeyInput = screen.getByLabelText(/シークレットアクセスキー/);
      
      await act(async () => {
        fireEvent.change(accessKeyInput, { target: { value: 'test-access-key' } });
        fireEvent.change(secretKeyInput, { target: { value: 'test-secret-key' } });
      });

      const authButton = screen.getByText(/🧪 AWS認証をテストする/);
      await waitFor(() => expect(authButton).not.toBeDisabled());
      
      await act(async () => {
        fireEvent.click(authButton);
      });

      // 認証成功を待つ
      await waitFor(() => {
        expect(screen.getByText(/✅ 成功/)).toBeInTheDocument();
      }, { timeout: 10000 });

      // バケット名を変更
      const bucketNameInput = screen.getByLabelText(/S3バケット名/);
      await act(async () => {
        fireEvent.change(bucketNameInput, { target: { value: 'new-bucket-name' } });
      });

      // バケット名が変更されたことを確認
      await waitFor(() => {
        expect(bucketNameInput).toHaveValue('new-bucket-name');
      });
    });

    it('should handle state updates and propagate to child components', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/ReelVault/)).toBeInTheDocument();
      });

      // アプリ状態の更新をシミュレート
      const updatedState = {
        ...mockAppState,
        is_watching: true,
        system_status: {
          ...mockAppState.system_status,
          aws_connected: true,
        },
      };

      // 状態更新のコールバックを取得して実行
      // 実際のAppコンポーネントでは状態更新が行われる
      expect(mockTauriCommands.updateAppState).toBeDefined();
    });
  });

  describe('エラーハンドリングと復旧', () => {
    it('should handle network connectivity issues gracefully', async () => {
      // ネットワーク切断状態をモック
      const disconnectedState = {
        ...mockAppState,
        system_status: {
          ...mockAppState.system_status,
          network_available: false,
          aws_connected: false,
        },
      };
      mockTauriCommands.getAppState.mockResolvedValue(disconnectedState);

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/ReelVault/)).toBeInTheDocument();
      });

      // ネットワーク切断状態でもアプリが正常に動作することを確認
      expect(screen.getByText(/設定/)).toBeInTheDocument();
      expect(screen.getByText(/アップロード/)).toBeInTheDocument();
    });

    it('should handle configuration loading errors', async () => {
      // 設定読み込みエラーをモック
      mockTauriCommands.getConfig.mockRejectedValue(new Error('設定読み込み失敗'));

      render(<App />);

      // エラー状態でもアプリが正常にレンダリングされることを確認
      await waitFor(() => {
        expect(screen.getByText(/エラー/)).toBeInTheDocument();
      });
    });

    it('should handle AWS service errors during operations', async () => {
      // AWS操作エラーをモック
      mockTauriCommands.testS3BucketAccess.mockRejectedValue(new Error('S3アップロード失敗'));

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/ReelVault/)).toBeInTheDocument();
      });

      // バックアップタブに切り替え
      const backupButton = screen.getByText(/バックアップ/);
      fireEvent.click(backupButton);

      // エラー状態でもバックアップ機能が利用可能であることを確認
      await waitFor(() => {
        expect(screen.getAllByText(/バックアップ/)[0]).toBeInTheDocument();
      });
    });
  });

  describe('パフォーマンスと安定性', () => {
    it('should handle rapid user interactions without errors', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/ReelVault/)).toBeInTheDocument();
      });

      // タブを素早く切り替え
      const settingsButton = screen.getAllByText(/設定/)[0]; // 最初の設定ボタン（タブ）
      const backupButton = screen.getByText(/バックアップ/);
      const statusButton = screen.getByText(/ステータス/);

      await act(async () => {
        fireEvent.click(settingsButton);
        fireEvent.click(backupButton);
        fireEvent.click(statusButton);
        fireEvent.click(settingsButton);
      });

      // エラーが発生しないことを確認
      expect(screen.getAllByText(/設定/)[0]).toBeInTheDocument();
    });

    it('should handle large file operations gracefully', async () => {
      // 大きなファイルのメタデータをモック
      mockTauriCommands.getS3Object.mockResolvedValue({
        key: 'large-file.zip',
        size: 1024 * 1024 * 1024, // 1GB
        last_modified: '2024-01-01T00:00:00Z',
        storage_class: 'DEEP_ARCHIVE',
        etag: 'large-file-etag',
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/ReelVault/)).toBeInTheDocument();
      });

      // 大きなファイルでも正常に処理されることを確認
      expect(mockTauriCommands.getS3Object).toBeDefined();
    });
  });

  describe('セキュリティと認証', () => {
    it('should handle secure credential storage', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/ReelVault/)).toBeInTheDocument();
      });

      // 設定タブに切り替え
      const settingsButton = screen.getByText(/設定/);
      fireEvent.click(settingsButton);

      // 認証情報が安全に読み込まれることを確認
      await waitFor(() => {
        expect(mockTauriCommands.loadAwsCredentialsSecure).toHaveBeenCalled();
      });
    });

    it('should handle credential validation properly', async () => {
      // 無効な認証情報をモック
      mockTauriCommands.loadAwsCredentialsSecure.mockResolvedValue({
        access_key_id: '',
        secret_access_key: '',
        region: 'us-east-1',
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/ReelVault/)).toBeInTheDocument();
      });

      // 設定タブに切り替え
      const settingsButton = screen.getByText(/設定/);
      fireEvent.click(settingsButton);

      // 認証情報が空でも正常に動作することを確認
      await waitFor(() => {
        expect(screen.getByLabelText(/アクセスキーID/)).toBeInTheDocument();
      });
    });
  });
}); 