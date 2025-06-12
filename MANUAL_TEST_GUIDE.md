# 復元機能 手動テストガイド

## テスト環境の準備

### 1. アプリケーションの起動
```bash
npm run tauri dev
```

アプリケーションが起動するまで少し待ちます（通常10-30秒）。

### 2. ブラウザのデベロッパーツールを開く
- アプリケーションウィンドウで右クリック → 「検証」
- または F12 キーを押下
- コンソールタブを選択

## テスト方法

### 手動テスト 1: 基本的なコマンドテスト

#### 1.1 テストスクリプトの読み込み
デベロッパーツールのコンソールで以下を実行：

```javascript
// テストスクリプトの内容をコピー&ペーストして実行
// (test-restore-commands.js の内容)
```

#### 1.2 全テストの実行
```javascript
runAllTests()
```

#### 1.3 個別テストの実行
```javascript
// 復元リクエスト
testRestoreFile()

// 復元状況確認
testCheckRestoreStatus()

// 復元ジョブ一覧
testListRestoreJobs()

// 復元通知取得
testGetRestoreNotifications()

// ダウンロード（復元未完了なので失敗する想定）
testDownloadRestoredFile()

// キャンセル
testCancelRestoreJob()

// 履歴クリア
testClearRestoreHistory()
```

### 手動テスト 2: 復元の時間経過シミュレーション

復元機能は5分後に完了するようにシミュレートされています。

#### 2.1 復元リクエスト後の状況確認
```javascript
// 復元リクエスト
await testRestoreFile()

// 即座に状況確認（in-progress になるはず）
await testCheckRestoreStatus()

// 5分待ってから再度確認（completed になるはず）
// setTimeout(() => testCheckRestoreStatus(), 5 * 60 * 1000)
```

#### 2.2 テスト用の短縮バージョン
実際には待てないので、Rustコードを一時的に修正してテストします。

`src-tauri/src/commands/aws_operations.rs` の以下の行を変更：
```rust
// 元の設定（5分）
if elapsed.num_minutes() >= 5 && restore_info.restore_status == "in-progress" {

// テスト用設定（10秒）
if elapsed.num_seconds() >= 10 && restore_info.restore_status == "in-progress" {
```

### 手動テスト 3: UI コンポーネントのテスト

#### 3.1 RestoreManagerコンポーネントの統合

アプリケーションのメインページに RestoreManager を追加するため、`src/App.tsx` を編集：

```tsx
import { RestoreManager } from './components/RestoreManager';

// モックデータ
const mockAwsConfig = {
  access_key_id: "test_access_key",
  secret_access_key: "test_secret_key",
  region: "us-east-1",
  bucket_name: "test-bucket"
};

const mockS3Objects = [
  {
    key: "videos/project1/final.mp4",
    size: 104857600, // 100MB
    last_modified: "2024-01-15T10:30:00Z",
    storage_class: "DEEP_ARCHIVE",
    etag: "\"abc123def456\""
  },
  {
    key: "videos/project2/raw_footage.mov", 
    size: 524288000, // 500MB
    last_modified: "2024-01-10T14:20:00Z",
    storage_class: "DEEP_ARCHIVE",
    etag: "\"def456ghi789\""
  }
];

// App.tsx の return 文に追加
<RestoreManager
  awsConfig={mockAwsConfig}
  s3Objects={mockS3Objects}
  onError={(error) => console.error(error)}
  onSuccess={(message) => console.log(message)}
/>
```

#### 3.2 UIの動作確認

1. **ファイル選択**: Deep Archiveファイルのチェックボックス選択
2. **復元ティア選択**: プルダウンメニューでの選択
3. **復元開始**: 復元ボタンクリック
4. **ジョブ監視**: 復元ジョブ一覧の表示
5. **通知表示**: 復元完了通知の表示
6. **ダウンロード**: ダウンロードボタンの動作

## 期待される結果

### ✅ 成功パターン

#### コマンドテスト
- **復元リクエスト**: `RestoreInfo` オブジェクトが返される
- **復元状況確認**: `RestoreStatusResult` オブジェクトが返される
- **復元ジョブ一覧**: `RestoreInfo` 配列が返される
- **復元通知取得**: `RestoreNotification` 配列が返される
- **履歴クリア**: 削除された件数が返される

#### 状況シミュレーション
- **初期状態**: `restore_status: "in-progress"`
- **5分後**: `restore_status: "completed"` （テスト用は10秒後）
- **キャンセル後**: `restore_status: "cancelled"`

#### UIテスト
- **ファイル選択**: チェックボックスの動作
- **復元開始**: ローディング状態の表示
- **ジョブ表示**: 復元ジョブの一覧表示
- **通知表示**: 復元完了通知

### ❌ 失敗パターン

#### 期待される失敗
- **未復元ファイルのダウンロード**: エラーメッセージ表示
- **不正なS3キー**: エラーメッセージ表示
- **不正な復元ティア**: エラーメッセージ表示

## トラブルシューティング

### 1. コマンドが見つからない
```
Error: No handler found for 'restore_file'
```
- Rust側でコマンドが登録されていない
- `src-tauri/src/lib.rs` の `invoke_handler` に追加されているか確認

### 2. 型エラー
```
Type error in TypeScript
```
- `src/types/tauri-commands.ts` の型定義を確認
- Rust側の構造体と一致しているか確認

### 3. ビルドエラー
```
Compilation failed
```
- `cargo check` でRust側のエラーを確認
- `npm run build` でTypeScript側のエラーを確認

### 4. 実行時エラー
```
Runtime error during invoke
```
- ブラウザのコンソールでエラー詳細を確認
- Tauri側のログを確認

## 次のステップ

手動テストが成功したら：

1. **実際のAWS統合**: モック実装を実際のAWS SDK呼び出しに置き換え
2. **エラーハンドリング強化**: より詳細なエラー分類と処理
3. **UI改善**: ユーザビリティ向上
4. **自動テスト**: ユニットテストやE2Eテストの追加

## テスト完了後

全ての手動テストが成功したら、安全にコミット可能です：

```bash
git add .
git commit -m "feat: implement file restore functionality (Issue #5)

- Add restore request, monitoring, notification, and download features
- Include batch restore processing and job management
- Implement comprehensive UI with RestoreManager component
- Add TypeScript service layer and type definitions

All 4 completion criteria met:
- ✅ Restore request functionality
- ✅ Status monitoring system  
- ✅ Notification system
- ✅ Download functionality"
``` 