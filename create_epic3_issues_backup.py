#!/usr/bin/env python3
"""
Epic3新Issue構造作成スクリプト
- シンプルアップロードUI実装 (#42)
- RestoreManager統合 (#43)
- 高度なアップロード機能 (#44) - 有料機能
"""

import subprocess
import json
import time
import os

def run_gh_command(command):
    """gh CLI実行の共通関数"""
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True, encoding='utf-8')
        if result.returncode != 0:
            print(f"❌ コマンド実行エラー: {command}")
            print(f"エラー出力: {result.stderr}")
            return None
        return result.stdout.strip()
    except Exception as e:
        print(f"❌ 例外発生: {e}")
        return None

def add_issue_to_project(issue_number):
    """IssueをReelVault Developmentプロジェクトに追加"""
    project_id = "PVT_kwDODIBDzM4A7Mog"
    cmd = f'gh api graphql -f query=\'mutation {{ addProjectV2ItemById(input: {{ projectId: "{project_id}", contentId: "$(gh api repos/CIVICTECH-TV/ReelVault/issues/{issue_number} --jq .node_id)" }}) {{ item {{ id }} }} }}\''
    result = run_gh_command(cmd)
    if result:
        print(f"✅ Issue #{issue_number} をReelVault Developmentプロジェクトに追加")
    else:
        print(f"⚠️ Issue #{issue_number} のプロジェクト追加に失敗")
    return result

def add_epic_relationship(issue_number, epic_number=36):
    """EpicとのRelationshipをコメントで追加"""
    comment_body = f"**Related to Epic #{epic_number}**\\n\\nThis issue is part of Epic #{epic_number}: ユーザーインターフェース.\\n\\nPlease check the Epic for overall progress and context."
    cmd = f'gh issue comment {issue_number} --body "{comment_body}"'
    result = run_gh_command(cmd)
    if result:
        print(f"✅ Issue #{issue_number} にEpic #{epic_number}との関係性コメントを追加")
    else:
        print(f"⚠️ Issue #{issue_number} の関係性コメント追加に失敗")
    return result

def create_and_setup_issue(title, body, labels, milestone, skip_epic_relationship=False):
    """Issue作成とプロジェクト設定を一括実行"""
    # 一時ファイルに書き込み
    temp_file = f"/tmp/issue_{title.replace(' ', '_')}.json"
    issue_data = {
        "title": title,
        "body": body,
        "labels": labels,
        "milestone": milestone
    }
    
    with open(temp_file, 'w', encoding='utf-8') as f:
        json.dump(issue_data, f, ensure_ascii=False, indent=2)
    
    cmd = f'gh issue create --title "{title}" --body-file {temp_file}'
    result = run_gh_command(cmd)
    
    if result and "https://github.com" in result:
        # Issue番号を抽出
        issue_number = result.split('/')[-1]
        print(f"✅ Issue #{issue_number}: {title} を作成")
        
        # プロジェクトに追加
        time.sleep(1)
        add_issue_to_project(issue_number)
        
        # Epic関係性追加（高度な機能以外）
        if not skip_epic_relationship:
            time.sleep(1)
            add_epic_relationship(issue_number)
        
        # 一時ファイル削除
        os.remove(temp_file)
        
        return issue_number
    else:
        print(f"❌ Issue作成に失敗: {title}")
        if os.path.exists(temp_file):
            os.remove(temp_file)
        return None

