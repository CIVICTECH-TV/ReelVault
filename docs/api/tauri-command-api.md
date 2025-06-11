# Tauri Command API仕様書

ReelVaultアプリケーションのTauri Command API群の仕様書です。

## 📋 概要

このAPIは、React（TypeScript）フロントエンドとRustバックエンド間の通信を提供します。
4つの主要カテゴリに分類されています：

1. **ファイル操作API** - ローカルファイルシステムの操作
2. **AWS操作API** - AWS S3との連携機能
3. **設定管理API** - アプリケーション設定の管理
4. **状態管理API** - リアルタイムアプリケーション状態の管理

## 🗂️ ファイル操作API

### `list_files`
ディレクトリ内のファイル一覧を取得します。

**パラメータ:**
```typescript
{
  directory: string  // ディレクトリパス
}
```

**戻り値:**
```typescript
FileInfo[] // ファイル情報の配列
```

**使用例:**
```typescript
const files = await TauriCommands.listFiles("/Users/username/Videos");
```

### `get_file_info`
特定ファイルの詳細情報を取得します。

**パラメータ:**
```typescript
{
  filePath: string  // ファイルパス
}
```

**戻り値:**
```typescript
FileInfo  // ファイル詳細情報
```

### `watch_directory`
ディレクトリ監視を開始します（基本実装版）。

**パラメータ:**
```typescript
{
  config: WatchConfig  // 監視設定
}
```

**戻り値:**
```typescript
string  // 設定確認メッセージ
```

## ☁️ AWS操作API

### `test_aws_connection`
AWS接続をテストします。

**パラメータ:**
```typescript
{
  config: AwsConfig  // AWS認証設定
}
```

**戻り値:**
```typescript
ConnectionTestResult  // 接続テスト結果
```

### `upload_file`
ファイルをS3にアップロードします（モック実装）。

**パラメータ:**
```typescript
{
  filePath: string,    // ローカルファイルパス
  s3Key: string,       // S3キー
  config: AwsConfig    // AWS設定
}
```

**戻り値:**
```typescript
string  // アップロード結果メッセージ
```

### `list_s3_objects`
S3バケット内のオブジェクト一覧を取得します（モック実装）。

**パラメータ:**
```typescript
{
  config: AwsConfig,     // AWS設定
  prefix?: string        // オプション：オブジェクトキーの接頭辞
}
```

**戻り値:**
```typescript
S3Object[]  // S3オブジェクトの配列
```

### `restore_file`
Deep Archiveからファイルを復元します（モック実装）。

**パラメータ:**
```typescript
{
  s3Key: string,        // S3キー
  config: AwsConfig,    // AWS設定
  tier: string          // 復元ティア: "Standard" | "Expedited" | "Bulk"
}
```

**戻り値:**
```typescript
RestoreInfo  // 復元情報
```

## ⚙️ 設定管理API

### `get_config`
現在のアプリケーション設定を取得します。

**パラメータ:** なし

**戻り値:**
```typescript
AppConfig  // アプリケーション設定
```

### `set_config`
アプリケーション設定を保存します。

**パラメータ:**
```typescript
{
  config: AppConfig  // 新しい設定
}
```

**戻り値:**
```typescript
string  // 保存結果メッセージ
```

### `update_config`
設定の部分更新を行います。

**パラメータ:**
```typescript
{
  update: ConfigUpdate  // 更新内容
}
```

**戻り値:**
```typescript
string  // 更新結果メッセージ
```

### `reset_config`
設定をデフォルトにリセットします。

**パラメータ:** なし

**戻り値:**
```typescript
string  // リセット結果メッセージ
```

## 📊 状態管理API

### `get_app_state`
現在のアプリケーション状態を取得します。

**パラメータ:** なし

**戻り値:**
```typescript
AppState  // アプリケーション状態
```

### `set_app_state`
アプリケーション状態を更新します。

**パラメータ:**
```typescript
{
  newState: AppState  // 新しい状態
}
```

**戻り値:**
```typescript
string  // 更新結果メッセージ
```

### `update_app_state`
状態の部分更新を行います。

**パラメータ:**
```typescript
{
  update: StateUpdate  // 更新内容
}
```

