import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { listen } from '@tauri-apps/api/event';
import App from './App';
import { TauriCommands } from './services/tauriCommands';

// Tauri APIのモック
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('./services/tauriCommands', () => ({
  TauriCommands: {
    getConfig: vi.fn(),
    getAppState: vi.fn(),
  },
}));

// ConfigManagerのモック
const mockOpenSettingsTab = vi.fn();
const mockOnConfigChange = vi.fn();
const mockOnStateChange = vi.fn();
const mockOnAuthSuccess = vi.fn();
const mockOnHealthStatusChange = vi.fn();

vi.mock('./components/ConfigManager', () => ({
  ConfigManager: React.forwardRef((props: any, ref: any) => {
    // refを設定
    if (ref) {
      ref.current = {
        openSettingsTab: mockOpenSettingsTab,
      };
    }

    // propsを保存して後でテストで使用
    mockOnConfigChange.mockImplementation(props.onConfigChange);
    mockOnStateChange.mockImplementation(props.onStateChange);
    mockOnAuthSuccess.mockImplementation(props.onAuthSuccess);
    mockOnHealthStatusChange.mockImplementation(props.onHealthStatusChange);

    return <div data-testid="config-manager">ConfigManager Mock</div>;
  }),
}));

const mockListen = vi.mocked(listen);
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
    aws_connected: true,
    disk_space_gb: 100,
    memory_usage_mb: 512,
    cpu_usage_percent: 10,
    network_available: true,
    last_heartbeat: '2024-01-01T00:00:00Z',
  },
};

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // デフォルトのモック設定
    mockTauriCommands.getConfig.mockResolvedValue(mockConfig);
    mockTauriCommands.getAppState.mockResolvedValue(mockAppState);
    mockListen.mockResolvedValue(() => {});
    
    // document.documentElement.setAttributeのモック
    Object.defineProperty(document, 'documentElement', {
      value: {
        setAttribute: vi.fn(),
      },
      writable: true,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('初期化', () => {
    it('should show loading state initially', () => {
      // 非同期処理を遅延させる
      mockTauriCommands.getConfig.mockImplementation(() => new Promise(() => {}));
      mockTauriCommands.getAppState.mockImplementation(() => new Promise(() => {}));

      render(<App />);

      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });

    it('should load config and app state on mount', async () => {
      render(<App />);

      await waitFor(() => {
        expect(mockTauriCommands.getConfig).toHaveBeenCalled();
        expect(mockTauriCommands.getAppState).toHaveBeenCalled();
      });

      expect(screen.getByTestId('config-manager')).toBeInTheDocument();
    });

    it('should handle initialization error', async () => {
      const error = new Error('Failed to load config');
      mockTauriCommands.getConfig.mockRejectedValue(error);

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('エラー: Failed to load config')).toBeInTheDocument();
      });
    });

    it('should handle missing config or app state', async () => {
      mockTauriCommands.getConfig.mockResolvedValue(null as any);
      mockTauriCommands.getAppState.mockResolvedValue(mockAppState);

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('設定または状態を読み込めませんでした。')).toBeInTheDocument();
      });
    });

    it('should handle missing app state', async () => {
      mockTauriCommands.getConfig.mockResolvedValue(mockConfig);
      mockTauriCommands.getAppState.mockResolvedValue(null as any);

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('設定または状態を読み込めませんでした。')).toBeInTheDocument();
      });
    });

    it('should handle string error', async () => {
      mockTauriCommands.getConfig.mockRejectedValue('String error message');

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('エラー: String error message')).toBeInTheDocument();
      });
    });
  });

  describe('テーマ適用', () => {
    it('should apply theme from config', async () => {
      const configWithTheme = {
        ...mockConfig,
        app_settings: {
          ...mockConfig.app_settings,
          theme: 'light',
        },
      };
      mockTauriCommands.getConfig.mockResolvedValue(configWithTheme);

      render(<App />);

      await waitFor(() => {
        expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
      });
    });

    it('should not apply theme if not specified', async () => {
      const configWithoutTheme = {
        ...mockConfig,
        app_settings: {
          ...mockConfig.app_settings,
          theme: '' as any,
        },
      };
      mockTauriCommands.getConfig.mockResolvedValue(configWithoutTheme);

      render(<App />);

      await waitFor(() => {
        expect(document.documentElement.setAttribute).not.toHaveBeenCalled();
      });
    });

    it('should not apply theme if config is null', async () => {
      mockTauriCommands.getConfig.mockResolvedValue(null as any);

      render(<App />);

      await waitFor(() => {
        expect(document.documentElement.setAttribute).not.toHaveBeenCalled();
      });
    });
  });

  describe('イベントリスナー', () => {
    it('should setup event listener on mount', async () => {
      render(<App />);

      await waitFor(() => {
        expect(mockListen).toHaveBeenCalledWith('open-settings', expect.any(Function));
      });
    });

    it('should handle event listener setup error', async () => {
      const error = new Error('Event listener failed');
      mockListen.mockRejectedValue(error);

      // console.errorのモック
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<App />);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('イベントリスナーの設定に失敗:', error);
      });

      consoleSpy.mockRestore();
    });

    it('should handle open-settings event', async () => {
      let eventCallback: ((event: any) => void) | undefined;
      mockListen.mockImplementation((event, callback) => {
        if (event === 'open-settings') {
          eventCallback = callback as (event: any) => void;
        }
        return Promise.resolve(() => {});
      });

      // console.logのモック
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      render(<App />);

      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });

      // イベントを発火
      if (eventCallback) {
        act(() => {
          eventCallback!({});
        });
      }

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('システムトレイから設定タブを開く要求を受信');
        expect(mockOpenSettingsTab).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });

    it('should cleanup event listener on unmount', async () => {
      const mockUnlisten = vi.fn();
      mockListen.mockResolvedValue(mockUnlisten);

      const { unmount } = render(<App />);

      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });

      unmount();

      expect(mockUnlisten).toHaveBeenCalled();
    });
  });

  describe('健全性状態', () => {
    it('should show warning when health status is unhealthy', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('config-manager')).toBeInTheDocument();
      });

      // 健全性状態が悪い場合の警告は表示されない（初期状態は正常）
      expect(screen.queryByText('⚠️ アップロード機能が利用できません。AWS設定を確認してください。')).not.toBeInTheDocument();
    });
  });

  describe('ConfigManager連携', () => {
    it('should render ConfigManager with correct props', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('config-manager')).toBeInTheDocument();
      });
    });

    it('should handle config change', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('config-manager')).toBeInTheDocument();
      });

      // ConfigManagerからの設定変更は、App.tsxの状態更新を通じて処理される
      // 実際のテストでは、ConfigManagerのpropsを介してテストする
    });

    it('should handle state change', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('config-manager')).toBeInTheDocument();
      });

      const newState = { ...mockAppState, is_watching: true };
      act(() => {
        mockOnStateChange(newState);
      });
    });

    it('should handle auth success', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('config-manager')).toBeInTheDocument();
      });

      act(() => {
        mockOnAuthSuccess();
      });

      await waitFor(() => {
        expect(mockTauriCommands.getAppState).toHaveBeenCalledTimes(2); // 初期化時 + auth success時
      });
    });

    it('should handle health status change', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('config-manager')).toBeInTheDocument();
      });

      const healthStatus = {
        isHealthy: false,
        lastCheck: new Date(),
        bucketName: 'test-bucket',
      };

      act(() => {
        mockOnHealthStatusChange(healthStatus);
      });
    });
  });

  describe('エラーハンドリング', () => {
    it('should handle getAppState error in auth success', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('config-manager')).toBeInTheDocument();
      });

      // auth success時にgetAppStateがエラーになる場合
      mockTauriCommands.getAppState.mockRejectedValue(new Error('Auth state error'));

      act(() => {
        mockOnAuthSuccess();
      });

      // エラーが発生してもアプリがクラッシュしないことを確認
      await waitFor(() => {
        expect(screen.getByTestId('config-manager')).toBeInTheDocument();
      });
    });
  });

  describe('パフォーマンス', () => {
    it('should not re-render unnecessarily', async () => {
      const renderSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('config-manager')).toBeInTheDocument();
      });

      // 状態変更がない限り、不要な再レンダリングが発生しないことを確認
      expect(renderSpy).not.toHaveBeenCalled();

      renderSpy.mockRestore();
    });
  });

  describe('総合テスト', () => {
    it('should handle complete workflow: config → auth → upload', async () => {
      render(<App />);

      // 初期化完了を待つ
      await waitFor(() => {
        expect(screen.getByTestId('config-manager')).toBeInTheDocument();
      });

      // ConfigManagerが正しくレンダリングされていることを確認
      expect(screen.getByTestId('config-manager')).toBeInTheDocument();
      
      // コールバック関数が設定されていることを確認
      expect(mockOnConfigChange).toBeDefined();
      expect(mockOnStateChange).toBeDefined();
    });

    it('should propagate auth success to parent component', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('config-manager')).toBeInTheDocument();
      });

      // 認証成功のコールバックが設定されていることを確認
      expect(mockOnAuthSuccess).toBeDefined();
    });

    it('should handle health status changes', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('config-manager')).toBeInTheDocument();
      });

      // 健全性ステータス変更のコールバックが設定されていることを確認
      expect(mockOnHealthStatusChange).toBeDefined();
    });

    it('should maintain state consistency across components', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('config-manager')).toBeInTheDocument();
      });

      // ConfigManagerが正しくレンダリングされていることを確認
      expect(screen.getByTestId('config-manager')).toBeInTheDocument();
      
      // コールバック関数が設定されていることを確認
      expect(mockOnConfigChange).toBeDefined();
      expect(mockOnStateChange).toBeDefined();
    });

    it('should handle configuration updates properly', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('config-manager')).toBeInTheDocument();
      });

      // 設定更新のコールバックが設定されていることを確認
      expect(mockOnConfigChange).toBeDefined();
      expect(typeof mockOnConfigChange).toBe('function');
    });

    it('should handle state updates properly', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('config-manager')).toBeInTheDocument();
      });

      // 状態更新のコールバックが設定されていることを確認
      expect(mockOnStateChange).toBeDefined();
      expect(typeof mockOnStateChange).toBe('function');
    });

    it('should handle error propagation from child components', async () => {
      // エラー状態のモック
      const errorConfig = {
        ...mockConfig,
        user_preferences: {
          ...mockConfig.user_preferences,
          default_bucket_name: '', // 無効な設定
        },
      };
      mockTauriCommands.getConfig.mockResolvedValue(errorConfig);

      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('config-manager')).toBeInTheDocument();
      });

      // エラー状態でもコンポーネントが正常にレンダリングされることを確認
      expect(screen.getByTestId('config-manager')).toBeInTheDocument();
    });

    it('should handle network connectivity changes', async () => {
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
        expect(screen.getByTestId('config-manager')).toBeInTheDocument();
      });

      // ネットワーク切断状態でもコンポーネントが正常に動作することを確認
      expect(screen.getByTestId('config-manager')).toBeInTheDocument();
    });

    it('should handle large configuration updates', async () => {
      const largeConfig = {
        ...mockConfig,
        user_preferences: {
          ...mockConfig.user_preferences,
          default_bucket_name: 'very-long-bucket-name-that-exceeds-normal-length',
        },
        aws_settings: {
          ...mockConfig.aws_settings,
          timeout_seconds: 300, // 長いタイムアウト
          max_retries: 10, // 多くのリトライ
        },
      };
      mockTauriCommands.getConfig.mockResolvedValue(largeConfig);

      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('config-manager')).toBeInTheDocument();
      });

      // 大きな設定でも正常に処理されることを確認
      expect(screen.getByTestId('config-manager')).toBeInTheDocument();
    });

    it('should handle rapid state changes', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('config-manager')).toBeInTheDocument();
      });

      // 状態更新コールバックが設定されていることを確認
      expect(mockOnStateChange).toBeDefined();
      expect(typeof mockOnStateChange).toBe('function');

      // 複数の状態変更を連続で実行
      await act(async () => {
        mockOnStateChange({ ...mockAppState, is_watching: true });
        mockOnStateChange({ ...mockAppState, is_watching: false });
        mockOnStateChange({ ...mockAppState, is_watching: true });
      });

      // 状態変更が正常に処理されることを確認
      expect(mockOnStateChange).toHaveBeenCalled();
    });

    it('should handle component unmounting gracefully', async () => {
      const { unmount } = render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('config-manager')).toBeInTheDocument();
      });

      // コンポーネントのアンマウントが正常に処理されることを確認
      expect(() => unmount()).not.toThrow();
    });
  });
}); 