def create_issue_42():
    """Issue #42: シンプルアップロードUI実装"""
    title = "シンプルアップロードUI実装"
    
    body = """## 概要

基本的なファイルアップロード機能のUIを実装します（無料機能）。

## 詳細

ユーザーが手動でファイルを選択・アップロードするためのシンプルなUIを構築します。
自動監視や並列アップロードは含まず、基本的な操作のみを提供します。

### 主要機能

**ファイル選択**:
- `openFileDialog`: 単発・複数ファイル選択
- ドラッグ&ドロップエリア: HTML5 Drag and Drop API

**アップロード操作**:
- 基本アップロード: 既存の`upload_file`コマンド使用
- 進捗表示: シンプルな進捗バー
- キュー管理: 追加・削除・リトライ

**UI統合**:
- ConfigManager内にタブ追加
- 既存デザインとの統一
- 状態管理連携

### 技術要件

- **Tauri Commands**: `openFileDialog`, `upload_file`, `add_to_upload_queue`
- **React Components**: ファイル選択UI、進捗表示
- **Drag & Drop**: HTML5 API + ファイル検証
- **状態管理**: 既存AppState連携
- **エラーハンドリング**: 適切なエラー表示

### UI設計

```typescript
interface SimpleUploadPanel {
  // ファイル選択エリア
  fileSelector: FileDialog | DragDropArea;
  
  // アップロードキュー
  uploadQueue: UploadItem[];
  
  // 操作ボタン
  actions: {
    selectFiles: () => void;
    startUpload: () => void;
    clearQueue: () => void;
  };
  
  // 進捗表示
  progress: UploadProgress[];
}
```

### 制限事項（無料機能）

- ❌ ウォッチフォルダ監視なし
- ❌ 並列アップロードなし（1ファイルずつ）
- ❌ 自動リトライなし
- ❌ 高度な設定なし

## 完了条件

- [ ] ファイル選択ダイアログ実装
- [ ] ドラッグ&ドロップエリア実装
- [ ] シンプルアップロード機能実装
- [ ] 進捗表示UI実装
- [ ] キュー管理UI実装
- [ ] ConfigManagerへの統合
- [ ] エラーハンドリング実装
- [ ] 基本テスト実施

## 依存関係

**前提条件**:
- Issue #3: Tauri基盤構築（完了済み）
- Issue #41: 状態管理・UI連携API（完了済み）

**後続タスク**:
- Issue #32: システムトレイUI（連携のため）

## 関係性

**Parent Epic**: #36 (Epic 3: ユーザーインターフェース)

This issue is part of Epic #36. Please check the Epic for overall progress and context.

---

**機能分類**: 無料機能 - 基本アップロード機能の提供"""

    return create_and_setup_issue(
        title=title,
        body=body,
        labels=["ui", "upload", "basic-feature", "task", "ready"],
        milestone="Phase 1"
    )

def create_issue_43():
    """Issue #43: RestoreManager統合"""
    title = "RestoreManager統合"
    
    body = """## 概要

既存のRestoreManager.tsxをConfigManagerに統合します。

## 詳細

現在独立したコンポーネントとして実装されているRestoreManagerを、
ConfigManagerのタブとして統合し、統一されたUI体験を提供します。

### 主要機能

**UI統合**:
- ConfigManagerタブシステムに追加
- 既存デザインとの統一
- 状態管理の統合

**機能保持**:
- 復元機能の完全保持
- Deep Archiveファイル選択
- 復元ティア選択
- 進捗監視
- ダウンロード機能

### 技術要件

- **React Integration**: RestoreManager → ConfigManager
- **Tab System**: `activeTab` に `restore` 追加
- **State Management**: 既存状態管理との統合
- **CSS Harmonization**: デザイン統一
- **Props Integration**: 適切なprops受け渡し

### 実装詳細

```typescript
// ConfigManager.tsx 修正
type ActiveTab = 'status' | 'upload' | 'restore' | 'auth' | 'app' | 'aws_settings';

// RestoreManagerタブ追加
{activeTab === 'restore' && (
  <RestoreManagerPanel
    awsConfig={awsConfig}
    s3Objects={s3Objects}
    onError={setError}
    onSuccess={setSuccess}
  />
)}
```

### UI統合要件

- ✅ 既存のCSS・デザイン言語統一
- ✅ エラー・成功メッセージの統一表示
- ✅ ローディング状態の統一
- ✅ 応答性のあるレイアウト

## 完了条件

- [ ] RestoreManagerの統合設計
- [ ] ConfigManagerタブ追加
- [ ] CSS・デザイン統一
- [ ] 状態管理統合
- [ ] Props・イベント統合
- [ ] 機能テスト実施
- [ ] UI統合テスト実施

## 依存関係

**前提条件**:
- 既存RestoreManager.tsx（実装済み）
- ConfigManagerタブシステム（実装済み）

**後続タスク**:
- Issue #32: システムトレイUI（統合UI前提）

## 関係性

**Parent Epic**: #36 (Epic 3: ユーザーインターフェース)

This issue is part of Epic #36. Please check the Epic for overall progress and context.

---

**機能分類**: UI統合 - 既存機能の整理統合"""

    return create_and_setup_issue(
        title=title,
        body=body,
        labels=["ui", "integration", "restore", "task", "ready"],
        milestone="Phase 1"
    )

