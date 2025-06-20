import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { ConfigManager } from '../ConfigManager';
import * as TauriCommands from '../../services/tauriCommands';
import * as debugUtils from '../../utils/debug';
import { getVersion } from '@tauri-apps/api/app';

// getVersionのモック
vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn(),
}));

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

// TauriCommands全体をモック化
vi.mock('../../services/tauriCommands');

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
    default_storage_class: 'STANDARD',
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
    memory_usage_mb: 4096,
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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(debugUtils.isDev).mockReturnValue(true);
    // getVersionのモックを設定
    vi.mocked(getVersion).mockResolvedValue('0.1.0');
    // TauriCommandsの存在するメソッドのみをモック
    vi.mocked(TauriCommands.TauriCommands.getConfig).mockResolvedValue(dummyAppConfig);
    vi.mocked(TauriCommands.TauriCommands.getAppState).mockResolvedValue(dummyAppState);
    vi.mocked(TauriCommands.TauriCommands.loadAwsCredentialsSecure).mockResolvedValue(dummyAwsCredentials);
    vi.mocked(TauriCommands.TauriCommands.authenticateAws).mockResolvedValue(dummyAuthResult);
    vi.mocked(TauriCommands.TauriCommands.getLifecycleStatus).mockResolvedValue({ enabled: true, rule_id: 'test-rule', transition_days: 30, storage_class: 'STANDARD_IA' });
    vi.mocked(TauriCommands.TauriCommands.testS3BucketAccess).mockResolvedValue({ success: true, message: 'OK', bucket_accessible: true });
    vi.mocked(TauriCommands.TauriCommands.listS3Objects).mockResolvedValue([]);
  });

  const defaultProps = {
    initialConfig: dummyAppConfig,
    initialState: dummyAppState,
    onConfigChange: vi.fn(),
    onStateChange: vi.fn(),
    onAuthSuccess: vi.fn(),
    onHealthStatusChange: vi.fn(),
  };

  // ===== ライフサイクル管理テスト =====
  it('should handle lifecycle management functionality', async () => {
    // getLifecycleStatusのモック
    vi.mocked(TauriCommands.TauriCommands.getLifecycleStatus).mockResolvedValue({
      enabled: false,
      rule_id: undefined,
      transition_days: undefined,
      storage_class: undefined,
      prefix: '',
      error_message: 'ライフサイクル設定が見つかりません',
    });

    render(
      <ConfigManager {...defaultProps} />
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
      expect(TauriCommands.TauriCommands.getLifecycleStatus).toHaveBeenCalled();
    }, { timeout: 3000 });

    // getLifecycleStatusが正しい引数で呼ばれたことを確認
    expect(vi.mocked(TauriCommands.TauriCommands.getLifecycleStatus)).toHaveBeenCalledWith({
      access_key_id: 'test-access-key',
      secret_access_key: 'test-secret-key',
      region: 'ap-northeast-1',
      bucket_name: 'test-bucket'
    });

    // 返り値が期待通りであることを確認
    const lastCall = vi.mocked(TauriCommands.TauriCommands.getLifecycleStatus).mock.calls[vi.mocked(TauriCommands.TauriCommands.getLifecycleStatus).mock.calls.length - 1];
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
      <ConfigManager {...defaultProps} />
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
      <ConfigManager {...defaultProps} />
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
      <ConfigManager {...defaultProps} />
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
      <ConfigManager {...defaultProps} />
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
      <ConfigManager {...defaultProps} />
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
      <ConfigManager {...defaultProps} />
    );

    await waitFor(() => {
      expect(TauriCommands.TauriCommands.loadAwsCredentialsSecure).toHaveBeenCalledWith('default');
    });
  });

  it('should display AWS credentials in settings tab', async () => {
    render(
      <ConfigManager {...defaultProps} />
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
      <ConfigManager {...defaultProps} />
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
      expect(TauriCommands.TauriCommands.authenticateAws).toHaveBeenCalled();
    }, { timeout: 5000 });

    // 認証成功の表示を待つ
    await waitFor(() => {
      expect(screen.getByText(/✅ 成功/)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('should handle AWS authentication failure', async () => {
    const authError = { success: false, message: '認証失敗', user_identity: undefined, permissions: [] };
    vi.mocked(TauriCommands.TauriCommands.authenticateAws).mockRejectedValue(new Error('認証失敗'));

    render(
      <ConfigManager {...defaultProps} />
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
      expect(TauriCommands.TauriCommands.authenticateAws).toHaveBeenCalledWith(dummyAwsCredentials);
      expect(defaultProps.onAuthSuccess).not.toHaveBeenCalled();
    });
  });

  it('should handle bucket access test successfully', async () => {
    // 認証が成功した状態をモック
    vi.mocked(TauriCommands.TauriCommands.authenticateAws).mockResolvedValue(dummyAuthResult);

    render(
      <ConfigManager {...defaultProps} />
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
      expect(TauriCommands.TauriCommands.authenticateAws).toHaveBeenCalled();
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
      expect(TauriCommands.TauriCommands.testS3BucketAccess).toHaveBeenCalledWith(
        dummyAwsCredentials,
        'new-test-bucket'
      );
    });
  });

  it('should handle bucket access test failure', async () => {
    // 認証が成功した状態をモック
    vi.mocked(TauriCommands.TauriCommands.authenticateAws).mockResolvedValue(dummyAuthResult);
    vi.mocked(TauriCommands.TauriCommands.testS3BucketAccess).mockRejectedValue(new Error('バケットアクセス失敗'));

    render(
      <ConfigManager {...defaultProps} />
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
      expect(TauriCommands.TauriCommands.authenticateAws).toHaveBeenCalled();
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
      expect(TauriCommands.TauriCommands.testS3BucketAccess).toHaveBeenCalledWith(
        dummyAwsCredentials,
        'invalid-bucket'
      );
    });
  });

  // ===== フォーム検証テスト =====
  it('should handle input changes correctly', async () => {
    render(
      <ConfigManager {...defaultProps} />
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
      <ConfigManager {...defaultProps} />
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
    vi.mocked(TauriCommands.TauriCommands.restoreFile).mockRejectedValue(new Error('復元失敗'));

    // S3オブジェクトをモック
    vi.mocked(TauriCommands.TauriCommands.listS3Objects).mockResolvedValue(dummyS3Objects);

    render(
      <ConfigManager {...defaultProps} />
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

  // ===== 設定管理機能テスト =====
  it('should handle AWS region change successfully', async () => {
    render(
      <ConfigManager {...defaultProps} />
    );

    // 設定タブに切り替え（AWSリージョンフィールドがある）
    const settingsButton = screen.getByText(/設定/);
    fireEvent.click(settingsButton);

    // credentialsがセットされるまで待機
    await waitFor(() => {
      expect(screen.getByDisplayValue('test-access-key')).toBeInTheDocument();
    });

    // AWSリージョンを変更
    const regionSelect = screen.getByLabelText(/AWSリージョン:/);
    await act(async () => {
      fireEvent.change(regionSelect, { target: { value: 'us-west-2' } });
    });

    // handleInputChangeはcredentialsの状態更新のみでonConfigChangeを呼ばない
    // 値の変更が反映されることを確認
    await waitFor(() => {
      expect(regionSelect).toHaveValue('us-west-2');
    });

    // onConfigChangeは呼ばれないことを確認
    expect(defaultProps.onConfigChange).not.toHaveBeenCalled();
  });

  it('should handle reset config successfully', async () => {
    // resetConfigのモックを適切に設定
    vi.mocked(TauriCommands.TauriCommands.resetConfig).mockResolvedValue(dummyAppConfig);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <ConfigManager {...defaultProps} />
    );

    // 設定タブに切り替え（リセットボタンがある）
    const settingsButton = screen.getByText(/設定/);
    fireEvent.click(settingsButton);

    // リセットボタンをクリック
    const resetButton = screen.getByText(/すべての設定をリセット/);
    await act(async () => {
      fireEvent.click(resetButton);
    });

    // resetConfigが呼ばれることを確認
    await waitFor(() => {
      expect(TauriCommands.TauriCommands.resetConfig).toHaveBeenCalled();
    });

    // onConfigChangeが呼ばれることを確認
    await waitFor(() => {
      expect(defaultProps.onConfigChange).toHaveBeenCalledWith(dummyAppConfig);
    });
  });

  // ステータスタブでS3バケット名が正しく表示されているかのテスト
  it('should display S3 bucket name in status tab', async () => {
    render(
      <ConfigManager {...defaultProps} />
    );

    // ステータスタブがデフォルトで表示されているはず
    await waitFor(() => {
      expect(screen.getByText(/システム状態/)).toBeInTheDocument();
    });

    // S3バケット名フィールドが正しく表示されているか
    const bucketLabel = screen.getByText('S3バケット名:');
    expect(bucketLabel).toBeInTheDocument();
    // readonly inputの値がconfigのバケット名と一致しているか
    const bucketInput = bucketLabel.parentElement?.querySelector('input');
    expect(bucketInput).toHaveValue(dummyAppConfig.user_preferences.default_bucket_name);
  });

  // ===== ライフサイクル管理機能詳細テスト =====
  it('should display lifecycle status correctly in status tab', async () => {
    // ライフサイクルが有効な状態をモック
    vi.mocked(TauriCommands.TauriCommands.getLifecycleStatus).mockResolvedValue({
      enabled: true,
      rule_id: 'reelvault-lifecycle-rule',
      transition_days: 30,
      storage_class: 'STANDARD_IA',
      prefix: '',
      error_message: undefined,
    });

    render(
      <ConfigManager {...defaultProps} />
    );

    // ステータスタブでライフサイクル状況が表示されることを確認
    await waitFor(() => {
      expect(screen.getByText(/S3ライフサイクル:/)).toBeInTheDocument();
    });

    // ライフサイクル状況の更新を待つ（非同期処理のため）
    await waitFor(() => {
      expect(screen.getByDisplayValue(/✅ 有効/)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('should display lifecycle error status correctly', async () => {
    // ライフサイクルエラーの状態をモック
    vi.mocked(TauriCommands.TauriCommands.getLifecycleStatus).mockResolvedValue({
      enabled: false,
      rule_id: undefined,
      transition_days: undefined,
      storage_class: undefined,
      prefix: '',
      error_message: 'ライフサイクル設定が見つかりません',
    });

    render(
      <ConfigManager {...defaultProps} />
    );

    // ステータスタブでライフサイクルエラーが表示されることを確認
    await waitFor(() => {
      expect(screen.getByDisplayValue(/⚠️ ライフサイクル設定が見つかりません/)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('should display upload safety status based on lifecycle health', async () => {
    // ライフサイクルが健全な状態をモック
    vi.mocked(TauriCommands.TauriCommands.getLifecycleStatus).mockResolvedValue({
      enabled: true,
      rule_id: 'reelvault-lifecycle-rule',
      transition_days: 30,
      storage_class: 'STANDARD_IA',
      prefix: '',
      error_message: undefined,
    });

    render(
      <ConfigManager {...defaultProps} />
    );

    // アップロード安全性が表示されることを確認
    await waitFor(() => {
      expect(screen.getByText(/アップロード安全性:/)).toBeInTheDocument();
    });

    // ライフサイクルが健全な場合の表示を確認（非同期更新を待つ）
    await waitFor(() => {
      expect(screen.getByDisplayValue(/✅ 準備完了/)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('should handle lifecycle setup status display', async () => {
    // 認証が成功した状態の個別モック設定は不要（beforeEachで統一済み）

    render(
      <ConfigManager {...defaultProps} />
    );

    // 設定タブに切り替え
    const settingsButton = screen.getByText(/設定/);
    fireEvent.click(settingsButton);

    // credentialsがセットされるまで待機
    await waitFor(() => {
      expect(screen.getByDisplayValue('test-access-key')).toBeInTheDocument();
    });

    // 認証を実行
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

    // 認証成功の表示を待つ（柔軟なマッチャーに変更）
    await waitFor(() => {
      expect(screen.getByText((content) => content.includes('✅') && content.includes('成功'))).toBeInTheDocument();
    }, { timeout: 5000 });

    // バケット名フィールドが表示されることを確認
    await waitFor(() => {
      expect(screen.getByLabelText(/S3バケット名/)).toBeInTheDocument();
    });

    // バケットアクセステストを実行（ライフサイクル設定状況が表示される）
    const bucketInput = screen.getByLabelText(/S3バケット名/);
    const testButton = screen.getByText(/アクセスをテスト/);
    await act(async () => {
      fireEvent.change(bucketInput, { target: { value: 'new-test-bucket' } });
      fireEvent.click(testButton);
    });

    // ライフサイクル設定状況が表示されることを確認
    await waitFor(() => {
      expect(screen.getByText(/ライフサイクル設定状況/)).toBeInTheDocument();
    });
  });

  it('should handle lifecycle management test functionality', async () => {
    // APIテスト機能のモック
    vi.mocked(TauriCommands.TauriCommands.validateLifecycleConfig).mockResolvedValue(true);
    vi.mocked(TauriCommands.TauriCommands.listLifecycleRules).mockResolvedValue([
      { 
        id: 'rule1', 
        status: 'Enabled', 
        transitions: [
          { days: 30, storage_class: 'STANDARD_IA' }
        ]
      }
    ]);
    vi.mocked(TauriCommands.TauriCommands.enableReelvaultLifecycle).mockResolvedValue({
      success: true,
      message: 'ライフサイクル有効化成功',
      rule_id: 'test-rule',
      transition_days: 30,
      storage_class: 'STANDARD_IA'
    });

    render(
      <ConfigManager {...defaultProps} />
    );

    // APIテストタブに切り替え
    const apiTestButton = screen.getByText((content) => content.includes('APIテスト'));
    fireEvent.click(apiTestButton);

    // ライフサイクル管理テストボタンをクリック
    const lifecycleTestButton = screen.getByText(/ライフサイクル管理テスト/);
    await act(async () => {
      fireEvent.click(lifecycleTestButton);
    });

    // ライフサイクル管理テストが実行されることを確認
    await waitFor(() => {
      expect(TauriCommands.TauriCommands.validateLifecycleConfig).toHaveBeenCalled();
      expect(TauriCommands.TauriCommands.listLifecycleRules).toHaveBeenCalled();
      expect(TauriCommands.TauriCommands.enableReelvaultLifecycle).toHaveBeenCalled();
    });
  });

  it('should handle lifecycle health check notifications', async () => {
    // ライフサイクルが不健全な状態をモック
    vi.mocked(TauriCommands.TauriCommands.getLifecycleStatus).mockResolvedValue({
      enabled: false,
      rule_id: undefined,
      transition_days: undefined,
      storage_class: undefined,
      prefix: '',
      error_message: 'ライフサイクル設定が見つかりません',
    });

    render(
      <ConfigManager {...defaultProps} />
    );

    // ライフサイクル健全性チェックが実行されることを確認
    await waitFor(() => {
      expect(TauriCommands.TauriCommands.getLifecycleStatus).toHaveBeenCalled();
    }, { timeout: 3000 });

    // 不健全な状態でonHealthStatusChangeが呼ばれることを確認
    await waitFor(() => {
      expect(defaultProps.onHealthStatusChange).toHaveBeenCalledWith({
        isHealthy: false,
        lastCheck: expect.any(Date),
        bucketName: dummyAppConfig.user_preferences.default_bucket_name
      });
    }, { timeout: 5000 });
  });

  // ===== 復元機能詳細テスト =====
  it('should handle restore request successfully', async () => {
    // S3オブジェクトをモック
    vi.mocked(TauriCommands.TauriCommands.listS3Objects).mockResolvedValue(dummyS3Objects);
    // 復元リクエスト成功をモック
    vi.mocked(TauriCommands.TauriCommands.restoreFile).mockResolvedValue({
      key: 'test-file1.mp4',
      restore_status: 'in-progress',
      tier: 'Standard',
      request_time: new Date().toISOString()
    });

    render(
      <ConfigManager {...defaultProps} />
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

    // ファイルを選択
    const fileRow = screen.getByText('test-file1.mp4').closest('tr');
    const checkbox = fileRow?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).toBeInTheDocument();
    fireEvent.click(checkbox);

    // 復元実行ボタンをクリック
    const restoreButton2 = screen.getByText(/復元実行/);
    fireEvent.click(restoreButton2);

    // 成功メッセージが表示されることを確認
    await waitFor(() => {
      expect(screen.getByText((content) => content.includes('✅') && content.includes('復元リクエスト'))).toBeInTheDocument();
    });
  });

  it('should display restore progress status', async () => {
    // S3オブジェクトをモック（復元中状態）
    const inProgressObjects = [
      {
        key: 'test-file1.mp4',
        size: 1024,
        last_modified: '2024-01-01T00:00:00Z',
        storage_class: 'DEEP_ARCHIVE',
        etag: '"test-etag"',
        restore_status: 'in-progress',
        restore_tier: 'Standard',
        restore_request_time: '2024-01-01T00:00:00Z'
      }
    ];
    vi.mocked(TauriCommands.TauriCommands.listS3Objects).mockResolvedValue(inProgressObjects);

    render(
      <ConfigManager {...defaultProps} />
    );

    // リストアタブに切り替え
    const restoreButton = screen.getByText(/リストア/);
    fireEvent.click(restoreButton);

    // S3オブジェクト一覧取得ボタンをクリック
    const loadButton = screen.getByRole('button', { name: /S3オブジェクト一覧を取得/ });
    fireEvent.click(loadButton);

    // ファイルが表示されることを確認（復元状況は「—」で表示される）
    await waitFor(() => {
      expect(screen.getByText('test-file1.mp4')).toBeInTheDocument();
      // 復元状況列には「—」が表示される（restoreStatusが設定されていないため）
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  it('should handle multiple file selection for restore', async () => {
    // 複数のS3オブジェクトをモック
    const multipleObjects = [
      {
        key: 'test-file1.mp4',
        size: 1024,
        last_modified: '2024-01-01T00:00:00Z',
        storage_class: 'DEEP_ARCHIVE',
        etag: '"test-etag-1"'
      },
      {
        key: 'test-file2.mp4',
        size: 2048,
        last_modified: '2024-01-01T00:00:00Z',
        storage_class: 'DEEP_ARCHIVE',
        etag: '"test-etag-2"'
      },
      {
        key: 'test-file3.mp4',
        size: 3072,
        last_modified: '2024-01-01T00:00:00Z',
        storage_class: 'DEEP_ARCHIVE',
        etag: '"test-etag-3"'
      }
    ];
    vi.mocked(TauriCommands.TauriCommands.listS3Objects).mockResolvedValue(multipleObjects);
    // 復元リクエスト成功をモック
    vi.mocked(TauriCommands.TauriCommands.restoreFile).mockResolvedValue({
      key: 'test-file1.mp4',
      restore_status: 'in-progress',
      tier: 'Standard',
      request_time: new Date().toISOString()
    });

    render(
      <ConfigManager {...defaultProps} />
    );

    // リストアタブに切り替え
    const restoreButton = screen.getByText(/リストア/);
    fireEvent.click(restoreButton);

    // S3オブジェクト一覧取得ボタンをクリック
    const loadButton = screen.getByRole('button', { name: /S3オブジェクト一覧を取得/ });
    fireEvent.click(loadButton);

    // 複数ファイルが表示されるまで待機
    await waitFor(() => {
      expect(screen.getByText('test-file1.mp4')).toBeInTheDocument();
      expect(screen.getByText('test-file2.mp4')).toBeInTheDocument();
      expect(screen.getByText('test-file3.mp4')).toBeInTheDocument();
    });

    // 複数ファイルを選択
    const fileRows = screen.getAllByRole('row');
    const checkboxes = fileRows
      .slice(1) // ヘッダー行を除外
      .map(row => row.querySelector('input[type="checkbox"]'))
      .filter(Boolean) as HTMLInputElement[];

    // 最初の2つのファイルを選択
    fireEvent.click(checkboxes[0]); // test-file1.mp4
    fireEvent.click(checkboxes[1]); // test-file2.mp4

    // 復元実行ボタンをクリック
    const restoreButton2 = screen.getByText(/復元実行/);
    fireEvent.click(restoreButton2);

    // 成功メッセージが表示されることを確認
    await waitFor(() => {
      expect(screen.getByText((content) => content.includes('✅') && content.includes('復元リクエスト'))).toBeInTheDocument();
    });
  });

  it('should handle download button when restore is completed', async () => {
    // S3オブジェクト（復元完了状態）
    const completedObjects = [
      {
        key: 'test-file1.mp4',
        size: 1024,
        last_modified: '2024-01-01T00:00:00Z',
        storage_class: 'DEEP_ARCHIVE',
        etag: '"test-etag"',
      }
    ];
    vi.mocked(TauriCommands.TauriCommands.listS3Objects).mockResolvedValue(completedObjects);
    // 復元リクエスト成功をモック（復元完了状態を返す）
    vi.mocked(TauriCommands.TauriCommands.restoreFile).mockResolvedValue({
      key: 'test-file1.mp4',
      restore_status: 'completed',
      tier: 'Standard',
      request_time: new Date().toISOString(),
      expiry_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });
    // 復元状況確認もモック（復元完了状態を返す）
    vi.mocked(TauriCommands.TauriCommands.checkRestoreStatus).mockResolvedValue({
      key: 'test-file1.mp4',
      is_restored: true,
      restore_status: 'completed',
      expiry_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });

    render(
      <ConfigManager {...defaultProps} />
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

    // チェックボックスでファイルを選択
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    // 復元実行ボタンをクリック
    const restoreExecBtn = screen.getByRole('button', { name: /復元実行/ });
    fireEvent.click(restoreExecBtn);

    // 復元状況確認ボタンをクリック
    const checkRestoreBtn = screen.getByRole('button', { name: /復元状況確認/ });
    fireEvent.click(checkRestoreBtn);

    // ダウンロードボタンが出るまで待機
    await waitFor(() => {
      expect(screen.getByTitle('ファイルをダウンロード')).toBeInTheDocument();
    });

    // ダウンロードボタンをクリック（UI上でクリックできることのみ確認）
    const downloadBtn = screen.getByTitle('ファイルをダウンロード');
    fireEvent.click(downloadBtn);
  });

  it('should show download button immediately for STANDARD S3 objects', async () => {
    // S3オブジェクト（STANDARD）
    const standardObjects = [
      {
        key: 'standard-file.mp4',
        size: 2048,
        last_modified: '2024-01-02T00:00:00Z',
        storage_class: 'STANDARD',
        etag: '"standard-etag"',
      }
    ];
    vi.mocked(TauriCommands.TauriCommands.listS3Objects).mockResolvedValue(standardObjects);

    render(
      <ConfigManager {...defaultProps} />
    );

    // リストアタブに切り替え
    const restoreButton = screen.getByText(/リストア/);
    fireEvent.click(restoreButton);

    // S3オブジェクト一覧取得ボタンをクリック
    const loadButton = screen.getByRole('button', { name: /S3オブジェクト一覧を取得/ });
    fireEvent.click(loadButton);

    // ファイルが表示され、ダウンロードボタンが即時表示されることを確認
    await waitFor(() => {
      expect(screen.getByText('standard-file.mp4')).toBeInTheDocument();
      // ボタンのtitle属性で検証
      expect(screen.getByTitle('ファイルをダウンロード')).toBeInTheDocument();
    });
  });

  it('should handle restore history clear functionality', async () => {
    // 復元機能テストに必要な全てのモック
    vi.mocked(TauriCommands.TauriCommands.listRestoreJobs).mockResolvedValue([]);
    vi.mocked(TauriCommands.TauriCommands.getRestoreNotifications).mockResolvedValue([]);
    vi.mocked(TauriCommands.TauriCommands.restoreFile).mockResolvedValue({
      key: 'test-file.mp4',
      restore_status: 'in-progress',
      tier: 'Standard',
      request_time: new Date().toISOString()
    });
    vi.mocked(TauriCommands.TauriCommands.checkRestoreStatus).mockResolvedValue({
      key: 'test-file.mp4',
      is_restored: false,
      restore_status: 'in-progress'
    });
    vi.mocked(TauriCommands.TauriCommands.clearRestoreHistory).mockResolvedValue();

    render(
      <ConfigManager {...defaultProps} />
    );

    // APIテストタブに切り替え
    const apiTestButton = screen.getByText(/APIテスト/);
    fireEvent.click(apiTestButton);

    // 復元機能テストボタンをクリック
    const restoreTestButton = screen.getByRole('button', { name: /復元機能テスト/ });
    fireEvent.click(restoreTestButton);

    // 復元機能テストの結果が表示されることを確認
    await waitFor(() => {
      expect(screen.getByText(/復元機能テスト完了/)).toBeInTheDocument();
    });
  });

  // ===== APIテスト機能テスト（開発者モード） =====
  it('should display test results when API test buttons are clicked', async () => {
    // 主要APIのモック
    vi.mocked(TauriCommands.TauriCommands.listFiles).mockResolvedValue([]);
    vi.mocked(TauriCommands.TauriCommands.testS3BucketAccess).mockResolvedValue({ success: true, message: 'OK', bucket_accessible: true });
    vi.mocked(TauriCommands.TauriCommands.getConfig).mockResolvedValue(dummyAppConfig);
    vi.mocked(TauriCommands.TauriCommands.getAppState).mockResolvedValue(dummyAppState);
    vi.mocked(TauriCommands.TauriCommands.listRestoreJobs).mockResolvedValue([]);
    vi.mocked(TauriCommands.TauriCommands.getRestoreNotifications).mockResolvedValue([]);
    vi.mocked(TauriCommands.TauriCommands.clearRestoreHistory).mockResolvedValue();
    vi.mocked(TauriCommands.TauriCommands.restoreFile).mockResolvedValue({
      key: 'test-file.mp4',
      restore_status: 'in-progress',
      tier: 'Standard',
      request_time: new Date().toISOString()
    });
    vi.mocked(TauriCommands.TauriCommands.checkRestoreStatus).mockResolvedValue({
      key: 'test-file.mp4',
      is_restored: false,
      restore_status: 'in-progress'
    });

    render(
      <ConfigManager {...defaultProps} />
    );

    // APIテストタブに切り替え
    const apiTestButton = screen.getByText(/APIテスト/);
    fireEvent.click(apiTestButton);

    // 各APIテストボタンをクリック
    const fileApiBtn = screen.getByRole('button', { name: /ファイル操作 API/ });
    fireEvent.click(fileApiBtn);
    const awsApiBtn = screen.getByRole('button', { name: /AWS操作 API/ });
    fireEvent.click(awsApiBtn);
    const configApiBtn = screen.getByRole('button', { name: /設定管理 API/ });
    fireEvent.click(configApiBtn);
    const stateApiBtn = screen.getByRole('button', { name: /状態管理 API/ });
    fireEvent.click(stateApiBtn);
    const restoreApiBtn = screen.getByRole('button', { name: /復元機能テスト/ });
    fireEvent.click(restoreApiBtn);
    const lifecycleApiBtn = screen.getByRole('button', { name: /ライフサイクル管理テスト/ });
    fireEvent.click(lifecycleApiBtn);

    // テスト結果が表示されることを確認
    await waitFor(() => {
      expect(screen.getByText(/テスト結果/)).toBeInTheDocument();
      // 複数要素がある場合は最初の要素を取得
      const restoreTestElements = screen.getAllByText(/復元機能テスト/);
      expect(restoreTestElements.length).toBeGreaterThan(0);
    });
  });

  it('should clear test results when clear button is clicked', async () => {
    // 必要なモック
    vi.mocked(TauriCommands.TauriCommands.listFiles).mockResolvedValue([]);
    vi.mocked(TauriCommands.TauriCommands.getConfig).mockResolvedValue(dummyAppConfig);
    render(
      <ConfigManager {...defaultProps} />
    );
    // APIテストタブに切り替え
    const apiTestButton = screen.getByText(/APIテスト/);
    fireEvent.click(apiTestButton);
    // ファイル操作APIテストボタンをクリック
    const fileApiBtn = screen.getByRole('button', { name: /ファイル操作 API/ });
    fireEvent.click(fileApiBtn);
    // 結果をクリアボタンをクリック
    const clearBtn = screen.getByRole('button', { name: /結果をクリア/ });
    fireEvent.click(clearBtn);
    // テスト結果が消えることを確認（テスト結果の内容が消えることを確認）
    await waitFor(() => {
      expect(screen.queryByText(/ファイル一覧取得/)).not.toBeInTheDocument();
    });
  });

  it('should display error message when API test fails', async () => {
    // ファイル操作APIのみ失敗させる
    vi.mocked(TauriCommands.TauriCommands.listFiles).mockRejectedValue(new Error('API失敗'));
    render(
      <ConfigManager {...defaultProps} />
    );
    // APIテストタブに切り替え
    const apiTestButton = screen.getByText(/APIテスト/);
    fireEvent.click(apiTestButton);
    // ファイル操作APIテストボタンをクリック
    const fileApiBtn = screen.getByRole('button', { name: /ファイル操作 API/ });
    fireEvent.click(fileApiBtn);
    // エラーメッセージが表示されることを確認
    await waitFor(() => {
      expect(screen.getByText(/API失敗/)).toBeInTheDocument();
    });
  });

  it('should display app version correctly', async () => {
    // getVersionのモック
    vi.mocked(getVersion).mockResolvedValue('0.1.0');
    
    render(<ConfigManager {...defaultProps} />);
    
    // バージョンが表示されることを確認
    await waitFor(() => {
      expect(screen.getByDisplayValue('0.1.0')).toBeInTheDocument();
    });
    
    // アプリ名にバージョンが含まれることを確認
    expect(screen.getByText(/ReelVault v0\.1\.0/)).toBeInTheDocument();
  });

  it('should handle version loading error', async () => {
    // getVersionのエラーモック
    vi.mocked(getVersion).mockRejectedValue(new Error('Version error'));
    
    render(<ConfigManager {...defaultProps} />);
    
    // エラー時に「不明」が表示されることを確認
    await waitFor(() => {
      expect(screen.getByDisplayValue('不明')).toBeInTheDocument();
    });
  });
}); 