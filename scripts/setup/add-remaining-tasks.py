#!/usr/bin/env python3
"""
失敗したタスクを個別に作成してプロジェクトに追加するスクリプト
"""
import subprocess
import sys

PROJECT_NUMBER = 5
OWNER = "CIVICTECH-TV"
REPO = "CIVICTECH-TV/ReelVault"

# 失敗したタスクのリスト
FAILED_TASKS = [
    {
        "title": "AWS認証・設定管理機能",
        "description": "AWS CLI設定の読み込み、S3クライアントの初期化、認証エラーハンドリング",
        "labels": "aws,auth",
        "priority": "High",
        "milestone": "v1.0",
        "estimate": "3"
    },
    {
        "title": "S3 → Deep Archive自動移行設定",
        "description": "ライフサイクルポリシーによる1日後のDeep Archive移行設定",
        "labels": "aws,lifecycle",
        "priority": "Medium",
        "milestone": "v1.0",
        "estimate": "2"
    },
    {
        "title": "メタデータ管理システム",
        "description": "アップロードファイルの情報管理（SQLite使用）、検索機能",
        "labels": "metadata,database",
        "priority": "Medium",
        "milestone": "v1.0",
        "estimate": "4"
    },
    {
        "title": "設定ファイル管理",
        "description": "YAML/JSON形式の設定ファイル、初期設定ウィザード",
        "labels": "config,core",
        "priority": "Low",
        "milestone": "v1.0",
        "estimate": "2"
    },
    {
        "title": "エラーハンドリング・ログ機能",
        "description": "包括的なエラーハンドリング、ログファイル出力、デバッグモード",
        "labels": "logging,error",
        "priority": "Medium",
        "milestone": "v1.0",
        "estimate": "3"
    },
    {
        "title": "単体テスト・統合テスト",
        "description": "pytest使用、モック機能、CI/CD準備",
        "labels": "testing,quality",
        "priority": "Medium",
        "milestone": "v1.0",
        "estimate": "4"
    },
    {
        "title": "Flask Webアプリ基盤構築",
        "description": "Flask基盤、テンプレート設計、セッション管理",
        "labels": "web,flask",
        "priority": "High",
        "milestone": "v1.1",
        "estimate": "3"
    },
    {
        "title": "Web UI - 進捗管理ダッシュボード",
        "description": "アップロード状況、復元状況の一覧表示、リアルタイム更新",
        "labels": "web,dashboard",
        "priority": "Medium",
        "milestone": "v1.1",
        "estimate": "4"
    },
    {
        "title": "Web UI - 設定管理画面",
        "description": "AWS設定、アプリ設定の Web UI管理",
        "labels": "web,config",
        "priority": "Low",
        "milestone": "v1.1",
        "estimate": "2"
    },
    {
        "title": "Responsive デザイン対応",
        "description": "モバイル・タブレット対応、モダンなUI/UX",
        "labels": "web,ui",
        "priority": "Low",
        "milestone": "v1.1",
        "estimate": "3"
    },
    {
        "title": "Premiere Pro連携調査・設計",
        "description": "Premiere Pro API調査、プラグイン仕様検討",
        "labels": "integration,premiere",
        "priority": "Medium",
        "milestone": "v1.2",
        "estimate": "5"
    },
    {
        "title": "エクスポート先選択機能",
        "description": "編集ソフトからReelVaultへの直接エクスポート機能",
        "labels": "integration,export",
        "priority": "Medium",
        "milestone": "v1.2",
        "estimate": "8"
    },
    {
        "title": "DaVinci Resolve連携調査",
        "description": "DaVinci Resolve連携の技術調査",
        "labels": "integration,davinci",
        "priority": "Low",
        "milestone": "v1.2",
        "estimate": "3"
    },
    {
        "title": "通知システム基盤",
        "description": "プッシュ通知、メール通知の基盤構築",
        "labels": "notification,mobile",
        "priority": "Medium",
        "milestone": "v2.0",
        "estimate": "5"
    },
    {
        "title": "iOS アプリ開発",
        "description": "Swift使用、復元通知、状況モニタリング",
        "labels": "mobile,ios",
        "priority": "Low",
        "milestone": "v2.0",
        "estimate": "14"
    },
    {
        "title": "Android アプリ開発",
        "description": "Kotlin使用、復元通知、状況モニタリング",
        "labels": "mobile,android",
        "priority": "Low",
        "milestone": "v2.0",
        "estimate": "14"
    },
    {
        "title": "チーム機能設計",
        "description": "ユーザー管理、権限設定、共有機能の設計",
        "labels": "team,collaboration",
        "priority": "Low",
        "milestone": "v2.1",
        "estimate": "7"
    },
    {
        "title": "ライセンス管理システム",
        "description": "Studioプラン、課金システム連携",
        "labels": "license,billing",
        "priority": "Low",
        "milestone": "v2.1",
        "estimate": "10"
    },
    {
        "title": "セキュリティ監査・対応",
        "description": "セキュリティベストプラクティス適用、脆弱性チェック",
        "labels": "security,audit",
        "priority": "High",
        "milestone": "v1.0",
        "estimate": "4"
    },
    {
        "title": "パフォーマンス最適化",
        "description": "大容量ファイル対応、並列処理、キャッシュ機能",
        "labels": "performance,optimization",
        "priority": "Low",
        "milestone": "v1.1",
        "estimate": "5"
    },
    {
        "title": "CI/CD パイプライン構築",
        "description": "GitHub Actions、自動テスト、デプロイメント",
        "labels": "devops,cicd",
        "priority": "Medium",
        "milestone": "v1.0",
        "estimate": "4"
    }
]

def run_gh_command(command):
    """gh コマンドを実行して結果を返す"""
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Error: {result.stderr.strip()}")
            return None
        return result.stdout.strip()
    except Exception as e:
        print(f"Exception: {e}")
        return None

def create_issue(task):
    """Issue を作成して issue URL を返す"""
    title = task["title"]
    description = task["description"]
    labels = task["labels"]
    priority = task["priority"]
    milestone = task["milestone"]
    estimate = task["estimate"]
    
    # 詳細な説明を作成
    detailed_description = f"""{description}

**優先度**: {priority}
**マイルストーン**: {milestone}
**見積もり**: {estimate}日"""
    
    # Issue作成コマンド
    cmd = f'gh issue create --repo {REPO} --title "{title}" --body "{detailed_description}" --label "{labels}"'
    
    print(f"Creating issue: {title}")
    result = run_gh_command(cmd)
    
    if result:
        print(f"✓ Created issue: {result}")
        return result
    return None

def add_issue_to_project(issue_url):
    """Issue をプロジェクトに追加"""
    cmd = f'gh project item-add {PROJECT_NUMBER} --owner {OWNER} --url "{issue_url}"'
    print(f"Adding issue to project: {issue_url}")
    
    result = run_gh_command(cmd)
    if result:
        print(f"✓ Added to project")
        return True
    return False

def main():
    """メイン処理"""
    print(f"Creating remaining tasks for project: {PROJECT_NUMBER}")
    print("=" * 60)
    
    success_count = 0
    total_count = len(FAILED_TASKS)
    
    for task in FAILED_TASKS:
        # Issue を作成
        issue_url = create_issue(task)
        
        if issue_url:
            # プロジェクトに追加
            if add_issue_to_project(issue_url):
                success_count += 1
        
        print("-" * 40)
    
    print(f"\nSummary: {success_count}/{total_count} tasks created and added successfully")

if __name__ == "__main__":
    main() 