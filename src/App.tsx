import React, { useState, useEffect, useRef } from "react";
import { listen } from '@tauri-apps/api/event';
import { TauriCommands, AppConfig, AppState } from "./services/tauriCommands";
import { ConfigManager, ConfigManagerRef } from "./components/ConfigManager";
import "./App.css";

function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [appState, setAppState] = useState<AppState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const configManagerRef = useRef<ConfigManagerRef | null>(null);

  const [healthStatus, setHealthStatus] = useState<{ isHealthy: boolean; lastCheck: Date | null; bucketName: string | undefined }>({
    isHealthy: true,
    lastCheck: null,
    bucketName: undefined
  });

  // アプリ起動時に設定と状態を読み込み
  useEffect(() => {
    const initializeApp = async () => {
      try {
        setIsLoading(true);
        const [configData, stateData] = await Promise.all([
          TauriCommands.getConfig(),
          TauriCommands.getAppState()
        ]);
        setConfig(configData);
        setAppState(stateData);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsLoading(false);
      }
    };
    initializeApp();
  }, []);

  // システムトレイからのイベントリスナー
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupEventListener = async () => {
      try {
        unlisten = await listen('open-settings', () => {
          console.log('システムトレイから設定タブを開く要求を受信');
          if (configManagerRef.current) {
            configManagerRef.current.openSettingsTab();
          }
        });
      } catch (error) {
        console.error('イベントリスナーの設定に失敗:', error);
      }
    };

    setupEventListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  // configが変更されたらテーマを適用
  useEffect(() => {
    if (config?.app_settings?.theme) {
      document.documentElement.setAttribute('data-theme', config.app_settings.theme);
    }
  }, [config]);

  const handleConfigChange = (newConfig: AppConfig) => {
    setConfig(newConfig);
  };
  
  const handleStateChange = (newState: AppState) => {
    setAppState(newState);
  };

  const handleAuthSuccess = () => {
    // 認証成功時に状態を再読み込み
    TauriCommands.getAppState().then(setAppState);
  };

  const handleHealthStatusChange = (status: { isHealthy: boolean; lastCheck: Date | null; bucketName: string | undefined }) => {
    setHealthStatus(status);
  };

  if (isLoading) {
    return <div className="app-status">読み込み中...</div>;
  }

  if (error) {
    return <div className="app-status error">エラー: {error}</div>;
  }
  
  if (!config || !appState) {
    return <div className="app-status">設定または状態を読み込めませんでした。</div>;
  }

  return (
    <div className="app-container">
      <ConfigManager
        ref={configManagerRef}
        initialConfig={config}
        initialState={appState}
        onConfigChange={handleConfigChange}
        onStateChange={handleStateChange}
        onAuthSuccess={handleAuthSuccess}
        onHealthStatusChange={handleHealthStatusChange}
      />
      
      {/* 健全性状態の表示（開発用） */}
      {!healthStatus.isHealthy && (
        <div className="app-warning">
          ⚠️ アップロード機能が利用できません。AWS設定を確認してください。
        </div>
      )}
    </div>
  );
}

export default App; 