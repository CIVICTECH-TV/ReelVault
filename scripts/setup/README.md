# ReelVault セットアップスクリプト

このディレクトリには、GitHub Projects と Issue の初期セットアップで使用したスクリプトが含まれています。

## 🔧 スクリプト一覧

### `create-labels.py`
**用途**: GitHub リポジトリに必要なラベルを一括作成
**作成ラベル**: 28個（AWS、Web UI、統合、モバイル、DevOps等のカテゴリー）
**実行**: `python3 create-labels.py`

### `add-tasks-to-project.py` 
**用途**: CSVファイルからタスクを読み込んでGitHub Projectsに追加（初期版）
**データソース**: `../docs/project-management/project-plan.csv`
**実行**: `python3 add-tasks-to-project.py`

### `add-remaining-tasks.py`
**用途**: 失敗したタスクを個別に再作成してプロジェクトに追加
**対象**: 21個の追加タスク
**実行**: `python3 add-remaining-tasks.py`

## 🔄 将来の用途

これらのスクリプトは以下の場面で再利用可能です：

### 新しいリポジトリ作成時
- ラベル体系の統一
- 標準的なプロジェクト構造の適用

### プロジェクト拡張時
- 新しいフェーズのタスク追加
- チーム向けの別プロジェクト作成

### 他プロダクトへの応用
- ReelVault の構造をベースとした新プロダクト
- 映像制作ツール開発のテンプレート

## 📋 依存関係

- **GitHub CLI (`gh`)**: 認証とAPIアクセス
- **Python 3.8+**: スクリプト実行環境
- **適切な権限**: リポジトリとプロジェクトへの書き込み権限

## 🚨 注意事項

- スクリプト内のプロジェクト番号・リポジトリ名は環境に応じて変更が必要
- 既存のラベルがある場合は重複エラーが発生する可能性
- 大量のAPI呼び出しを行うため、レート制限に注意

## 📚 関連ドキュメント

- [`../docs/project-management/`](../docs/project-management/) - プロジェクト管理ドキュメント
- [`PROJECT_SETUP_SUMMARY.md`](../docs/project-management/PROJECT_SETUP_SUMMARY.md) - セットアップ完了サマリー 