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

### 💰 料金体系・機能制限

#### 🆓 **無料版（AWS S3コンソール相当）**
- **アップロード**: 最大160GB、単発処理、基本進捗表示
- **ダウンロード**: 単発処理、レジューム機能なし
- **対象**: 個人ユーザー・小規模利用

#### 💎 **プレミアム版（エンタープライズ機能）**
- **高速アップロード**: 最大8並列、動的最適化、監視フォルダ自動処理
- **高速ダウンロード**: マルチパート、レジューム機能、帯域制御
- **対象**: プロフェッショナル・大容量処理ユーザー

> **設計思想**: AWS S3コンソールと同等の無料機能を提供し、プレミアム機能で差別化

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

### Phase 1: v1.0 常駐アプリ基盤 🚧 **進行中**

#### Epic1: インフラストラクチャ基盤 ✅ **完了**
- ✅ AWS CloudFormation テンプレート作成
- ✅ Tauri + React + TypeScript基盤構築
- ✅ Tauri Command API実装（28個のAPI） (Issue #33)
- ✅ AWS認証・設定管理機能（macOS Keychain統合） (Issue #9)
- ✅ 設定ファイル管理（JSON永続化・バックアップ機能） (Issue #12)
- ✅ S3ライフサイクル管理・コスト最適化 (Issue #10)
- ✅ 統合UI: 3画面ナビゲーション対応

#### Epic2: ファイル処理エンジン ✅ **完了**
- ✅ **ファイル操作API**: notify crate・セキュリティ・非同期処理 (Issue #40)
- ✅ **ファイル監視システム**: リアルタイム監視・自動検知 (Issue #30)
- ✅ **メタデータ管理**: SQLiteベース・自動抽出・検索機能 (Issue #11)
- ✅ **アップロードエンジン**: S3マルチパート・進捗監視・リトライ (Issue #4)
- ✅ **バックグラウンド処理**: キューシステム・並行実行 (Issue #31)
- ✅ **復元システム**: Deep Archive復元・自動監視・通知 (Issue #5)

#### Epic3: ユーザーインターフェース 🔄 **準備中**
- [ ] **シンプルアップロードUI**: 無料版基本機能・AWS S3コンソール相当 (Issue #57)
- [ ] **高度なアップロード機能**: プレミアム版・監視フォルダ・並列処理 (Issue #59)
- [ ] **高速ダウンロード機能**: プレミアム版・マルチパート・レジューム (Issue #61)
- [ ] **状態管理・UI連携API**: アプリケーション状態管理・キュー管理 (Issue #41)
- [ ] **システムトレイUI**: 常駐アプリUI・進捗表示・通知システム (Issue #32)

#### Epic4: 品質・運用基盤 🔄 **準備中**
- [ ] **エラーハンドリング・ログシステム**: 包括的エラー処理・運用監視
- [ ] **自動テスト・CI/CDパイプライン**: 品質保証・デプロイ自動化
- [ ] **セキュリティ監査・運用ドキュメント**: セキュリティ強化・保守性向上

**進捗**: 2/4 Epic完了 (**50%** 🚧)

### 📅 今後の予定

#### Phase 2: v1.1 SaaS統合
- [ ] **SaaS API基盤**: ユーザー管理・AWS環境自動構築
- [ ] **Tauri↔SaaS連携**: 設定同期・オフライン対応
- [ ] **管理ダッシュボード**: 使用量監視・コスト分析

#### Phase 3: v1.2 編集ソフト連携  
- [ ] **Premiere Pro連携**: エクスポート連携・自動アップロード
- [ ] **DaVinci Resolve連携**: ワークフロー統合
- [ ] **プラグイン開発**: 編集ソフト統合機能

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

## 📚 ドキュメント

詳細な技術ドキュメント、実装ガイド、テスト手順については以下をご覧ください：

- **📖 [ドキュメント一覧](docs/README.md)**: 包括的なドキュメント構造ガイド
- **🔧 [実装ドキュメント](docs/implementation/)**: 技術実装詳細・ベストプラクティス
- **📋 [API仕様書](docs/api/tauri-command-api.md)**: Tauri Command API仕様
- **🧪 [テストガイド](docs/testing/)**: 手動テスト・品質保証手順
- **🎯 [機能実装記録](docs/features/)**: 完了した機能の実装記録
- **📊 [プロジェクト管理](docs/project-management/)**: 計画・進捗・Issue管理

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