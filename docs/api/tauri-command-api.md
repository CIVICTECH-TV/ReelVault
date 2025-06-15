# Tauri Command API仕様書 (v3.0 - 再構築版)

**最終更新日**: 2024-12-07  
**バージョン**: 3.0 (実装同期版)

---

## 📋 概要

このAPIは、React（TypeScript）フロントエンドとRustバックエンド間の通信を提供します。
6つの主要カテゴリに分類された **35個のAPI** を実装済みです：

1.  **設定管理API** (9個) - アプリケーション設定の管理・JSON永続化
2.  **ファイル操作API** (6個) - ローカルファイルシステムの操作、監視
3.  **メタデータAPI** (7個) - ファイルメタデータの生成・検索・管理
4.  **AWS認証API** (3個) - AWS認証・macOS Keychain統合
5.  **AWS操作API** (9個) - AWS S3との連携、ファイル復元
6.  **S3ライフサイクルAPI** (6個) - S3ライフサイクルポリシーの自動設定・管理

## ✨ 主な変更点 (v2.0ドキュメントから)

-   **完全な実装同期**: 全35コマンドを実コードに基づき正確に記載。
-   **新カテゴリ追加**: `メタデータAPI`, `S3ライフサイクルAPI` を新設。
-   **廃止APIの削除**: `状態管理API`など、現存しないコマンドを完全に削除。
-   **モック実装の更新**: `list_s3_objects`などが、実際のAWS SDKを利用した実装であることを明記。
-   **型定義の正確化**: 全てのパラメータと戻り値の型を最新の実装に更新。

---

## ⚙️ 設定管理API (`config.rs`)

アプリケーション設定の読み込み、保存、更新、バックアップなどを行います。

| コマンド | 説明 |
| --- | --- |
| `get_config` | 現在のアプリケーション設定を取得します。存在しない場合はデフォルト設定を生成します。 |
| `set_config` | アプリケーション設定を検証し、ファイルに保存します。 |
| `update_config` | `HashMap`を用いて設定項目を部分的に更新します。 |
| `reset_config` | 設定をデフォルト値にリセットします。 |
| `validate_config_file` | 設定ファイルの28項目にわたる包括的な検証を行います。 |
| `validate_config_data` | `AppConfig`オブジェクトを受け取り、その内容を検証します。 |
| `backup_config` | 現在の設定をタイムスタンプ付きでバックアップします。 |
| `export_config` | 現在の設定を指定されたパスにエクスポートします。 |
| `import_config` | 指定されたパスから設定をインポートし、適用します。 |

---

## 🗂️ ファイル操作API (`file_operations.rs`)

ローカルファイルの操作、ディレクトリ監視などを行います。

| コマンド | 説明 |
| --- | --- |
| `select_directory` | OSのダイアログを開き、ユーザーにディレクトリを選択させます。 |
| `list_files` | 指定されたディレクトリ内のファイルとフォルダの一覧を取得します。 |
| `get_file_info` | 特定のファイルの詳細情報（サイズ、更新日時など）を取得します。 |
| `watch_directory` | 設定に基づき、ディレクトリの変更監視を開始します（モック）。 |
| `test_watch_system` | 監視設定が意図通りに機能するかをテストします（モック）。 |
| `get_sample_watch_configs` | `watch_directory`で使用できる設定のサンプルを返します。 |

---

##  M メタデータAPI (`metadata.rs`)

ファイルのメタデータ（ハッシュ、動画情報、タグなど）をSQLiteデータベースで管理します。

