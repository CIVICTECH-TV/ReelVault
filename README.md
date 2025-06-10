# ReelVault（リールボルト）

映像制作者向け長期アーカイブストレージ補助ツール

## 概要

ReelVault は、映像制作者が制作済みの映像プロジェクト・素材・納品ファイルを、AWS S3 Deep Archive を活用して安全かつ簡単に長期保管・復元できるツールです。

## 🎯 対象ユーザー

- **映像フリーランス**（1人制作／副業編集者）
- **小規模プロダクション**（10人以下）
- **ITリテラシーが高くない映像制作者**

## 💡 解決する課題

- 撮影・編集後の素材のバックアップ先がない
- NASやローカルHDDでは信頼性・容量に限界がある
- AWSの設定やコマンド操作を覚えるのは困難
- 映像ファイルの長期保存に適したUXが存在しない

## 🚀 サービスの特徴

### セキュリティ・責任の明確化
- **AWSアカウントはユーザー自身で所有**し、データ管理の責任を明確化
- 法的・心理的な「二重課金」リスクを回避

### 自動アーカイブ機能
- S3標準ストレージに一時保存後、**自動でDeep Archiveへ移行**（1日後）
- コスト効率的な長期保存を実現

### 使いやすいインターフェース
- **GUI / CLI / Web** での操作が可能
- コマンド実行・設定作成をスクリプトやアプリで簡略化
- 通知や進捗管理も含めた UX パッケージとして提供

## 🛠 技術スタック（初期段階）

- **ストレージ管理**: Rclone または AWS CLI
- **インフラ構築**: CloudFormation による自動バケット・ライフサイクル設定
- **Web UI**: Python + Flask によるミニWeb UI
- **プロジェクト管理**: GitHub Projects
- **タスク管理**: CSVベースのタスクインポート・管理

## 📋 システム要件

- AWSアカウント（ユーザー自身で作成・管理）
- Python 3.8以上
- AWS CLI または Rclone

## 🚀 クイックスタート

### 1. AWSアカウントの準備
```bash
# AWS CLIの設定
aws configure
```

### 2. ReelVaultのインストール
```bash
# リポジトリのクローン
git clone https://github.com/username/ReelVault.git
cd ReelVault

# 依存関係のインストール
pip install -r requirements.txt
```

### 3. 初期設定
```bash
# CloudFormationによるインフラ構築
python setup.py --deploy-infrastructure

# 設定ファイルの作成
python setup.py --create-config
```

### 4. Web UIの起動
```bash
# Webインターフェースの起動
python app.py
```

## 📱 使用方法

### アップロード
```bash
# CLI経由でのアップロード
reelvault upload /path/to/your/video/project

# Web UI経由
# http://localhost:5000 にアクセスしてファイルを選択
```

### 復元
```bash
# ファイルの復元リクエスト
reelvault restore project_name

# 復元状況の確認
reelvault status project_name
```

## 🔮 将来的な拡張

### 編集ソフト連携
- **Premiere Pro** や **DaVinci Resolve** との連携
- エクスポート先として ReelVault を選択可能

### モバイルアプリ
- **iOS/Android** アプリでの復元通知
- 保存状況のモニタリング

### チーム機能
- チーム共有やライセンス管理（**Studioプラン**）
- アーカイブ証明や保管証明（放送局・公的用途向け）

## 💰 料金体系

- **AWSストレージ費用**: ユーザーが直接AWSに支払い
- **ReelVaultツール**: オープンソース（無料）
- **追加サービス**（検討中）:
  - セットアップ支援
  - プレミアム機能の月額利用料

## 🤝 コントリビューション

ReelVault はオープンソースプロジェクトです。バグ報告、機能要望、プルリクエストを歓迎しています。

### 開発環境のセットアップ
```bash
# 開発用の依存関係をインストール
pip install -r requirements-dev.txt

# テストの実行
pytest tests/

# コードスタイルのチェック
flake8 src/
```

## 📝 ライセンス

MIT License

## 📞 サポート

- **Issues**: GitHub Issues でバグ報告や機能要望を受け付けています
- **Discussions**: 質問や議論は GitHub Discussions をご利用ください
- **Documentation**: 詳細なドキュメントは [Wiki](https://github.com/username/ReelVault/wiki) をご覧ください

## 🏷 ロードマップ

- [ ] **v1.0**: 基本的なアップロード・復元機能
- [ ] **v1.1**: Web UI の改善
- [ ] **v1.2**: 編集ソフト連携（Premiere Pro）
- [ ] **v2.0**: モバイルアプリ
- [ ] **v2.1**: チーム機能・Studioプラン

---

**ReelVault** - 映像制作者のためのアーカイブストレージソリューション 