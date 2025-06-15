# ReelVault 開発者ガイド

このドキュメントは、ReelVaultプロジェクトの開発者向けの情報を提供します。
プロジェクトへのコントリビュートを検討している方は、まずこちらをお読みください。

## 🚀 開発環境のセットアップ

### 1. 前提条件のインストール

macOS環境での開発を前提としています。

- **Node.js**: v18以上を推奨します。[公式サイト](https://nodejs.org/)からインストールしてください。
- **Rust**: 公式の`rustup`インストーラを使用します。
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
- **Tauri CLI**: Rustのパッケージマネージャーである`cargo`を使ってインストールします。
  ```bash
  cargo install tauri-cli
  ```

### 2. プロジェクトのクローンとセットアップ

```bash
# プロジェクトをクローン
git clone https://github.com/CIVICTECH-TV/ReelVault.git
cd ReelVault

# フロントエンドの依存関係をインストール
npm install

# Rustの依存関係をビルド（初回は時間がかかります）
cd src-tauri
cargo build
cd ..
```

### 3. 開発サーバーの起動

以下のコマンドで、開発モードのアプリケーションが起動します。フロントエンドやバックエンドのソースコードを変更すると、自動的に再ビルドされます。

```bash
cargo tauri dev
```

## 🏗️ プロジェクト構造

プロジェクトの主要なディレクトリとファイルは以下の通りです。

```
ReelVault/
├── src/                     # React フロントエンド
│   ├── components/          # Reactコンポーネント（AWS認証・設定UI含む）
│   ├── pages/               # ページコンポーネント
│   ├── hooks/               # カスタムフック
│   └── types/               # TypeScript型定義（28個API対応）
├── src-tauri/               # Tauri バックエンド (Rust)
│   ├── src/
│   │   ├── commands/        # Tauriコマンド（28個API実装済み）
│   │   │   ├── aws_auth.rs    # AWS認証・Keychain連携
│   │   │   ├── config.rs      # 設定管理・JSON永続化
│   │   │   ├── file_ops.rs    # ファイル操作
│   │   │   ├── aws_ops.rs     # AWS S3操作
│   │   │   └── state_mgmt.rs  # 状態管理
│   │   └── main.rs          # メインモジュール
│   └── Cargo.toml           # Rust依存関係（AWS SDK・keyring）
├── infrastructure/          # AWS CloudFormation
│   ├── s3-buckets.yaml      # S3バケット設定
│   └── iam-roles.yaml       # IAMロール設定
├── docs/                    # ドキュメント
│   └── api/                 # API仕様書
└── DEVELOPER_GUIDE.md       # 開発者ガイド (このファイル)
```

## 🧪 テスト

品質を保つため、いくつかのテストを用意しています。

```bash
# フロントエンドのユニットテスト (Jest)
npm test

# Rustのユニットテスト
cd src-tauri
cargo test
cd ..

# E2Eテスト (Playwright)
npm run test:e2e
```

## 📦 ビルド

アプリケーションを配布用にビルドします。

```bash
# デバッグビルド
cargo tauri build --debug

# リリースビルド
cargo tauri build
```

ビルドされたアプリーケーションは `src-tauri/target/release/bundle/` の下に作成されます。

## 🤝 コントリビューション

ReelVault はオープンソースプロジェクトです。バグ報告、機能要望、プルリクエストを歓迎しています。

### 開発フロー

1.  このリポジトリをフォークします。
2.  作業内容に応じたフィーチャーブランチを作成します (`git checkout -b feature/amazing-feature`)。
3.  変更をコミットします (`git commit -m 'Add amazing feature'`)。
4.  作成したブランチにプッシュします (`git push origin feature/amazing-feature`)。
5.  プルリクエストを作成し、変更内容を説明してください。

### コードスタイル

- **TypeScript**: ESLint + Prettier に従います。コミット前に`npm run lint`と`npm run format`を実行してください。
- **Rust**: `rustfmt` と `clippy` に従います。`cargo fmt` と `cargo clippy` を実行してください。 