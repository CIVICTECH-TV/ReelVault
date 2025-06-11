import { useState, useEffect } from "react";
import { TauriCommands, AppConfig, AppState, FileInfo } from "./types/tauri-commands";
import "./App.css";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [appState, setAppState] = useState<AppState | null>(null);
  const [testResults, setTestResults] = useState<string[]>([]);

  // アプリ起動時に設定と状態を読み込み
  useEffect(() => {
    loadConfigAndState();
  }, []);

  const loadConfigAndState = async () => {
    try {
      const [configData, stateData] = await Promise.all([
        TauriCommands.getConfig(),
        TauriCommands.getAppState()
      ]);
      setConfig(configData);
      setAppState(stateData);
      addTestResult("✅ 設定とアプリ状態の読み込み成功");
    } catch (error) {
      addTestResult(`❌ 初期化エラー: ${error}`);
    }
  };

  const addTestResult = (message: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  // 従来のgreet機能
  async function greet() {
    try {
      const response = await window.__TAURI__.core.invoke<string>("greet", { name });
      setGreetMsg(response);
      addTestResult(`✅ Greet API: ${response}`);
    } catch (error) {
      addTestResult(`❌ Greet API エラー: ${error}`);
    }
  }

  // ファイル操作APIテスト
  const testFileOperations = async () => {
    try {
      // ホームディレクトリのファイル一覧を取得
      const homeDir = "/Users"; // macOS想定
      const files = await TauriCommands.listFiles(homeDir);
      addTestResult(`✅ ファイル一覧取得: ${files.length}個のファイル/フォルダ`);
      
      if (files.length > 0) {
        const firstFile = files[0];
        const fileInfo = await TauriCommands.getFileInfo(firstFile.path);
        addTestResult(`✅ ファイル詳細取得: ${fileInfo.name} (${fileInfo.size} bytes)`);
      }
    } catch (error) {
      addTestResult(`❌ ファイル操作エラー: ${error}`);
    }
  };

  // AWS APIテスト
  const testAwsOperations = async () => {
    if (!config) {
      addTestResult("❌ 設定が読み込まれていません");
      return;
    }

    try {
      const testConfig = {
        access_key_id: "test_key",
        secret_access_key: "test_secret",
        region: config.aws.region || "ap-northeast-1",
        bucket_name: "test-bucket"
      };

      const result = await TauriCommands.testAwsConnection(testConfig);
      addTestResult(`✅ AWS接続テスト: ${result.message}`);

      const s3Objects = await TauriCommands.listS3Objects(testConfig);
      addTestResult(`✅ S3オブジェクト一覧: ${s3Objects.length}個のオブジェクト`);
    } catch (error) {
      addTestResult(`❌ AWS操作エラー: ${error}`);
    }
  };

  // 設定管理APIテスト
  const testConfigOperations = async () => {
    try {
      // 設定を更新
      const updateResult = await TauriCommands.updateConfig({
        section: "app",
        values: { notification_enabled: true }
      });
      addTestResult(`✅ 設定更新: ${updateResult}`);

      // 設定を再読み込み
      const newConfig = await TauriCommands.getConfig();
      setConfig(newConfig);
      addTestResult(`✅ 設定再読み込み完了`);
    } catch (error) {
      addTestResult(`❌ 設定操作エラー: ${error}`);
    }
  };

  // 状態管理APIテスト
  const testStateOperations = async () => {
    try {
      // 監視状態を切り替え
      const newWatchingState = !(appState?.is_watching || false);
      await TauriCommands.updateAppState({
        field: "is_watching",
        value: newWatchingState
      });
      addTestResult(`✅ 監視状態更新: ${newWatchingState ? "ON" : "OFF"}`);

      // システム統計を更新
      const systemStats = await TauriCommands.updateSystemStats();
      addTestResult(`✅ システム統計更新: ディスク容量 ${systemStats.disk_space_gb}GB`);

      // 状態を再読み込み
      const newState = await TauriCommands.getAppState();
      setAppState(newState);
    } catch (error) {
      addTestResult(`❌ 状態操作エラー: ${error}`);
    }
  };

  const clearTestResults = () => {
    setTestResults([]);
  };

  return (
    <div className="container">
      <h1>ReelVault - Command API テスト</h1>

      {/* 従来のGreet機能 */}
      <div className="section">
        <h2>Greet API (デモ)</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            greet();
          }}
        >
          <input
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="名前を入力..."
            value={name}
          />
          <button type="submit">Greet</button>
        </form>
        <p>{greetMsg}</p>
      </div>

      {/* 設定情報の表示 */}
      <div className="section">
        <h2>現在の設定</h2>
        {config && (
          <div className="config-display">
            <p><strong>AWS Region:</strong> {config.aws.region}</p>
            <p><strong>Bucket:</strong> {config.aws.bucket_name || "未設定"}</p>
            <p><strong>言語:</strong> {config.app.language}</p>
            <p><strong>通知:</strong> {config.app.notification_enabled ? "有効" : "無効"}</p>
            <p><strong>監視フォルダ数:</strong> {config.watch.directories.length}</p>
          </div>
        )}
      </div>

      {/* アプリ状態の表示 */}
      <div className="section">
        <h2>アプリケーション状態</h2>
        {appState && (
          <div className="state-display">
            <p><strong>監視中:</strong> {appState.is_watching ? "YES" : "NO"}</p>
            <p><strong>アップロードキュー:</strong> {appState.upload_queue.length}個</p>
            <p><strong>AWS接続:</strong> {appState.system_status.aws_connected ? "接続済み" : "未接続"}</p>
            <p><strong>最終更新:</strong> {new Date(appState.system_status.last_heartbeat).toLocaleString()}</p>
          </div>
        )}
      </div>

      {/* APIテストボタン */}
      <div className="section">
        <h2>Command API テスト</h2>
        <div className="test-buttons">
          <button onClick={testFileOperations}>ファイル操作 API</button>
          <button onClick={testAwsOperations}>AWS操作 API</button>
          <button onClick={testConfigOperations}>設定管理 API</button>
          <button onClick={testStateOperations}>状態管理 API</button>
        </div>
      </div>

      {/* テスト結果 */}
      <div className="section">
        <h2>テスト結果</h2>
        <div className="test-results-header">
          <button onClick={clearTestResults}>結果をクリア</button>
        </div>
        <div className="test-results">
          {testResults.map((result, index) => (
            <div key={index} className="test-result">{result}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App; 