import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ConfigManager } from '../ConfigManager';
import { TauriCommands } from '../../services/tauriCommands';

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
    getLifecycleStatus: vi.fn(),
    listS3Objects: vi.fn().mockResolvedValue([]),
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

describe('ConfigManager', () => {
  const mockOnConfigChange = vi.fn();
  const mockOnStateChange = vi.fn();
  const mockOnAuthSuccess = vi.fn();
  const mockOnHealthStatusChange = vi.fn();

  beforeEach(() => {
    // すべてのモックをクリア
    vi.clearAllMocks();
    
    // デフォルトのモック戻り値を設定
    vi.mocked(TauriCommands.getConfig).mockResolvedValue(dummyAppConfig);
    vi.mocked(TauriCommands.getAppState).mockResolvedValue(dummyAppState);
    vi.mocked(TauriCommands.loadAwsCredentialsSecure).mockResolvedValue(dummyAwsCredentials);
    vi.mocked(TauriCommands.getLifecycleStatus).mockResolvedValue({
      enabled: true,
      rule_id: 'test-rule',
      transition_days: 30,
      storage_class: 'STANDARD_IA',
      prefix: '',
      error_message: undefined,
    });
  });

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
      expect(screen.getByText(/APIテスト/)).toBeInTheDocument();
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
      expect(screen.getByRole('combobox', { name: /AWSリージョン/ })).toHaveValue('ap-northeast-1');
    });
  });

  it('should switch to restore tab and show S3 object list button', async () => {
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
      // ボタンとして「S3オブジェクト一覧を取得」が存在することを確認
      expect(screen.getByRole('button', { name: /S3オブジェクト一覧を取得/ })).toBeInTheDocument();
    });
  });
}); 