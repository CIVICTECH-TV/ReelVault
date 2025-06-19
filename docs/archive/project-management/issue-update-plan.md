# GitHub Issues 更新計画 - Tauri移行対応

## 📋 更新方針

### 🎯 **目標**
- Phase 1（v1.0）のIssueをTauriベースに更新
- Phase 2/3のIssueを削除（将来再設計）
- 新しいTauri特有のIssueを追加

### 🔄 **更新対象分類**

## 📌 **保持・更新するIssue（Phase 1関連）**

### ✅ **そのまま保持**
1. **AWS CloudFormation テンプレート作成** (#1, #2)
   - 変更なし（AWSインフラは技術スタック非依存）

### 🔄 **Tauri向けに更新**
2. **~~Python CLI基盤の構築~~ → Tauri基盤構築** (#3)
   - **新タイトル**: "Tauri + React + TypeScript基盤構築"
   - **新説明**: システムトレイ常駐、Cross-platform対応、基本UI実装
   - **工数**: 3日 → 4日
   - **ラベル**: `cli` → `tauri,core,ui`

3. **AWS認証・設定管理機能** (#9)
   - **更新内容**: aws-sdk-rustによるAWS統合に変更
   - **工数**: 3日（変更なし）
   - **ラベル**: `aws,auth` → `aws,auth,rust`

4. **ファイルアップロード機能（CLI）** (#4)
   - **新タイトル**: "ファイルアップロード機能（Tauri）"
   - **新説明**: aws-sdk-rustによるS3操作、並列アップロード処理
   - **工数**: 5日（変更なし）
   - **ラベル**: `cli,upload` → `tauri,upload,rust`

5. **ファイル復元機能（CLI）** (#5)
   - **新タイトル**: "ファイル復元機能（Tauri）"
   - **新説明**: システムトレイ通知、一時ダウンロード機能
   - **工数**: 5日 → 4日
   - **ラベル**: `cli,restore` → `tauri,restore,rust`

6. **メタデータ管理システム** (#11)
   - **更新内容**: rusqliteによる軽量データベースに変更
   - **工数**: 4日 → 2日
   - **ラベル**: `metadata,database` → `metadata,database,rust`

### 🆕 **新規追加するIssue（Tauri特有）**
7. **ファイル監視システム**
   - **説明**: notify crateによる高性能ファイル監視、映像ファイルフィルタリング
   - **工数**: 3日
   - **ラベル**: `tauri,filesystem,rust`

8. **バックグラウンドアップロード**
   - **説明**: Tokio非同期ランタイムによる並列処理、キューイングシステム
   - **工数**: 4日
   - **ラベル**: `tauri,upload,async,rust`

9. **Tauri Command API実装**
   - **説明**: Rust-JavaScript境界の型安全な通信、エラーハンドリング統一
   - **工数**: 2日
   - **ラベル**: `tauri,api,rust`

10. **システムトレイUI実装**
    - **説明**: 進捗表示、通知システム、設定画面
    - **工数**: 3日
    - **ラベル**: `tauri,ui,systemtray`

## 🗑️ **削除するIssue（Phase 2/3関連）**

### Phase 2 (v1.1) - Web UI関連
- **Flask Webアプリ基盤構築** (#15) - 削除
- **Web UI - ファイルアップロード** (#6) - 削除
- **Web UI - 進捗管理ダッシュボード** (#16) - 削除
- **Web UI - ファイル復元インターフェース** (#7) - 削除
- **Web UI - 設定管理画面** (#17) - 削除
- **Responsive デザイン対応** (#18) - 削除
- **パフォーマンス最適化** (#28) - 削除

### Phase 3 (v1.2) - 編集ソフト連携
- **Premiere Pro連携調査・設計** (#19) - 削除
- **エクスポート先選択機能** (#20) - 削除
- **DaVinci Resolve連携調査** (#21) - 削除

### Phase 4/5 (v2.0/v2.1) - モバイル・チーム機能
- **通知システム基盤** (#22) - 削除
- **iOS アプリ開発** (#23) - 削除
- **Android アプリ開発** (#24) - 削除
- **チーム機能設計** (#25) - 削除
- **ライセンス管理システム** (#26) - 削除

## 📊 **更新後のIssue構成**

### Phase 1 (v1.0) - Tauri常駐アプリMVP
| # | タイトル | 工数 | ラベル | 状態 |
|---|---------|------|--------|------|
| 1 | AWS CloudFormation テンプレート作成 | 5日 | `aws,infrastructure` | 保持 |
| 3 | Tauri + React + TypeScript基盤構築 | 4日 | `tauri,core,ui` | 更新 |
| NEW | ファイル監視システム | 3日 | `tauri,filesystem,rust` | 新規 |
| NEW | バックグラウンドアップロード | 4日 | `tauri,upload,async,rust` | 新規 |
| 9 | AWS認証・設定管理機能 | 3日 | `aws,auth,rust` | 更新 |
| 4 | ファイルアップロード機能（Tauri） | 5日 | `tauri,upload,rust` | 更新 |
| 5 | ファイル復元機能（Tauri） | 4日 | `tauri,restore,rust` | 更新 |
| 11 | メタデータ管理システム | 2日 | `metadata,database,rust` | 更新 |
| NEW | Tauri Command API実装 | 2日 | `tauri,api,rust` | 新規 |
| NEW | システムトレイUI実装 | 3日 | `tauri,ui,systemtray` | 新規 |

**Phase 1 合計**: 35日（目標30日に近い）

### 継続するサポートIssue
- **設定ファイル管理** (#12) - 保持
- **エラーハンドリング・ログ機能** (#13) - 保持
- **単体テスト・統合テスト** (#14) - 保持
    - TypeScript（React）側のテスト基盤構築
    - Tauri APIのサービス層分離とモック戦略の実装
    - UploadManagerコンポーネントのテストリファクタリング
    - テスト実行フローの標準化（npm run test:run）
- **ドキュメント整備** (#8) - 保持
- **セキュリティ監査・対応** (#27) - 保持
- **CI/CD パイプライン構築** (#29) - 保持

## 🛠️ **実行手順**

### 1. 削除対象Issueのクローズ
```bash
# Phase 2/3関連Issueを一括クローズ
gh issue close 6 7 15 16 17 18 19 20 21 22 23 24 25 26 28 --repo CIVICTECH-TV/ReelVault
```

### 2. 既存Issueの更新
各Issueのタイトル・説明・ラベルをTauriベースに更新

### 3. 新規Issueの作成
Tauri特有の4つの新しいIssueを作成

### 4. プロジェクトボードの整理
- 削除されたIssueをプロジェクトから除去
- 新しいIssueをプロジェクトに追加
- Phase 1に集中したビューを作成

## 📈 **期待される効果**

- **フォーカス向上**: Phase 1のTauri開発に集中
- **工数精度向上**: 実際の技術スタックに基づく見積もり
- **管理効率化**: 不要なIssueによる混乱を排除
- **将来の柔軟性**: Phase 2以降を実装経験を踏まえて再設計

## 🔄 **次のステップ**

1. **Issue削除の実行** - Phase 2/3関連Issueのクローズ
2. **Issue更新の実行** - 既存IssueのTauri対応
3. **新規Issue作成** - Tauri特有機能のIssue追加
4. **プロジェクトボード調整** - ビューとワークフローの最適化 