def create_issue_44():
    """Issue #44: 高度なアップロード機能（有料機能）"""
    title = "高度なアップロード機能（プレミアム機能）"
    
    body = """## 概要

プロ向けの高度なアップロード機能を実装します（有料機能として提供）。

## 詳細

ウォッチフォルダ監視による自動アップロード、並列処理、高度な設定など、
プロフェッショナルユーザー向けの機能を提供します。

⚠️ **将来機能**: この機能はPhase 2で実装予定です（MVP後の拡張機能）

### 主要機能

**ウォッチフォルダ監視**:
- `watch_directory` API活用
- `auto_upload: true` 設定
- リアルタイムファイル検知
- 自動メタデータ作成

**並列アップロード**:
- 複数ファイル同時処理
- キュー管理・優先度制御
- 帯域幅制御
- 自動リトライ・回復

**高度な設定**:
- カスタムS3キー生成
- 除外パターン設定
- ファイルサイズ制限
- 自動圧縮・最適化

**プレミアムUI**:
- 高度な設定パネル
- 詳細進捗監視
- 統計・分析表示
- カスタムルール設定

### 技術要件

- **Watch System**: notify crate活用
- **Queue Management**: 並列処理制御
- **Feature Flags**: プレミアム機能制御
- **Advanced Config**: 詳細設定管理
- **Performance Monitoring**: 統計・分析

### フィーチャーフラグ制御

```typescript
interface PremiumFeatures {
  watch_folders: boolean;        // ウォッチフォルダ
  parallel_upload: boolean;      // 並列アップロード
  auto_metadata: boolean;        // 自動メタデータ
  advanced_config: boolean;      // 高度な設定
  upload_analytics: boolean;     // アップロード分析
}

// UI表示制御
{premiumFeatures.watch_folders ? (
  <WatchFolderPanel />
) : (
  <PremiumFeatureLock 
    feature="ウォッチフォルダ自動アップロード"
    description="フォルダを監視して自動でアップロードします"
    upgradeUrl="/premium"
  />
)}
```

### 有料機能UI設計

```typescript
interface PremiumUploadPanel {
  // ウォッチフォルダ設定
  watchConfig: WatchConfig;
  
  // 並列アップロード設定
  parallelConfig: {
    maxConcurrent: number;
    chunkSize: number;
    retryAttempts: number;
  };
  
  // 高度な設定
  advancedConfig: {
    s3KeyPattern: string;
    excludePatterns: string[];
    autoCompression: boolean;
  };
  
  // プレミアム統計
  analytics: {
    uploadSpeed: number;
    successRate: number;
    totalUploaded: number;
  };
}
```

## 完了条件

- [ ] フィーチャーフラグシステム実装
- [ ] ウォッチフォルダUI実装
- [ ] 並列アップロード制御実装
- [ ] 高度な設定パネル実装
- [ ] プレミアムロック画面実装
- [ ] アップロード分析機能実装
- [ ] 有料機能テスト実施
- [ ] パフォーマンステスト実施

## 依存関係

**前提条件**:
- Issue #42: シンプルアップロードUI（基盤機能）
- Issue #32: システムトレイUI（通知連携）
- 既存watch_directory API（実装済み）

**技術基盤**:
- notify crate（ファイル監視）
- 並列処理システム
- フィーチャーフラグ管理

## 関係性

**Parent Epic**: #36 (Epic 3: ユーザーインターフェース)

This issue is part of Epic #36. Please check the Epic for overall progress and context.

---

**機能分類**: 🔮 将来機能 - Phase 2実装予定

### 🎯 Phase 2実装理由

この機能は以下の価値を提供しますが、MVP完成後に実装します：
- ⏰ 時間節約（自動化）
- 🚀 効率向上（並列処理）
- 📊 生産性向上（分析機能）
- 🎯 プロワークフロー対応

**実装優先度**: 低（MVP後の拡張機能として計画）
**対象ユーザー**: 映像制作プロフェッショナル、制作会社、頻繁利用者

    # Issue #44は高度な機能なので、Epic関係性を追加しない（skip_epic_relationship=True）
    return create_and_setup_issue(
        title=title,
        body=body,
        labels=["ui", "upload", "premium-feature", "watch-folder", "parallel", "task", "future-phase"],
        milestone="Phase 2",
        skip_epic_relationship=True  # 高度な機能は親子関係なし
    )

def update_issue_32():
    """Issue #32を更新してシステムトレイ機能に集中"""
    issue_number = "32"
    
    # 現在の内容を取得
    current = run_gh_command(f'gh issue view {issue_number} --json title,body')
    if not current:
        return None
        
    # 更新内容
    additional_content = """

---

## 🔄 Epic3再構成に伴う更新

Issue #33の分割により、以下の関連Issueが新設されました：
- Issue #42: シンプルアップロードUI実装
- Issue #43: RestoreManager統合
- Issue #44: 高度なアップロード機能（有料機能）

このIssue #32は**システムトレイ機能**に集中します。

### 🎯 更新後の実装内容

**システムトレイ機能**:
- ✅ macOSメニューバー常駐
- ✅ コンテキストメニュー
- ✅ 通知システム
- ✅ 状態表示（AWS接続・進捗）
- ✅ クイックアクション

**連携機能**:
- ✅ Issue #42のシンプルアップロードとの連携
- ✅ Issue #43の復元機能との連携
- ✅ 統一された通知システム

### 📋 システムトレイメニュー設計

```
ReelVault
├── 📊 状態表示
│   ├── AWS: 🟢 接続済み
│   ├── アップロード: 2件進行中
│   └── 復元: 1件待機中
├── ⚡ クイックアクション  
│   ├── 📁 ファイルアップロード
│   ├── 🔍 復元状況確認
│   └── ⚙️ 設定を開く
├── 📋 最近の活動
│   ├── video1.mp4 アップロード完了
│   └── video2.mov 復元完了
├── ───────────────
├── 🖥️ メインウィンドウを開く
├── ⚙️ 設定
└── 🚪 終了
```

### 🔔 通知システム

**アップロード通知**:
- 📤 アップロード開始
- ✅ アップロード完了
- ❌ アップロード失敗

**復元通知**:
- 🔄 復元開始
- ✅ 復元完了・ダウンロード可能
- ❌ 復元失敗

**システム通知**:
- 🔌 AWS接続状態変化
- ⚠️ エラー・警告"""

    # コメントとして追加
    temp_file = "/tmp/issue_32_update.md"
    with open(temp_file, 'w', encoding='utf-8') as f:
        f.write(additional_content)
    
    cmd = f'gh issue comment {issue_number} --body-file {temp_file}'
    return run_gh_command(cmd)