| コマンド | 説明 |
| --- | --- |
| `initialize_metadata_db` | 指定されたパスにメタデータ用のSQLiteデータベースとテーブルを初期化します。 |
| `create_file_metadata` | ファイルパスからハッシュ、MIMEタイプ、動画情報などを抽出し、メタデータオブジェクトを生成します。 |
| `save_file_metadata` | `FileMetadata`オブジェクトをデータベースに保存（INSERT or REPLACE）します。 |
| `search_file_metadata` | ファイル名、タグ、サイズなどでデータベースを検索し、一致するメタデータのリストを返します。 |
| `update_file_metadata` | 既存のファイルのメタデータ（タグ、カスタムフィールド）を更新します。 |
| `delete_file_metadata` | 指定されたファイルのメタデータをデータベースから削除します。 |
| `get_all_tags` | データベースに存在する全てのタグを一覧で取得します。 |

---

## 🔐 AWS認証API (`aws_auth.rs`)

AWSの認証と、認証情報の安全な管理を行います。

| コマンド | 説明 |
| --- | --- |
| `authenticate_aws` | AWS STS `get_caller_identity`を呼び出し、認証情報が有効かテストします。 |
| `test_s3_bucket_access` | S3バケットへのアクセスをテストし、成功時には自動でライフサイクルポリシーを設定します。 |
| `save_aws_credentials_secure` | AWS認証情報をmacOS Keychainに暗号化して安全に保存します。 |
| `load_aws_credentials_secure` | macOS KeychainからAWS認証情報を読み込みます。 |

---

## ☁️ AWS操作API (`aws_operations.rs`)

S3バケットへのファイルアップロード、一覧取得、復元、ダウンロードなどを行います。

| コマンド | 説明 |
| --- | --- |
| `test_aws_connection` | AWS認証情報が有効か基本的な検証を行います（モック）。 |
| `upload_file` | 指定されたファイルをS3にアップロードします（モック）。 |
| `list_s3_objects` | S3バケット内のオブジェクト一覧を実際に取得します。 |
| `restore_file` | S3 Deep Archiveからファイルを復元するジョブを開始します（モック）。 |
| `check_restore_status` | 復元ジョブの現在の状態（進行中、完了など）を確認します（モック）。 |
| `download_s3_file` | S3からファイルをダウンロードします（モック）。 |
| `download_restored_file` | 復元が完了したファイルをダウンロードします（モック）。 |
| `list_restore_jobs` | 現在追跡中の復元ジョブ一覧を返します。 |
| `clear_restore_history` | 完了または失敗した復元ジョブの履歴をクリアします。 |

---

## 🔄 S3ライフサイクルAPI (`lifecycle.rs`)

S3バケットのライフサイクルポリシーを管理し、ファイルの自動アーカイブを実現します。

| コマンド | 説明 |
| --- | --- |
| `enable_reelvault_lifecycle` | ReelVault標準のライフサイクルポリシー（1日でDeep Archiveへ移行）を有効化します（モック）。 |
| `get_lifecycle_status` | バケットにReelVaultのライフサイクルルールが設定されているか、その状態を実際に確認します。 |
| `disable_lifecycle_policy` | ライフサイクルポリシーを無効化します（モック）。 |
| `list_lifecycle_rules` | バケットに設定されている全てのライフサイクルルールを取得します。 |
| `validate_lifecycle_config` | ライフサイクル設定が有効か検証します（モック）。 |
| `check_upload_readiness` | アップロード前にライフサイクル設定が正常かなどを確認します（モック）。 |

---

## 📝 型定義 (主要なもの)

主要なデータ構造のみを記載します。詳細はソースコードを参照してください。

### `AppConfig`
```typescript
interface AppConfig {
    version: string;
    app_settings: AppSettings;
    user_preferences: UserPreferences;
    aws_settings: AwsSettings;
}
```

### `AwsCredentials`
```typescript
interface AwsCredentials {
    access_key_id: string;
    secret_access_key: string;
    region: string;
    session_token: string | null;
}
```

### `FileMetadata`
```typescript
interface FileMetadata {
    id: number | null;
    file_path: string;
    file_name: string;
    file_size: number; // u64
    file_hash: string;
    mime_type: string;
    created_at: string;
    modified_at: string;
    video_metadata: VideoMetadata | null;
    tags: string[];
    custom_fields: Record<string, string>;
}
```
