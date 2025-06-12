# ReelVault（リールボルト）

映像制作者向け長期アーカイブストレージ補助ツール

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🎯 概要

ReelVault は、映像制作者が制作済みの映像プロジェクト・素材・納品ファイルを、AWS S3 Deep Archive を活用して安全かつ簡単に長期保管・復元できるデスクトップアプリケーションです。

## 💡 対象ユーザー

- **映像フリーランス**（1人制作／副業編集者）
- **小規模プロダクション**（10人以下）
- **ITリテラシーが高くない映像制作者**

## 🚀 解決する課題

- 撮影・編集後の素材のバックアップ先がない
- NASやローカルHDDでは信頼性・容量に限界がある
- AWSの設定やコマンド操作を覚えるのは困難
- 映像ファイルの長期保存に適したUXが存在しない

## ✨ サービスの特徴

### 🔒 セキュリティ・責任の明確化
- **AWSアカウントはユーザー自身で所有**し、データ管理の責任を明確化
- 法的・心理的な「二重課金」リスクを回避

### 📦 自動アーカイブ機能
- S3標準ストレージに一時保存後、**自動でDeep Archiveへ移行**（1日後）
- コスト効率的な長期保存を実現

### 🖥️ 使いやすいデスクトップアプリ
- **Tauri**ベースのネイティブデスクトップアプリケーション
- **React + TypeScript**による直感的なユーザーインターフェース
- **3画面ナビゲーション**: APIテスト・AWS認証・設定管理
- **macOS Keychain統合**: セキュアな認証情報保存
- **リアルタイム検証**: AWS接続・S3アクセス権の即座確認

### 🔐 セキュリティ機能
- **暗号化保存**: Ring暗号化ライブラリによる認証情報保護
- **Keychain統合**: macOSシステム標準のセキュア保存
- **実認証**: AWS STS `get_caller_identity`による確実な接続確認
- **権限検証**: S3バケットアクセス権の事前チェック

## 🛠 技術スタック

### フロントエンド
- **Framework**: Tauri 2.0
- **UI**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: CSS3 + Flexbox

### バックエンド
- **Language**: Rust
- **AWS SDK**: AWS SDK for Rust (S3, STS, Credentials)
- **Security**: macOS Keychain integration (keyring)
- **Encryption**: Ring cryptography library
- **Storage**: AWS S3 + Deep Archive
- **Infrastructure**: AWS CloudFormation

### 開発・運用
- **Version Control**: Git + GitHub
- **CI/CD**: GitHub Actions
- **Project Management**: GitHub Projects
- **Documentation**: Markdown

## 📋 システム要件

- **OS**: macOS 10.15+ (Windows, Linux対応は今後予定)
- **AWSアカウント**（ユーザー自身で作成・管理）
- **開発環境**:
  - Node.js 18+
  - Rust 1.70+
  - Tauri CLI

> **注意**: 現在はmacOS環境でのみ開発・テストを行っています。Windows・Linux対応は将来のバージョンで実装予定です。

## 🚀 開発環境のセットアップ

### 1. 前提条件のインストール

```bash
# Node.js (推奨: v18以上)
# https://nodejs.org/ からダウンロード

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Tauri CLI
cargo install tauri-cli
```

### 2. プロジェクトのクローン

```bash
git clone https://github.com/CIVICTECH-TV/ReelVault.git
cd ReelVault
```

### 3. 依存関係のインストール

```bash
# フロントエンド依存関係
npm install

# Rust依存関係
cd src-tauri
cargo build
cd ..
```

### 4. 開発サーバーの起動

```bash
# 開発モードで起動
cargo tauri dev
```

## 🏗️ プロジェクト構造

```
ReelVault/
├── src/                     # React フロントエンド
│   ├── components/          # Reactコンポーネント（AWS認証・設定UI含む）
│   ├── pages/              # ページコンポーネント
│   ├── hooks/              # カスタムフック
│   └── types/              # TypeScript型定義（28個API対応）
├── src-tauri/              # Tauri バックエンド (Rust)
│   ├── src/
│   │   ├── commands/       # Tauriコマンド（28個API実装済み）
│   │   │   ├── aws_auth.rs    # AWS認証・Keychain連携
│   │   │   ├── config.rs      # 設定管理・JSON永続化
│   │   │   ├── file_ops.rs    # ファイル操作
│   │   │   ├── aws_ops.rs     # AWS S3操作
│   │   │   └── state_mgmt.rs  # 状態管理
│   │   └── main.rs         # メインモジュール
│   └── Cargo.toml          # Rust依存関係（AWS SDK・keyring）
├── infrastructure/         # AWS CloudFormation
│   ├── s3-buckets.yaml    # S3バケット設定
│   └── iam-roles.yaml     # IAMロール設定
├── docs/                   # ドキュメント
│   └── api/               # API仕様書
└── scripts/               # 自動化スクリプト
```

## 📊 開発状況

