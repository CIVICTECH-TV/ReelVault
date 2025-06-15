# ReelVault Tauri Command API v2.0

このドキュメントは、ReelVaultアプリケーションのTauriコマンドAPIの仕様を定義します。
APIは機能ごとに7つのモジュールに分類されています。

## APIモジュール一覧

1.  **[ファイル操作API (`file_operations`)](#1-ファイル操作api-file_operations)**
2.  **[AWS操作API (`aws_operations`)](#2-aws操作api-aws_operations)**
3.  **[AWS認証API (`aws_auth`)](#3-aws認証api-aws_auth)**
4.  **[設定管理API (`config`)](#4-設定管理api-config)**
5.  **[状態管理API (`state_management`)](#5-状態管理api-state_management)**
6.  **[メタデータ管理API (`metadata`)](#6-メタデータ管理api-metadata)**
7.  **[アップロードシステムAPI (`upload_system`)](#7-アップロードシステムapi-upload_system)**
8.  **[ライフサイクル管理API (`lifecycle`)](#8-ライフサイクル管理api-lifecycle)**

---

## 1. ファイル操作API (`file_operations`)

| コマンド名                  | 説明                                               |
| --------------------------- | -------------------------------------------------- |
| `list_files`                | 指定されたディレクトリ内のファイル一覧を取得します。 |
| `get_file_info`             | 指定されたファイルの情報を取得します。             |
| `select_directory`          | ディレクトリ選択ダイアログを開きます。             |
| `watch_directory`           | 指定されたディレクトリの監視を開始します。         |
| `test_watch_system`         | ファイル監視システムのテストを実行します。         |
| `get_sample_watch_configs`  | サンプルの監視設定を取得します。                   |

---

## 2. AWS操作API (`aws_operations`)

| コマンド名                   | 説明                                                 |
| ---------------------------- | ---------------------------------------------------- |
| `test_aws_connection`        | AWSへの接続をテストします。                          |
| `upload_file`                | ファイルをS3にアップロードします（現在はモック）。     |
| `list_s3_objects`            | S3バケット内のオブジェクト一覧を取得します。         |
| `restore_file`               | S3からファイルを復元します。                         |
| `check_restore_status`       | ファイルの復元状況を確認します。                     |
| `get_restore_notifications`  | 復元に関する通知を取得します。                       |
| `download_s3_file`           | S3からファイルをダウンロードします。                 |
| `download_restored_file`     | 復元されたファイルをダウンロードします。             |
| `list_restore_jobs`          | 進行中の復元ジョブ一覧を取得します。                 |
| `cancel_restore_job`         | 復元ジョブをキャンセルします。                       |
| `clear_restore_history`      | 復元履歴をクリアします。                             |

---

## 3. AWS認証API (`aws_auth`)

| コマンド名                      | 説明                                                         |
| ------------------------------- | ------------------------------------------------------------ |
| `authenticate_aws`              | AWS認証を実行し、ユーザーIDや権限を確認します。              |
| `test_s3_bucket_access`         | S3バケットへのアクセスをテストし、ライフサイクルポリシーを自動設定します。 |
| `save_aws_credentials_secure`   | AWS認証情報をセキュアに保存します（macOS Keychain/Windows Credential Manager）。 |
| `load_aws_credentials_secure`   | 保存されたAWS認証情報をセキュアに読み込みます。              |

---

## 4. 設定管理API (`config`)

| コマンド名                 | 説明                                   |
| -------------------------- | -------------------------------------- |
| `get_config`               | 現在のアプリケーション設定を取得します。 |
| `set_config`               | アプリケーション設定を上書きします。     |
| `update_config`            | アプリケーション設定を部分的に更新します。 |
| `reset_config`             | 設定をデフォルト値にリセットします。     |
| `validate_config_file`     | 設定ファイルの有効性を検証します。     |
| `validate_config_data`     | 設定データの有効性を検証します。       |
| `backup_config`            | 設定ファイルをバックアップします。     |
| `export_config`            | 設定をファイルにエクスポートします。   |
| `import_config`            | ファイルから設定をインポートします。   |
| `restore_config`           | バックアップから設定を復元します。     |

---

## 5. 状態管理API (`state_management`)

| コマンド名                | 説明                                         |
| ------------------------- | -------------------------------------------- |
| `get_app_state`           | 現在のアプリケーション状態を取得します。     |
| `set_app_state`           | アプリケーション状態を上書きします。         |
| `update_app_state`        | アプリケーション状態を部分的に更新します。   |
| `add_to_upload_queue`     | アップロードキューに項目を追加します。       |
| `update_system_stats`     | CPUやメモリなどのシステム統計を更新します。    |
| `reset_app_state`         | アプリケーション状態を初期値にリセットします。 |

---

## 6. メタデータ管理API (`metadata`)

| コマンド名                 | 説明                                         |
| -------------------------- | -------------------------------------------- |
| `initialize_metadata_db`   | メタデータ用データベースを初期化します。     |
| `create_file_metadata`     | 新しいファイルメタデータを作成します。       |
| `save_file_metadata`       | ファイルメタデータを保存します。             |
| `search_file_metadata`     | ファイルメタデータを検索します。             |
| `update_file_metadata`     | ファイルメタデータを更新します。             |
| `delete_file_metadata`     | ファイルメタデータを削除します。             |
| `get_all_tags`             | 全てのタグを取得します。                     |

---

## 7. アップロードシステムAPI (`upload_system`)

| コマンド名                      | 説明                                           |
| ------------------------------- | ---------------------------------------------- |
| `initialize_upload_queue`       | アップロードキューを初期化します。             |
| `open_file_dialog`              | ファイル選択ダイアログを開きます。             |
| `add_files_to_upload_queue`     | 複数のファイルをアップロードキューに追加します。 |
| `remove_upload_item`            | アップロードキューから項目を削除します。       |
| `start_upload_processing`       | アップロード処理を開始します。                 |
| `stop_upload_processing`        | アップロード処理を停止します。                 |
| `get_upload_queue_status`       | アップロードキューの状態を取得します。         |
| `get_upload_queue_items`        | アップロードキュー内の項目一覧を取得します。   |
| `retry_upload_item`             | 失敗したアップロード項目を再試行します。       |
| `clear_upload_queue`            | アップロードキューをクリアします。             |
| `test_upload_config`            | アップロード設定をテストします。               |

---

## 8. ライフサイクル管理API (`lifecycle`)

| コマンド名                     | 説明                                                               |
| ------------------------------ | ------------------------------------------------------------------ |
| `enable_reelvault_lifecycle`   | ReelVault推奨のS3ライフサイクルポリシーを有効化します。              |
| `get_lifecycle_status`         | 現在のライフサイクル設定のステータスを取得します。                 |
| `disable_lifecycle_policy`     | S3バケットのライフサイクルポリシーを無効化します。                 |
| `list_lifecycle_rules`         | 現在のライフサイクルルール一覧を取得します。                       |
| `validate_lifecycle_config`    | ライフサイクル設定の有効性を検証します。                           |
| `check_upload_readiness`       | アップロードの前提条件（認証、バケット設定など）が整っているか確認します。 |
