# GitHub Projects セットアップガイド

## 📋 GitHub Project 作成手順

### 1. プロジェクト作成
1. GitHubのリポジトリ（`CIVICTECH-TV/ReelVault`）に移動
2. **Projects** タブをクリック
3. **New project** → **Board** を選択
4. プロジェクト名: `ReelVault Development`
5. 説明: `映像制作者向け長期アーカイブストレージツールの開発管理`

### 2. フィールド設定

#### カスタムフィールドを追加:
- **Priority**: Select (High, Medium, Low)
- **Estimate**: Number (作業日数)
- **Component**: Select (CLI, Web UI, AWS, Integration, Testing, Documentation)
- **Epic**: Select (v1.0, v1.1, v1.2, v2.0, v2.1)

#### ビュー設定:
1. **Board View**: Status別（Todo, In Progress, Review, Done）
2. **Table View**: 詳細情報一覧
3. **Roadmap View**: マイルストーン・期日管理

### 3. CSVインポート

#### インポート手順:
1. Projects画面で **···** (3点メニュー) → **Settings**
2. **Import** セクションで **Import from CSV**
3. `project-plan.csv` ファイルをアップロード
4. フィールドマッピングを確認・調整
5. **Import** を実行

#### フィールドマッピング:
```
CSV Column → GitHub Field
Title → Title
Status → Status
Priority → Priority (Custom)
Labels → Labels  
Milestone → Epic (Custom)
Description → Body
Estimate → Estimate (Custom)
```

### 4. ワークフロー設定

#### 自動化ルール:
1. **Draft → Todo**: Issue作成時
2. **Todo → In Progress**: Assignee設定時
3. **In Progress → Review**: PR作成時
4. **Review → Done**: PR マージ時

### 5. マイルストーン設定

GitHubのMilestonesで以下を作成:
- **v1.0 MVP**: CLI基本機能
- **v1.1 Web UI**: Webインターフェース
- **v1.2 Integration**: 編集ソフト連携

### 6. ラベル設定

以下のラベルを作成・設定:
```
Priority:
🔴 priority: high
🟡 priority: medium  
🟢 priority: low

Component:
🖥️ component: cli
🌐 component: web
☁️ component: aws
🔗 component: integration
🧪 component: testing
📚 component: docs

Type:
✨ type: feature
🐛 type: bug
🔧 type: enhancement
📖 type: documentation
```

## 🎯 プロジェクト管理ベストプラクティス

### 週次レビュー
- 毎週金曜日に進捗確認
- Burndown chart で進捗可視化
- ブロッカーの早期発見・解決

### ブランチ戦略
```
main
├── feature/aws-cloudformation
├── feature/cli-base
├── feature/web-ui
└── hotfix/critical-bug
```

### コミット規約
```
feat: 新機能追加
fix: バグ修正
docs: ドキュメント更新
style: フォーマット変更
refactor: リファクタリング
test: テスト追加・修正
chore: その他の変更
```

## 📊 進捗管理

### KPI指標
- **Velocity**: 週あたりの完了タスク数
- **Burn Rate**: 残作業時間の消化率
- **Code Coverage**: テストカバレッジ
- **Issue Response Time**: Issue対応時間

### レポート生成
- GitHub Insights を活用
- 週次・月次進捗レポート
- リリース準備状況確認 