**戻り値:**
```typescript
string  // 更新結果メッセージ
```

### `add_to_upload_queue`
アップロードキューにファイルを追加します。

**パラメータ:**
```typescript
{
  filePath: string  // ファイルパス
}
```

**戻り値:**
```typescript
string  // 追加結果メッセージ（アイテムIDを含む）
```

### `remove_from_upload_queue`
アップロードキューからアイテムを削除します。

**パラメータ:**
```typescript
{
  itemId: string  // アイテムID
}
```

**戻り値:**
```typescript
string  // 削除結果メッセージ
```

### `update_system_stats`
システム統計を更新します。

**パラメータ:** なし

**戻り値:**
```typescript
SystemStatus  // 更新されたシステム状態
```

### `reset_app_state`
アプリケーション状態をリセットします。

**パラメータ:** なし

**戻り値:**
```typescript
string  // リセット結果メッセージ
```

## 📝 型定義

### FileInfo
```typescript
interface FileInfo {
  name: string;           // ファイル名
  path: string;           // フルパス
  size: number;           // ファイルサイズ（バイト）
  modified: string;       // 最終更新日時
  is_directory: boolean;  // ディレクトリかどうか
  extension?: string;     // ファイル拡張子
}
```

### WatchConfig
```typescript
interface WatchConfig {
  path: string;              // 監視するディレクトリパス
  recursive: boolean;        // 再帰的監視
  file_patterns: string[];   // ファイルパターン（例：["*.mp4", "*.mov"]）
}
```

### AwsConfig
```typescript
interface AwsConfig {
  access_key_id: string;     // AWSアクセスキーID
  secret_access_key: string; // AWSシークレットアクセスキー
  region: string;            // AWSリージョン
  bucket_name: string;       // S3バケット名
}
```

### AppConfig
```typescript
interface AppConfig {
  aws: AwsSettings;      // AWS関連設定
  app: AppSettings;      // アプリケーション設定
  watch: WatchSettings;  // ファイル監視設定
}
```

### AppState
```typescript
interface AppState {
  is_watching: boolean;                    // 監視中かどうか
  upload_queue: UploadItem[];             // アップロードキュー
  current_uploads: UploadProgressInfo[];  // 現在のアップロード進捗
  statistics: AppStatistics;              // 統計情報
  last_error?: string;                    // 最後のエラー
  system_status: SystemStatus;            // システム状態
}
```

## 🛠️ エラーハンドリング

すべてのAPIは`Result<T, String>`形式で結果を返します：

- **成功時**: `Ok(T)` - 期待される戻り値
- **エラー時**: `Err(String)` - エラーメッセージ

TypeScript側では、Promiseの`catch`でエラーを捕捉できます：

```typescript
try {
  const files = await TauriCommands.listFiles("/invalid/path");
} catch (error) {
  console.error("API Error:", error);
}
```

## 🔐 セキュリティ考慮事項

1. **認証情報の保護**: AWS認証情報は実装では暗号化して保存する予定
2. **ファイルアクセス制限**: ユーザーのホームディレクトリ外へのアクセス制限を検討
3. **入力検証**: すべての入力パラメータは適切に検証される

## 📈 将来の拡張予定

1. **実際のAWS SDK統合** - 現在のモック実装を実際のAWS操作に置き換え
2. **ファイル監視の実装** - notify crateを使った実際のファイル監視機能
3. **アップロード進捗の実装** - リアルタイムアップロード進捗の追跡
4. **暗号化機能** - 設定ファイルとAWS認証情報の暗号化

## 🧪 テスト

Reactアプリ内でAPIテスト機能が利用可能です：

1. アプリケーションを起動: `cargo tauri dev`
2. 各APIカテゴリのテストボタンをクリック
3. テスト結果をリアルタイムで確認

**テスト可能な機能:**
- ファイル操作API（ファイル一覧取得、ファイル情報取得）
- AWS操作API（接続テスト、モックS3操作）
- 設定管理API（設定読み書き、部分更新）
- 状態管理API（状態取得・更新、アップロードキュー操作）

---

**更新日**: 2024-12-06  
**バージョン**: 1.0 (Issue #33 実装版) 