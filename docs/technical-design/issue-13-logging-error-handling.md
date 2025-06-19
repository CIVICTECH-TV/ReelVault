# Issue #13: エラーハンドリングとロギング機能の実装方針

## 1. 背景と目的
Issue #13 は、アプリケーション全体におけるエラーハンドリングとロギングの仕組みを確立することを目的とする。

### 現状の課題
- **フロントエンド:** `console.log` が無秩序に使用されており、ログの追跡や管理が困難。
- **バックエンド:** `tauri_plugin_log`による基本的なロギングのみ。エラーハンドリングも統一されておらず、問題発生時の原因究明が難しい。
- **連携:** バックエンドで発生したエラーがユーザーにフィードバックされる仕組みがない。

## 2. 実装方針
提案するアーキテクチャは以下の通り。

### 2.1. バックエンド (Rust)
#### ロギング
- **ライブラリ:** `tracing` エコシステム (`tracing`, `tracing-subscriber`, `tracing-appender`, `tracing-log`) を導入し、構造化ロギングを実現する。
- **出力先:**
    - リリースビルド: ユーザーのログディレクトリに日次ローテーションされるファイル (`ReelVault.log`) へのみ出力。
    - デバッグビルド: 上記ファイルに加え、コンソールにも出力する。
- **互換性:** 既存の `log` クレートの呼び出しは `tracing-log` を使って `tracing` イベントにブリッジし、後方互換性を確保する。

#### エラーハンドリング
- **ライブラリ:**
    - `thiserror`: アプリケーション固有の詳細なカスタムエラー型を定義するために使用。
- **方針:** 
    - 内部ロジックでは `InternalError` 型を使用して型安全なエラーハンドリングを実現
    - Tauriコマンドの境界では `Result<T, String>` で統一し、`standardize_error` 関数で文字列化
    - `Result`型を徹底し、回復不能な場合を除き `panic!` の使用を避ける

### 2.2. フロントエンド (TypeScript)
#### ロギング
- **`logger` ユーティリティ:** Rustバックエンドを呼び出す、あるいはデバッグ時にコンソールに出力するハイブリッドな `logger` ユーティリティ (`src/utils/logger.ts`) を作成する。
- **`console.log` の禁止:** プロジェクト全体で `console.log` の直接使用を原則禁止し、`logger` ユーティリティ経由 (`logger.info()`, `logger.debug()` 等) でのログ出力を徹底する。
- **Tauriコマンド:** `log_message` のようなTauriコマンドを定義し、フロントエンドから `INFO` 以上のレベルのログをバックエンドに送信する。

#### UIへのエラー通知
- **Tauriイベント:** ユーザーに通知すべき重要なエラー（例: AWS認証失敗、ファイル保存失敗）は、バックエンドからTauriイベントとしてフロントエンドに送信する。
- **エラー表示コンポーネント:** イベントを購読し、画面にトーストやモーダルダイアログでエラーを通知する専用のUIコンポーネントを作成する。

### 2.3. ログレベル戦略
アプリケーションのログレベルは、シンプルさと明確さを重視し、以下の2つのモードで運用する。これは現在の設定 (`app_settings.log_level`) の思想を踏襲するものである。

- **通常モード (`info`):**
    - `INFO`, `WARN`, `ERROR` レベルのログを記録する。
    - アプリケーションの主要な動作状況や、警告、エラーを追跡するのに十分な情報を提供する。
- **デバッグモード (`debug`):**
    - `DEBUG`, `INFO`, `WARN`, `ERROR` レベルのログをすべて記録する。
    - 問題発生時の詳細なトラブルシューティングに使用する。

`TRACE`レベルは、今回の実装では使用しない。ユーザーはUIの設定画面から「デバッグモード」のON/OFFを切り替えることで、これらのモードを動的に変更できる。

## 3. 実装ステップ
1.  ✅ **ステップ1: バックエンドのロギング基盤構築**
    - `tracing`関連のクレートを`Cargo.toml`に追加。
    - `src-tauri/src/logger.rs` にロガー初期化処理を実装。
    - `src-tauri/src/lib.rs` でロガーをセットアップ。
    > このステップは、実装方針の技術的実現可能性を確認するための先行実装として完了済み。

2.  ✅ **ステップ2: バックエンドのエラー型定義**
    - `src-tauri/src/internal/error.rs` に `InternalError` 型を定義。
    - `thiserror` を用いて、`S3`, `Config`, `File`, `Auth` などのカスタムエラー型を定義。
    - `standardize_error` 関数で文字列化機能を実装。

3.  ✅ **ステップ3: 既存コードのリファクタリング (バックエンド)**
    - バックエンド全体の内部ロジックで `InternalError` 型を使用。
    - Tauriコマンドの戻り値を `Result<T, String>` で統一。
    - `unwrap()` や `expect()` の使用を見直し、適切なエラーハンドリングに修正。

4.  ✅ **ステップ4: フロントエンドのロガー実装**
    - `debug.ts` ユーティリティでログレベル制御を実装。

5.  ✅ **ステップ5: `console.log` の置き換え (フロントエンド)**
    - フロントエンド全体の `console.log`, `console.error` 等を、ステップ4で実装した `logger` ユーティリティの呼び出し (`logInfo`, `logDebug` 等) に置き換え。

6.  ✅ **ステップ6: UIエラー通知機能の実装**
    - エラー表示用のUIコンポーネントを実装。
    - Tauriイベントをリッスンし、エラー内容をUIで表示するロジックを実装。

## 4. 完了条件
- ✅ 全ての `console.log` が `logger` ユーティリティ経由に置き換えられている。
- ✅ バックエンドの主要なエラーが `InternalError` 型で定義され、適切にハンドリングされている。
- ✅ ユーザー影響のあるエラーがUI上に通知される。
- ✅ ログが指定されたファイルに正しく出力されている。

## 5. 実装詳細

### 5.1. エラーハンドリング設計
```rust
// 内部ロジック用エラー型
#[derive(Error, Debug)]
pub enum InternalError {
    #[error("AWS S3 error: {0}")]
    S3(String),
    #[error("Configuration error: {0}")]
    Config(String),
    #[error("File operation error: {0}")]
    File(String),
    // ... その他のエラー型
}

// Tauriコマンド境界での文字列化
pub fn standardize_error(e: InternalError) -> String {
    match e {
        InternalError::S3(e) => format!("AWS S3 error: {}", e),
        InternalError::Config(msg) => format!("Configuration error: {}", msg),
        // ... その他のエラー型
    }
}

// Tauriコマンドでの使用例
#[tauri::command]
pub async fn some_command() -> Result<T, String> {
    let result = internal_logic()
        .map_err(standardize_error)?;
    Ok(result)
}
```

### 5.2. ログシステム設計
- **バックエンド**: `tracing` エコシステムによる構造化ログ
- **フロントエンド**: `debug.ts` によるログレベル制御
- **ファイル出力**: 日次ローテーションで `/Users/kazuki/Library/Logs/com.civictech.reelvault/ReelVault.log` に保存 