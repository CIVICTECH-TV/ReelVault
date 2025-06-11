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
- システムトレイ常駐でバックグラウンド処理をサポート

## 🛠 技術スタック

### フロントエンド
- **Framework**: Tauri 2.0
- **UI**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: CSS3 + Flexbox

### バックエンド
- **Language**: Rust
- **HTTP Client**: AWS SDK for Rust
- **Storage**: AWS S3 + Deep Archive
- **Infrastructure**: AWS CloudFormation

### 開発・運用
- **Version Control**: Git + GitHub
- **CI/CD**: GitHub Actions
- **Project Management**: GitHub Projects
- **Documentation**: Markdown

## 📋 システム要件

- **OS**: macOS 10.15+ / Windows 10+ / Linux (Ubuntu 18.04+)
- **AWSアカウント**（ユーザー自身で作成・管理）
- **開発環境**:
  - Node.js 18+
  - Rust 1.70+
  - Tauri CLI

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
│   ├── components/          # Reactコンポーネント
│   ├── pages/              # ページコンポーネント
│   ├── hooks/              # カスタムフック
│   └── types/              # TypeScript型定義
├── src-tauri/              # Tauri バックエンド (Rust)
│   ├── src/
│   │   ├── commands/       # Tauriコマンド
│   │   ├── aws/           # AWS操作モジュール
│   │   └── config/        # 設定管理
│   └── Cargo.toml
├── infrastructure/         # AWS CloudFormation
│   ├── s3-buckets.yaml    # S3バケット設定
│   └── iam-roles.yaml     # IAMロール設定
└── docs/                   # ドキュメント
```

## 📊 開発状況

### Phase 1: インフラストラクチャ基盤 (進行中)

- ✅ AWS CloudFormation テンプレート作成
- ✅ Tauri + React + TypeScript基盤構築
- ⏳ Tauri Command API実装 (Issue #33)
- ⏳ AWS認証・設定管理機能 (Issue #9)
- ⏳ 設定ファイル管理 (Issue #12)

**進捗**: 3/6 完了 (50%)

### 今後の予定

- **Phase 2**: ファイル処理エンジン
- **Phase 3**: ユーザーインターフェース
- **Phase 4**: 品質・運用基盤

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

- [ ] **v0.1**: 基本的なアップロード・復元機能
- [ ] **v0.2**: システムトレイ機能
- [ ] **v0.3**: バックグラウンドアップロード
- [ ] **v1.0**: 安定版リリース
- [ ] **v1.1**: 編集ソフト連携（Premiere Pro / DaVinci Resolve）
- [ ] **v2.0**: チーム機能・複数ユーザー対応

---

**ReelVault** - 映像制作者のためのデスクトップアーカイブツール

Made with ❤️ by [CIVICTECH-TV](https://github.com/CIVICTECH-TV) 