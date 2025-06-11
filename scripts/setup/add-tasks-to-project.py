#!/usr/bin/env python3
"""
GitHub Projectsにタスクを追加するスクリプト
CSVファイルからデータを読み込んでgh CLIを使用してタスクを追加
"""
import csv
import subprocess
import json
import sys

PROJECT_NUMBER = 5
OWNER = "CIVICTECH-TV"
REPO = "CIVICTECH-TV/ReelVault"

def run_gh_command(command):
    """gh コマンドを実行して結果を返す"""
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Error running command: {command}")
            print(f"Error: {result.stderr}")
            return None
        return result.stdout.strip()
    except Exception as e:
        print(f"Exception running command: {command}")
        print(f"Exception: {e}")
        return None

def create_issue(title, description, labels):
    """Issue を作成して issue URL を返す"""
    labels_str = ','.join(labels.split(',')) if labels else ""
    
    # Issue作成コマンド
    cmd = f'gh issue create --repo {REPO} --title "{title}" --body "{description}"'
    if labels_str:
        cmd += f' --label "{labels_str}"'
    
    print(f"Creating issue: {title}")
    result = run_gh_command(cmd)
    
    if result:
        print(f"✓ Created issue: {result}")
        return result
    return None

def add_issue_to_project(issue_url, project_number):
    """Issue をプロジェクトに追加"""
    cmd = f'gh project item-add {project_number} --owner {OWNER} --url "{issue_url}"'
    print(f"Adding issue to project: {issue_url}")
    
    result = run_gh_command(cmd)
    if result:
        print(f"✓ Added to project")
        return True
    return False

def main():
    """メイン処理"""
    print(f"Starting task import to project: {PROJECT_NUMBER}")
    
    # CSVファイルを読み込み
    csv_file = "project-plan.csv"
    
    try:
        with open(csv_file, 'r', encoding='utf-8') as file:
            reader = csv.DictReader(file)
            
            for row in reader:
                title = row['Title']
                description = row['Description']
                labels = row['Labels']
                priority = row['Priority']
                milestone = row['Milestone']
                estimate = row['Estimate']
                
                # 詳細な説明を作成
                detailed_description = f"""
{description}

**優先度**: {priority}
**マイルストーン**: {milestone}
**見積もり**: {estimate}日
**ラベル**: {labels}
                """.strip()
                
                # Issue を作成
                issue_url = create_issue(title, detailed_description, labels)
                
                if issue_url:
                    # プロジェクトに追加
                    add_issue_to_project(issue_url, PROJECT_NUMBER)
                    print("---")
                else:
                    print(f"Failed to create issue: {title}")
                    print("---")
    
    except FileNotFoundError:
        print(f"Error: {csv_file} not found")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
    
    print("Task import completed!")

if __name__ == "__main__":
    main() 