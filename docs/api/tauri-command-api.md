# Tauri Command API仕様書

ReelVaultアプリケーションのTauri Command API群の仕様書です。

## 📋 概要

このAPIは、React（TypeScript）フロントエンドとRustバックエンド間の通信を提供します。
5つの主要カテゴリに分類された **28個のAPI** を実装済みです：

1. **ファイル操作API** (7個) - ローカルファイルシステムの操作
2. **AWS操作API** (4個) - AWS S3との連携機能
3. **AWS認証API** (5個) - AWS認証・macOS Keychain統合
4. **設定管理API** (9個) - アプリケーション設定の管理・JSON永続化
5. **状態管理API** (3個) - リアルタイムアプリケーション状態の管理

## 🆕 Epic1新機能

- **AWS実認証**: AWS STS `get_caller_identity`による確実な接続確認
- **macOS Keychain**: keyringライブラリでセキュアな認証情報保存
- **Ring暗号化**: 暗号化による認証情報保護
- **設定永続化**: JSON形式での設定自動保存・バックアップ機能
- **包括的検証**: 28項目の設定バリデーション

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

## 🔐 AWS認証API

### `authenticate_aws`
AWS STS経由で実際の認証を行います。

**パラメータ:**
```typescript
{
  credentials: AwsCredentials  // AWS認証情報
}
```

**戻り値:**
```typescript
AwsAuthResult  // 認証結果とユーザー情報
```

**使用例:**
```typescript
const result = await TauriCommands.authenticateAws({
  access_key_id: "AKIA...",
  secret_access_key: "...",
  region: "ap-northeast-1", // Default to Tokyo region
  session_token: null
});
```

### `test_s3_bucket_access`
S3バケットへのアクセス権限をテストします。

**パラメータ:**
```typescript
{
  credentials: AwsCredentials,  // AWS認証情報
  bucket_name: string          // テスト対象バケット名
}
```

**戻り値:**
```typescript
AwsAuthResult  // バケットアクセステスト結果
```

### `save_aws_credentials_secure`
AWS認証情報をmacOS Keychainにセキュアに保存します。

**パラメータ:**
```typescript
{
  profile_name: string,        // プロファイル名
  credentials: AwsCredentials  // 保存する認証情報
}
```

**戻り値:**
```typescript
string  // 保存結果メッセージ
```

### `load_aws_credentials_secure`
保存されたAWS認証情報をKeychainから読み込みます。

**パラメータ:**
```typescript
{
  profile_name: string  // プロファイル名
}
```

**戻り値:**
```typescript
AwsCredentials  // 読み込まれた認証情報
```

### `delete_aws_credentials_secure`
保存されたAWS認証情報をKeychainから削除します。

**パラメータ:**
```typescript
{
  profile_name: string  // プロファイル名
}
```

**戻り値:**
```typescript
string  // 削除結果メッセージ
```

## ⚙️ 設定管理API

### `get_config`
現在のアプリケーション設定を取得します（存在しない場合はデフォルト生成）。

**パラメータ:** なし

**戻り値:**
```typescript
AppConfig  // アプリケーション設定
```

### `set_config`
アプリケーション設定を保存します（自動バックアップ・検証付き）。

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
設定の部分更新を行います（HashMap型で柔軟更新）。

**パラメータ:**
```typescript
{
  updates: Record<string, any>  // 更新内容（キー・値ペア）
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

### `validate_config_file`
設定ファイルの包括的検証を行います（28項目チェック）。

**パラメータ:** なし

**戻り値:**
```typescript
ConfigValidationResult  // 検証結果・エラー・警告
```

### `backup_config`
現在の設定のタイムスタンプ付きバックアップを作成します。

**パラメータ:** なし

**戻り値:**
```typescript
string  // バックアップファイルパス
```

### `restore_config`
指定されたバックアップファイルから設定を復元します。

**パラメータ:**
```typescript
{
  backup_path: string  // バックアップファイルパス
}
```

**戻り値:**
```typescript
string  // 復元結果メッセージ
```

### `add_recent_file`
最近使用したファイルを履歴に追加します（最大10件管理）。

**パラメータ:**
```typescript
{
  file_path: string  // ファイルパス
}
```

**戻り値:**
```typescript
string  // 追加結果メッセージ
```

### `clear_recent_files`
最近使用したファイルの履歴をクリアします。

**パラメータ:** なし

**戻り値:**
```typescript
string  // クリア結果メッセージ
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

### AwsCredentials
```typescript
interface AwsCredentials {
  access_key_id: string;      // AWSアクセスキーID
  secret_access_key: string;  // AWSシークレットアクセスキー
  region: string;             // AWSリージョン
  session_token: string | null; // セッショントークン（STSの場合）
}
```

### AwsAuthResult
```typescript
interface AwsAuthResult {
  success: boolean;             // 認証成功フラグ
  message: string;              // 結果メッセージ
  user_identity?: AwsUserIdentity; // ユーザー情報（成功時のみ）
  permissions?: PermissionCheck[]; // 権限チェック結果
}
```

### AwsUserIdentity
```typescript
interface AwsUserIdentity {
  user_id: string;    // ユーザーID
  arn: string;        // ARN
  account: string;    // アカウントID
}
```

### PermissionCheck
```typescript
interface PermissionCheck {
  service: string;    // AWSサービス名
  action: string;     // アクション名
  resource: string;   // リソース名
  allowed: boolean;   // 許可されているか
}
```

### AppConfig
```typescript
interface AppConfig {
  version: string;                    // 設定ファイルバージョン
  app_settings: AppSettings;          // アプリケーション設定
  user_preferences: UserPreferences;  // ユーザー設定
  aws_settings: AwsSettings;          // AWS設定
}
```

### AppSettings
```typescript
interface AppSettings {
  auto_save: boolean;         // 自動保存
  backup_enabled: boolean;    // バックアップ有効化
  log_level: string;          // ログレベル
  theme: string;              // テーマ
  language: string;           // 言語
}
```

### UserPreferences
```typescript
interface UserPreferences {
  default_bucket_name: string;    // デフォルトS3バケット
  default_storage_class: string;  // デフォルトストレージクラス
  compression_enabled: boolean;   // 圧縮有効化
  notification_enabled: boolean;  // 通知有効化
  recent_files: string[];         // 最近使用ファイル（最大10件）
}
```

### AwsSettings
```typescript
interface AwsSettings {
  default_region: string;    // デフォルトリージョン
  timeout_seconds: number;   // タイムアウト秒数
  max_retries: number;       // 最大リトライ回数
  profile_name: string;      // プロファイル名
}
```

### ConfigValidationResult
```typescript
interface ConfigValidationResult {
  valid: boolean;       // 検証結果
  errors: string[];     // エラーリスト
  warnings: string[];   // 警告リスト
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
**バージョン**: 2.0 (Epic1完全実装版 - 28個API対応)  
**実装完了**: AWS認証API (5個) + 設定管理API拡張 (9個) + 既存API (14個) 