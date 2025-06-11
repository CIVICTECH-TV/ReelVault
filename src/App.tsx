import { useState, useEffect } from "react";
import { TauriCommands, AppConfig, AppState } from "./types/tauri-commands";
import { ConfigManager } from "./components/ConfigManager";
import "./App.css";

function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [appState, setAppState] = useState<AppState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <ConfigManager
      initialConfig={config}
      initialState={appState}
      onConfigChange={handleConfigChange}
      onStateChange={handleStateChange}
      onAuthSuccess={handleAuthSuccess}
    />
  );
}

export default App; 