### Phase 1: インフラストラクチャ基盤 ✅ **完了**

- ✅ AWS CloudFormation テンプレート作成
- ✅ Tauri + React + TypeScript基盤構築
- ✅ Tauri Command API実装（28個のAPI） (Issue #33)
- ✅ AWS認証・設定管理機能（macOS Keychain統合） (Issue #9)
- ✅ 設定ファイル管理（JSON永続化・バックアップ機能） (Issue #12)
- ✅ Epic1完全実装（3画面UIナビゲーション対応）

**進捗**: 6/6 完了 (**100%** ✅)

### Phase 2: ファイル処理エンジン

- ✅ **ファイル管理システム**: 高速スキャン・重複検出・メタデータ抽出 (実装済み)
  - SQLiteベースのメタデータDB管理
  - SHA256ハッシュによる重複検出
  - 動画メタデータ抽出・検索機能
  - カスタムタグ・フィールド管理
- ✅ **アップロードエンジン**: マルチパート・バックグラウンド・進捗監視 (実装済み)
  - 並行アップロード対応（設定可能な同時実行数）
  - リアルタイム進捗追跡・速度計測
  - リトライ機能・エラーハンドリング
  - バッチ処理・キュー管理
- ✅ **復元システム**: Deep Archive復元・自動ダウンロード・整合性検証 (Issue #5)
  - 3つの復元ティア対応（Standard/Expedited/Bulk）
  - 30秒間隔の自動監視システム
  - 復元完了・失敗通知機能
  - 復元ファイルの自動ダウンロード

#### 🎉 復元機能実装完了 (Issue #5)
- ✅ **復元リクエスト機能** - 3つのティア対応（Standard/Expedited/Bulk）
- ✅ **状況監視システム** - 30秒間隔の自動ポーリング  
- ✅ **通知機能** - 復元完了・失敗通知
- ✅ **ダウンロード機能** - 復元ファイルのローカル保存
- ✅ **統合テスト環境** - APIテスト画面での簡単動作確認

**進捗**: 3/3 完了 (**100%** ✅)

### 🚀 Phase 3: ユーザーインターフェース

- ✅ **統合ナビゲーション**: 3画面統合UI（APIテスト・AWS認証・設定管理）
- ✅ **AWS認証UI**: セキュアな認証フロー・リアルタイム検証
- ✅ **設定管理UI**: 包括的な設定画面・JSON管理・バックアップ機能
- ✅ **APIテスト環境**: 統合テスト画面・リアルタイム結果表示
- ✅ **復元管理UI**: ファイル選択・進捗監視・通知システム

**進捗**: 5/5 完了 (**100%** ✅)

### 📅 今後の予定

- **Phase 4**: 品質・運用基盤（テスト・CI/CD・監視）
- **Phase 5**: 実本番対応（実AWS統合・パフォーマンス最適化）

詳細は [GitHub Projects](https://github.com/CIVICTECH-TV/ReelVault/projects) をご覧ください。

## 🧪 テスト

```bash
# フロントエンドテスト
npm test

# Rustテスト
cd src-tauri
cargo test
cd ..

# E2Eテスト
npm run test:e2e
```

## 📦 ビルド

```bash
# デバッグビルド
cargo tauri build --debug

# リリースビルド
cargo tauri build
```

## 🤝 コントリビューション

ReelVault はオープンソースプロジェクトです。バグ報告、機能要望、プルリクエストを歓迎しています。

### 開発フロー

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

### コードスタイル

- **TypeScript**: ESLint + Prettier
- **Rust**: cargo fmt + clippy
- **コミットメッセージ**: [Conventional Commits](https://conventionalcommits.org/)

## 📝 ライセンス

MIT License - 詳細は [LICENSE](LICENSE) ファイルをご覧ください。

## 📞 サポート

- **Issues**: [GitHub Issues](https://github.com/CIVICTECH-TV/ReelVault/issues) でバグ報告や機能要望
- **Discussions**: [GitHub Discussions](https://github.com/CIVICTECH-TV/ReelVault/discussions) で質問や議論
- **Wiki**: [詳細ドキュメント](https://github.com/CIVICTECH-TV/ReelVault/wiki)

## 🏷 ロードマップ

- [x] **v0.1**: インフラ基盤・AWS認証・設定管理 ✅ **完了**
- [x] **v0.2**: ファイル処理エンジン・アップロード機能 ✅ **完了**  
- [x] **v0.3**: UI/UX最適化・統合テスト環境 ✅ **完了**
- [ ] **v0.4**: 実AWS統合・パフォーマンス最適化
- [ ] **v1.0**: 安定版リリース・品質保証
- [ ] **v1.1**: 編集ソフト連携（Premiere Pro / DaVinci Resolve）
- [ ] **v2.0**: チーム機能・複数ユーザー対応

---

**ReelVault** - 映像制作者のためのデスクトップアーカイブツール

Made with ❤️ by [CIVICTECH-TV](https://github.com/CIVICTECH-TV) 