def close_issue_41():
    """Issue #41を完了済みとしてクローズ"""
    issue_number = "41"
    
    close_comment = """## ✅ Issue #41 完了報告

このIssueで要求されていた**状態管理・UI連携API**は既に実装済みであることが確認されました。

### 🎯 完了済み機能

**状態管理API**:
- ✅ `get_app_state` - アプリケーション状態取得
- ✅ `set_app_state` - 状態設定  
- ✅ `update_app_state` - 状態部分更新
- ✅ `reset_app_state` - 状態リセット

**キュー管理API**:
- ✅ `add_to_upload_queue` - アップロードキューに追加
- ✅ `remove_from_upload_queue` - キューから削除
- ✅ `update_system_stats` - システム統計更新

**技術実装**:
- ✅ Arc<Mutex>によるスレッドセーフな状態管理
- ✅ TypeScript型定義完備
- ✅ グローバル状態管理（AppStateManager）
- ✅ リアルタイム同期機能
- ✅ エラーハンドリング

### 📍 実装場所

- **Rust**: `src-tauri/src/commands/state_management.rs`
- **TypeScript**: `src/types/tauri-commands.ts`
- **UI連携**: `src/components/ConfigManager.tsx`

### 🔗 API仕様書

詳細なAPI仕様は`docs/api/tauri-command-api.md`に記載済みです。

---

**結論**: Issue #41の完了条件はすべて達成済みのため、このIssueを完了とします。

Epic #36の進捗更新:
- ✅ Issue #41: 状態管理・UI連携API実装（完了）
- 🔄 Issue #42: シンプルアップロードUI 🆕 新規
- 🔄 Issue #43: RestoreManager統合 🆕 新規
- 🔄 Issue #32: システムトレイUI 🔄 更新
- 🔄 Issue #44: 高度なアップロード機能 🆕 有料機能"""

    # コメント追加
    temp_file = "/tmp/issue_41_close.md"
    with open(temp_file, 'w', encoding='utf-8') as f:
        f.write(close_comment)
    
    # コメント追加とクローズ
    run_gh_command(f'gh issue comment {issue_number} --body-file {temp_file}')
    return run_gh_command(f'gh issue close {issue_number} --reason completed')

