#!/usr/bin/env python3
"""
GitHub リポジトリに必要なラベルを一括作成するスクリプト
"""
import subprocess
import sys

REPO = "CIVICTECH-TV/ReelVault"

LABELS = [
    # Core functionality
    ("database", "Database related tasks", "673AB7"),
    ("config", "Configuration management", "795548"),
    ("logging", "Logging and error handling", "FF5722"),
    ("error", "Error handling", "F44336"),
    ("testing", "Testing related", "4CAF50"),
    ("quality", "Code quality", "8BC34A"),
    
    # Web UI
    ("flask", "Flask web framework", "00BCD4"),
    ("dashboard", "Dashboard functionality", "2196F3"),
    ("ui", "User interface", "3F51B5"),
    
    # Integration
    ("integration", "External integrations", "9C27B0"),
    ("premiere", "Premiere Pro integration", "E91E63"),
    ("export", "Export functionality", "FF4081"),
    ("davinci", "DaVinci Resolve integration", "C2185B"),
    
    # Mobile/Notification
    ("notification", "Notification system", "FF9800"),
    ("mobile", "Mobile applications", "FF5722"),
    ("ios", "iOS application", "607D8B"),
    ("android", "Android application", "4CAF50"),
    
    # Team/Business
    ("team", "Team functionality", "795548"),
    ("collaboration", "Collaboration features", "8BC34A"),
    ("license", "License management", "FFC107"),
    ("billing", "Billing system", "FFD700"),
    
    # DevOps/Infrastructure
    ("security", "Security related", "F44336"),
    ("audit", "Security audit", "D32F2F"),
    ("performance", "Performance optimization", "FF5722"),
    ("optimization", "Code optimization", "FF9800"),
    ("devops", "DevOps related", "607D8B"),
    ("cicd", "CI/CD pipeline", "2196F3"),
    
    # Documentation
    ("documentation", "Documentation", "1976D2"),
]

def run_command(command):
    """コマンドを実行"""
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Error: {result.stderr.strip()}")
            return False
        return True
    except Exception as e:
        print(f"Exception: {e}")
        return False

def create_label(name, description, color):
    """ラベルを作成"""
    cmd = f'gh label create "{name}" --description "{description}" --color "{color}" --repo "{REPO}"'
    print(f"Creating label: {name}")
    
    if run_command(cmd):
        print(f"✓ Created label: {name}")
        return True
    else:
        print(f"✗ Failed to create label: {name}")
        return False

def main():
    """メイン処理"""
    print(f"Creating labels for repository: {REPO}")
    print("=" * 50)
    
    success_count = 0
    total_count = len(LABELS)
    
    for name, description, color in LABELS:
        if create_label(name, description, color):
            success_count += 1
        print("-" * 30)
    
    print(f"\nSummary: {success_count}/{total_count} labels created successfully")

if __name__ == "__main__":
    main() 