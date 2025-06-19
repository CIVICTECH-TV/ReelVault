import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { ConfigManager } from '../ConfigManager';
import { TauriCommands } from '../../services/tauriCommands';
import * as debugUtils from '../../utils/debug';

// isDevのモック
vi.mock('../../utils/debug', () => ({
  isDev: vi.fn(),
  debugLog: vi.fn(),
  debugError: vi.fn(),
}));

// Tauri APIのモック
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn(),
}));

// TauriCommandsのモック
vi.mock('../../services/tauriCommands', () => ({
  TauriCommands: {
    getConfig: vi.fn(),
    getAppState: vi.fn(),
    loadAwsCredentialsSecure: vi.fn(),
    getLifecycleStatus: vi.fn().mockResolvedValue({
      enabled: true,
      rule_id: 'test-rule',
      transition_days: 30,
      storage_class: 'STANDARD_IA',
      prefix: '',
      error_message: undefined,
    }),
    listS3Objects: vi.fn().mockResolvedValue([]),
    authenticateAws: vi.fn(),
    saveAwsCredentialsSecure: vi.fn(),
    testS3BucketAccess: vi.fn(),
    setConfig: vi.fn(),
    updateConfig: vi.fn(),
    validateConfigFile: vi.fn(),
    validateLifecycleConfig: vi.fn(),
    listLifecycleRules: vi.fn(),
    enableReelvaultLifecycle: vi.fn(),
    restoreFile: vi.fn(),
    checkRestoreStatus: vi.fn(),
    getRestoreNotifications: vi.fn(),
    downloadRestoredFile: vi.fn(),
    listRestoreJobs: vi.fn(),
    cancelRestoreJob: vi.fn(),
    clearRestoreHistory: vi.fn(),
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

// ダミーデータ
const dummyAppConfig = {
  version: '1.0.0',
  app_settings: {
    log_level: 'info',
    theme: 'dark',
    language: 'ja',
  },
  user_preferences: {
    default_bucket_name: 'test-bucket',
    default_storage_class: 'STANDARD_IA',
  },
  aws_settings: {
    default_region: 'ap-northeast-1',
    timeout_seconds: 30,
    max_retries: 3,
    profile_name: 'default',
  },
};

const dummyAppState = {
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
  last_error: undefined,
  system_status: {
    aws_connected: true,
    disk_space_gb: 100,
    memory_usage_mb: 512,
    cpu_usage_percent: 10,
    network_available: true,
    last_heartbeat: new Date().toISOString(),
  },
};

const dummyAwsCredentials = {
  access_key_id: 'test-access-key',
  secret_access_key: 'test-secret-key',
  region: 'ap-northeast-1',
  session_token: undefined,
};

const dummyAuthResult = {
  success: true,
  message: '認証成功',
  user_identity: {
    user_id: 'test-user-id',
    arn: 'arn:aws:iam::123456789012:user/test-user',
    account: '123456789012',
  },
  permissions: ['s3:GetObject', 's3:PutObject', 's3:ListBucket'],
};

const dummyPermissionCheck = {
  success: true,
  message: 'バケットアクセス成功',
  bucket_accessible: true,
};

const dummyS3Objects = [
  {
    key: 'test-file1.mp4',
    size: 1024000,
    last_modified: '2024-01-01T00:00:00Z',
    storage_class: 'DEEP_ARCHIVE',
    etag: 'test-etag-1',
  },
  {
    key: 'test-file2.mp4',
    size: 2048000,
    last_modified: '2024-01-02T00:00:00Z',
    storage_class: 'STANDARD_IA',
    etag: 'test-etag-2',
  },
];

// タイムアウトを全体で10秒に延長
vi.setConfig({ testTimeout: 10000 });

describe('ConfigManager', () => {
  const mockOnConfigChange = vi.fn();
  const mockOnStateChange = vi.fn();
  const mockOnAuthSuccess = vi.fn();
  const mockOnHealthStatusChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(debugUtils.isDev).mockReturnValue(true);
    // TauriCommandsの全メソッドを明示的に初期化
    vi.mocked(TauriCommands.getConfig).mockResolvedValue(dummyAppConfig);
    vi.mocked(TauriCommands.getAppState).mockResolvedValue(dummyAppState);
    vi.mocked(TauriCommands.loadAwsCredentialsSecure).mockResolvedValue(dummyAwsCredentials);
    vi.mocked(TauriCommands.getLifecycleStatus).mockResolvedValue({ enabled: true, rule_id: 'test-rule', transition_days: 30, storage_class: 'STANDARD_IA' });
    vi.mocked(TauriCommands.testS3BucketAccess).mockResolvedValue(dummyPermissionCheck);
    vi.mocked(TauriCommands.setConfig).mockResolvedValue(undefined);
    vi.mocked(TauriCommands.updateConfig).mockResolvedValue(undefined);
    vi.mocked(TauriCommands.validateConfigFile).mockResolvedValue({ valid: true, errors: [], warnings: [] });
    vi.mocked(TauriCommands.validateLifecycleConfig).mockResolvedValue(true);
    vi.mocked(TauriCommands.listLifecycleRules).mockResolvedValue([]);
    vi.mocked(TauriCommands.enableReelvaultLifecycle).mockResolvedValue({ success: true, message: 'ライフサイクル有効化成功', rule_id: 'test-rule', transition_days: 30, storage_class: 'STANDARD_IA' });
    vi.mocked(TauriCommands.listS3Objects).mockResolvedValue(dummyS3Objects);
    vi.mocked(TauriCommands.clearRestoreHistory).mockResolvedValue(undefined);
    vi.mocked(TauriCommands.authenticateAws).mockResolvedValue(dummyAuthResult);
    vi.mocked(TauriCommands.saveAwsCredentialsSecure).mockResolvedValue(undefined);
    // UploadManager用のメソッドのモック設定
    vi.mocked(TauriCommands.clearUploadQueue).mockResolvedValue(undefined);
    vi.mocked(TauriCommands.initializeUploadQueue).mockResolvedValue(undefined);
    vi.mocked(TauriCommands.addFilesToUploadQueue).mockResolvedValue(undefined);
    vi.mocked(TauriCommands.startUploadProcessing).mockResolvedValue(undefined);
    vi.mocked(TauriCommands.stopUploadProcessing).mockResolvedValue(undefined);
    vi.mocked(TauriCommands.getUploadQueueItems).mockResolvedValue([]);
    vi.mocked(TauriCommands.getUploadQueueStatus).mockResolvedValue({ 
      total_files_uploaded: 0,
      total_bytes_uploaded: 0,
      files_in_queue: 0,
      successful_uploads: 0,
      failed_uploads: 0,
      average_upload_speed_mbps: 0
    });
    vi.mocked(TauriCommands.retryUploadItem).mockResolvedValue(undefined);
    vi.mocked(TauriCommands.removeUploadItem).mockResolvedValue(undefined);
    vi.mocked(TauriCommands.openFileDialog).mockResolvedValue({ selected_files: [], total_size: 0, file_count: 0 });
  });

  // ===== ライフサイクル管理テスト =====
  it('should handle lifecycle management functionality', async () => {
    // getLifecycleStatusのモック
    vi.mocked(TauriCommands.getLifecycleStatus).mockResolvedValue({
      enabled: false,
      rule_id: undefined,
      transition_days: undefined,
      storage_class: undefined,
      prefix: '',
      error_message: 'ライフサイクル設定が見つかりません',
    });

    render(
      <ConfigManager
        initialConfig={dummyAppConfig}
        initialState={dummyAppState}
        onConfigChange={mockOnConfigChange}
        onStateChange={mockOnStateChange}
        onAuthSuccess={mockOnAuthSuccess}
        onHealthStatusChange={mockOnHealthStatusChange}
      />
    );

    // 設定タブに切り替え
    const settingsButton = screen.getByText(/設定/);
    fireEvent.click(settingsButton);

    // credentialsがセットされるまで待機
    await waitFor(() => {
      expect(screen.getByDisplayValue('test-access-key')).toBeInTheDocument();
      expect(screen.getByDisplayValue('test-secret-key')).toBeInTheDocument();
      const regionSelect = screen.getByLabelText('AWSリージョン:') as HTMLSelectElement;
      expect(regionSelect.value).toBe('ap-northeast-1');
    });

    // 自動ライフサイクル状況チェックの完了を待つ
    await waitFor(() => {
      expect(TauriCommands.getLifecycleStatus).toHaveBeenCalled();
    }, { timeout: 3000 });

    // getLifecycleStatusが正しい引数で呼ばれたことを確認
    expect(vi.mocked(TauriCommands.getLifecycleStatus)).toHaveBeenCalledWith({
      access_key_id: 'test-access-key',
      secret_access_key: 'test-secret-key',
      region: 'ap-northeast-1',
      bucket_name: 'test-bucket'
    });

    // 返り値が期待通りであることを確認
    const lastCall = vi.mocked(TauriCommands.getLifecycleStatus).mock.calls[vi.mocked(TauriCommands.getLifecycleStatus).mock.calls.length - 1];
    expect(lastCall[0]).toEqual({
      access_key_id: 'test-access-key',
      secret_access_key: 'test-secret-key',
      region: 'ap-northeast-1',
      bucket_name: 'test-bucket'
    });
  });

  // ===== 基本UIテスト =====
  it('should render ConfigManager component', async () => {
    render(
      <ConfigManager
        initialConfig={dummyAppConfig}
        initialState={dummyAppState}
        onConfigChange={mockOnConfigChange}
        onStateChange={mockOnStateChange}
        onAuthSuccess={mockOnAuthSuccess}
        onHealthStatusChange={mockOnHealthStatusChange}
      />
    );

    // 基本的なUI要素が表示されることを確認
    await waitFor(() => {
      expect(screen.getByText(/システム状態/)).toBeInTheDocument();
      expect(screen.getByText(/設定/)).toBeInTheDocument();
      expect(screen.getByText(/バックアップ/)).toBeInTheDocument();
      expect(screen.getByText(/リストア/)).toBeInTheDocument();
      expect(screen.getByText((content) => content.includes('APIテスト'))).toBeInTheDocument();
    });
  });

  it('should display system status tab by default', async () => {
    render(
      <ConfigManager
        initialConfig={dummyAppConfig}
        initialState={dummyAppState}
        onConfigChange={mockOnConfigChange}
        onStateChange={mockOnStateChange}
        onAuthSuccess={mockOnAuthSuccess}
        onHealthStatusChange={mockOnHealthStatusChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/システム状態/)).toBeInTheDocument();
      expect(screen.getByText(/バケット名:/)).toBeInTheDocument();
      expect(screen.getByDisplayValue('test-bucket')).toBeInTheDocument();
    });
  });

  // ===== タブ切り替えテスト =====
  it('should switch to settings tab when settings button is clicked', async () => {
    render(
      <ConfigManager
        initialConfig={dummyAppConfig}
        initialState={dummyAppState}
        onConfigChange={mockOnConfigChange}
        onStateChange={mockOnStateChange}
        onAuthSuccess={mockOnAuthSuccess}
        onHealthStatusChange={mockOnHealthStatusChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/設定/)).toBeInTheDocument();
    });

    const settingsButton = screen.getByText(/設定/);
    fireEvent.click(settingsButton);

    await waitFor(() => {
      expect(screen.getByText(/手動設定/)).toBeInTheDocument();
      expect(screen.getByText(/アクセスキーID/)).toBeInTheDocument();
    });
  });

  it('should switch to restore tab when restore button is clicked', async () => {
    render(
      <ConfigManager
        initialConfig={dummyAppConfig}
        initialState={dummyAppState}
        onConfigChange={mockOnConfigChange}
        onStateChange={mockOnStateChange}
        onAuthSuccess={mockOnAuthSuccess}
        onHealthStatusChange={mockOnHealthStatusChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/リストア/)).toBeInTheDocument();
    });

    const restoreButton = screen.getByText(/リストア/);
    fireEvent.click(restoreButton);

    await waitFor(() => {
      expect(screen.getByText(/S3オブジェクト一覧/)).toBeInTheDocument();
    });
  });

  it('should switch to upload tab when upload button is clicked', async () => {
    render(
      <ConfigManager
        initialConfig={dummyAppConfig}
        initialState={dummyAppState}
        onConfigChange={mockOnConfigChange}
        onStateChange={mockOnStateChange}
        onAuthSuccess={mockOnAuthSuccess}
        onHealthStatusChange={mockOnHealthStatusChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/バックアップ/)).toBeInTheDocument();
    });

    const uploadButton = screen.getByText(/バックアップ/);
    fireEvent.click(uploadButton);

    await waitFor(() => {
      expect(screen.getByText(/📁 ファイル選択/)).toBeInTheDocument();
    });
  });

  // ===== AWS認証機能テスト =====
  it('should load saved AWS credentials on mount', async () => {
    render(
      <ConfigManager
        initialConfig={dummyAppConfig}
        initialState={dummyAppState}
        onConfigChange={mockOnConfigChange}
        onStateChange={mockOnStateChange}
        onAuthSuccess={mockOnAuthSuccess}
        onHealthStatusChange={mockOnHealthStatusChange}
      />
    );

    await waitFor(() => {
      expect(TauriCommands.loadAwsCredentialsSecure).toHaveBeenCalledWith('default');
    });
  });

  it('should display AWS credentials in settings tab', async () => {
    render(
      <ConfigManager
        initialConfig={dummyAppConfig}
        initialState={dummyAppState}
        onConfigChange={mockOnConfigChange}
        onStateChange={mockOnStateChange}
        onAuthSuccess={mockOnAuthSuccess}
        onHealthStatusChange={mockOnHealthStatusChange}
      />
    );

    // 設定タブに切り替え
    const settingsButton = screen.getByText(/設定/);
    fireEvent.click(settingsButton);

    await waitFor(() => {
      expect(screen.getByDisplayValue('test-access-key')).toBeInTheDocument();
      expect(screen.getByDisplayValue('test-secret-key')).toBeInTheDocument();
      const regionSelect = screen.getByLabelText('AWSリージョン:') as HTMLSelectElement;
      expect(regionSelect.value).toBe('ap-northeast-1');
    });
  });

  it('should handle AWS authentication successfully', async () => {
    render(
      <ConfigManager
        initialConfig={dummyAppConfig}
        initialState={dummyAppState}
        onConfigChange={mockOnConfigChange}
        onStateChange={mockOnStateChange}
        onAuthSuccess={mockOnAuthSuccess}
        onHealthStatusChange={mockOnHealthStatusChange}
      />
    );

    // 設定タブに切り替え
    const settingsButton = screen.getByText(/設定/);
    fireEvent.click(settingsButton);

    // 認証用フィールドを入力
    const accessKeyInput = screen.getByLabelText(/アクセスキーID/);
    const secretKeyInput = screen.getByLabelText(/シークレットアクセスキー/);
    const authButton = screen.getByText(/🧪 AWS認証をテストする/);
    await act(async () => {
      fireEvent.change(accessKeyInput, { target: { value: 'test-access-key' } });
      fireEvent.change(secretKeyInput, { target: { value: 'test-secret-key' } });
    });
    await waitFor(() => expect(authButton).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(authButton);
    });

    // 認証処理が実行されることを確認
    await waitFor(() => {
      expect(TauriCommands.authenticateAws).toHaveBeenCalled();
    }, { timeout: 5000 });

    // 認証成功の表示を待つ
    await waitFor(() => {
      expect(screen.getByText(/✅ 成功/)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('should handle AWS authentication failure', async () => {
    const authError = { success: false, message: '認証失敗', user_identity: undefined, permissions: [] };
    vi.mocked(TauriCommands.authenticateAws).mockRejectedValue(new Error('認証失敗'));

    render(
      <ConfigManager
        initialConfig={dummyAppConfig}
        initialState={dummyAppState}
        onConfigChange={mockOnConfigChange}
        onStateChange={mockOnStateChange}
        onAuthSuccess={mockOnAuthSuccess}
        onHealthStatusChange={mockOnHealthStatusChange}
      />
    );

    // 設定タブに切り替え
    const settingsButton = screen.getByText(/設定/);
    fireEvent.click(settingsButton);

    // 認証用フィールドを入力
    const accessKeyInput = screen.getByLabelText(/アクセスキーID/);
    const secretKeyInput = screen.getByLabelText(/シークレットアクセスキー/);
    const authButton = screen.getByText(/🧪 AWS認証をテストする/);
    await act(async () => {
      fireEvent.change(accessKeyInput, { target: { value: 'test-access-key' } });
      fireEvent.change(secretKeyInput, { target: { value: 'test-secret-key' } });
    });
    await waitFor(() => expect(authButton).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(authButton);
    });

    await waitFor(() => {
      expect(TauriCommands.authenticateAws).toHaveBeenCalledWith(dummyAwsCredentials);
      expect(mockOnAuthSuccess).not.toHaveBeenCalled();
    });
  });

  it('should handle bucket access test successfully', async () => {
    // 認証が成功した状態をモック
    vi.mocked(TauriCommands.authenticateAws).mockResolvedValue(dummyAuthResult);

    render(
      <ConfigManager
        initialConfig={dummyAppConfig}
        initialState={dummyAppState}
        onConfigChange={mockOnConfigChange}
        onStateChange={mockOnStateChange}
        onAuthSuccess={mockOnAuthSuccess}
        onHealthStatusChange={mockOnHealthStatusChange}
      />
    );

    // 設定タブに切り替え
    const settingsButton = screen.getByText(/設定/);
    fireEvent.click(settingsButton);

    // 認証用フィールドを入力
    const accessKeyInput = screen.getByLabelText(/アクセスキーID/);
    const secretKeyInput = screen.getByLabelText(/シークレットアクセスキー/);
    const authButton = screen.getByText(/🧪 AWS認証をテストする/);
    await act(async () => {
      fireEvent.change(accessKeyInput, { target: { value: 'test-access-key' } });
      fireEvent.change(secretKeyInput, { target: { value: 'test-secret-key' } });
    });
    await waitFor(() => expect(authButton).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(authButton);
    });

    // 認証処理が実行されることを確認
    await waitFor(() => {
      expect(TauriCommands.authenticateAws).toHaveBeenCalled();
    }, { timeout: 5000 });

    // 認証成功の表示を待つ
    await waitFor(() => {
      expect(screen.getByText(/✅ 成功/)).toBeInTheDocument();
    }, { timeout: 5000 });

    // すぐにバケット名フィールドを探す
    expect(screen.getByLabelText(/S3バケット名/)).toBeInTheDocument();

    const bucketInput = screen.getByLabelText(/S3バケット名/);
    const testButton = screen.getByText(/アクセスをテスト/);

    await act(async () => {
      fireEvent.change(bucketInput, { target: { value: 'new-test-bucket' } });
      fireEvent.click(testButton);
    });

    await waitFor(() => {
      expect(TauriCommands.testS3BucketAccess).toHaveBeenCalledWith(
        dummyAwsCredentials,
        'new-test-bucket'
      );
    });
  });

  it('should handle bucket access test failure', async () => {
    // 認証が成功した状態をモック
    vi.mocked(TauriCommands.authenticateAws).mockResolvedValue(dummyAuthResult);
    vi.mocked(TauriCommands.testS3BucketAccess).mockRejectedValue(new Error('バケットアクセス失敗'));

    render(
      <ConfigManager
        initialConfig={dummyAppConfig}
        initialState={dummyAppState}
        onConfigChange={mockOnConfigChange}
        onStateChange={mockOnStateChange}
        onAuthSuccess={mockOnAuthSuccess}
        onHealthStatusChange={mockOnHealthStatusChange}
      />
    );

    // 設定タブに切り替え
    const settingsButton = screen.getByText(/設定/);
    fireEvent.click(settingsButton);

    // 認証用フィールドを入力
    const accessKeyInput = screen.getByLabelText(/アクセスキーID/);
    const secretKeyInput = screen.getByLabelText(/シークレットアクセスキー/);
    const authButton = screen.getByText(/🧪 AWS認証をテストする/);
    await act(async () => {
      fireEvent.change(accessKeyInput, { target: { value: 'test-access-key' } });
      fireEvent.change(secretKeyInput, { target: { value: 'test-secret-key' } });
    });
    await waitFor(() => expect(authButton).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(authButton);
    });

    await waitFor(() => {
      expect(TauriCommands.authenticateAws).toHaveBeenCalled();
    }, { timeout: 5000 });

    // 認証成功の表示を待つ
    await waitFor(() => {
      expect(screen.getByText(/✅ 成功/)).toBeInTheDocument();
    }, { timeout: 5000 });

    // すぐにバケット名フィールドを探す
    expect(screen.getByLabelText(/S3バケット名/)).toBeInTheDocument();

    const bucketInput = screen.getByLabelText(/S3バケット名/);
    const testButton = screen.getByText(/アクセスをテスト/);

    await act(async () => {
      fireEvent.change(bucketInput, { target: { value: 'invalid-bucket' } });
      fireEvent.click(testButton);
    });

    await waitFor(() => {
      expect(TauriCommands.testS3BucketAccess).toHaveBeenCalledWith(
        dummyAwsCredentials,
        'invalid-bucket'
      );
    });
  });

  // ===== フォーム検証テスト =====
  it('should handle input changes correctly', async () => {
    render(
      <ConfigManager
        initialConfig={dummyAppConfig}
        initialState={dummyAppState}
        onConfigChange={mockOnConfigChange}
        onStateChange={mockOnStateChange}
        onAuthSuccess={mockOnAuthSuccess}
        onHealthStatusChange={mockOnHealthStatusChange}
      />
    );

    // 設定タブに切り替え
    const settingsButton = screen.getByText(/設定/);
    fireEvent.click(settingsButton);

    await waitFor(() => {
      expect(screen.getByLabelText(/アクセスキーID/)).toBeInTheDocument();
    });

    const accessKeyInput = screen.getByLabelText(/アクセスキーID/);
    const secretKeyInput = screen.getByLabelText(/シークレットアクセスキー/);
    const regionSelect = screen.getByLabelText(/AWSリージョン/);

    await act(async () => {
      fireEvent.change(accessKeyInput, { target: { value: 'new-access-key' } });
      fireEvent.change(secretKeyInput, { target: { value: 'new-secret-key' } });
      fireEvent.change(regionSelect, { target: { value: 'us-west-2' } });
    });

    await waitFor(() => {
      expect(accessKeyInput).toHaveValue('new-access-key');
      expect(secretKeyInput).toHaveValue('new-secret-key');
      expect(regionSelect).toHaveValue('us-west-2');
    });
  });

  it('should disable auth button when credentials are empty', async () => {
    render(
      <ConfigManager
        initialConfig={dummyAppConfig}
        initialState={dummyAppState}
        onConfigChange={mockOnConfigChange}
        onStateChange={mockOnStateChange}
        onAuthSuccess={mockOnAuthSuccess}
        onHealthStatusChange={mockOnHealthStatusChange}
      />
    );

    // 設定タブに切り替え
    const settingsButton = screen.getByText(/設定/);
    fireEvent.click(settingsButton);

    await waitFor(() => {
      expect(screen.getByLabelText(/アクセスキーID/)).toBeInTheDocument();
    });

    const accessKeyInput = screen.getByLabelText(/アクセスキーID/);
    const secretKeyInput = screen.getByLabelText(/シークレットアクセスキー/);
    const authButton = screen.getByText(/🧪 AWS認証をテストする/);

    await act(async () => {
      fireEvent.change(accessKeyInput, { target: { value: '' } });
      fireEvent.change(secretKeyInput, { target: { value: '' } });
    });

    await waitFor(() => {
      expect(authButton).toBeDisabled();
    });
  });

  // ===== エラーハンドリングテスト =====
  it('should handle restore error properly', async () => {
    // 復元エラーをモック
    vi.mocked(TauriCommands.restoreFile).mockRejectedValue(new Error('復元失敗'));

    // S3オブジェクトをモック
    vi.mocked(TauriCommands.listS3Objects).mockResolvedValue(dummyS3Objects);

    render(
      <ConfigManager
        initialConfig={dummyAppConfig}
        initialState={dummyAppState}
        onConfigChange={mockOnConfigChange}
        onStateChange={mockOnStateChange}
        onAuthSuccess={mockOnAuthSuccess}
        onHealthStatusChange={mockOnHealthStatusChange}
      />
    );

    // リストアタブに切り替え
    const restoreButton = screen.getByText(/リストア/);
    fireEvent.click(restoreButton);

    // S3オブジェクト一覧取得ボタンをクリック
    const loadButton = screen.getByRole('button', { name: /S3オブジェクト一覧を取得/ });
    fireEvent.click(loadButton);

    // ファイルが表示されるまで待機
    await waitFor(() => {
      expect(screen.getByText('test-file1.mp4')).toBeInTheDocument();
    });

    // ファイルを選択 - チェックボックスを正しく特定
    const fileRow = screen.getByText('test-file1.mp4').closest('tr');
    const checkbox = fileRow?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).toBeInTheDocument();
    fireEvent.click(checkbox);

    // 復元実行ボタンをクリック
    const restoreButton2 = screen.getByText(/復元実行/);
    fireEvent.click(restoreButton2);

    // エラーメッセージが表示されることを確認
    await waitFor(() => {
      expect(screen.getByText(/復元失敗/)).toBeInTheDocument();
    });
  });
}); 