def main():
    """メイン処理"""
    print("🚀 Epic3新Issue構造作成開始")
    print("=" * 50)
    
    results = {
        "created": [],
        "updated": [],
        "closed": [],
        "errors": []
    }
    
    # Issue #41をクローズ（完了済みのため）
    print("\n📝 Issue #41クローズ中...")
    if close_issue_41():
        results["closed"].append("#41 状態管理・UI連携API実装")
        print("✅ Issue #41 クローズ完了")
    else:
        results["errors"].append("Issue #41のクローズに失敗")
        print("❌ Issue #41 クローズ失敗")
    
    time.sleep(1)
    
    # Issue #42作成
    print("\n📝 Issue #42作成中...")
    if create_issue_42():
        results["created"].append("#42 シンプルアップロードUI実装")
        print("✅ Issue #42 作成完了")
    else:
        results["errors"].append("Issue #42の作成に失敗")
        print("❌ Issue #42 作成失敗")
    
    time.sleep(1)
    
    # Issue #43作成
    print("\n📝 Issue #43作成中...")
    if create_issue_43():
        results["created"].append("#43 RestoreManager統合")
        print("✅ Issue #43 作成完了")
    else:
        results["errors"].append("Issue #43の作成に失敗")
        print("❌ Issue #43 作成失敗")
    
    time.sleep(1)
    
    # Issue #44作成（有料機能）
    print("\n📝 Issue #44作成中...")
    if create_issue_44():
        results["created"].append("#44 高度なアップロード機能（有料機能）")
        print("✅ Issue #44 作成完了")
    else:
        results["errors"].append("Issue #44の作成に失敗")
        print("❌ Issue #44 作成失敗")
    
    time.sleep(1)
    
    # Issue #32更新
    print("\n📝 Issue #32更新中...")
    if update_issue_32():
        results["updated"].append("#32 システムトレイUI実装")
        print("✅ Issue #32 更新完了")
    else:
        results["errors"].append("Issue #32の更新に失敗")
        print("❌ Issue #32 更新失敗")
    
    # 結果サマリー
    print("\n" + "=" * 50)
    print("🎯 Epic3新Issue構造作成完了")
    print("=" * 50)
    
    if results["created"]:
        print(f"\n✅ 作成されたIssue ({len(results['created'])}件):")
        for item in results["created"]:
            print(f"  - {item}")
    
    if results["updated"]:
        print(f"\n🔄 更新されたIssue ({len(results['updated'])}件):")
        for item in results["updated"]:
            print(f"  - {item}")
    
    if results["closed"]:
        print(f"\n🏁 完了したIssue ({len(results['closed'])}件):")
        for item in results["closed"]:
            print(f"  - {item}")
    
    if results["errors"]:
        print(f"\n❌ エラー ({len(results['errors'])}件):")
        for item in results["errors"]:
            print(f"  - {item}")
    
    print(f"\n📊 Epic3新構成:")
    print(f"  - Issue #41: 状態管理・UI連携API ✅ 完了")
    print(f"  - Issue #42: シンプルアップロードUI 🆕 新規（Phase 1）")
    print(f"  - Issue #43: RestoreManager統合 🆕 新規（Phase 1）")  
    print(f"  - Issue #32: システムトレイUI 🔄 更新（Phase 1）")
    print(f"  - Issue #44: 高度なアップロード機能 🆕 将来機能（Phase 2）")
    
    print(f"\n⏱️  工数見積もり:")
    print(f"  - Phase 1 (MVP): 2.5日（Issue #41完了済みのため）")
    print(f"  - Phase 2 (拡張): 1.5日（将来実装）")
    print(f"  - 合計: 4日")
    
    print(f"\n🎯 MVP達成条件:")
    print(f"  - Phase 1完了でReelVaultアプリケーション完成")
    print(f"  - 基本アップロード + 復元 + システムトレイ常駐")
    print(f"  - Phase 2は市場反応を見て実装判断")
    
    # 一時ファイル削除
    for temp_file in ["/tmp/issue_42.json", "/tmp/issue_43.json", "/tmp/issue_44.json", 
                      "/tmp/issue_32_update.md", "/tmp/issue_41_close.md"]:
        if os.path.exists(temp_file):
            os.remove(temp_file)

if __name__ == "__main__":
    main() 