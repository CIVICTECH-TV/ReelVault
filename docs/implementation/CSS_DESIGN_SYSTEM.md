# ReelVault CSS設計システム

ReelVaultプロジェクトの統一されたCSS設計システムとベストプラクティス

## 📋 **概要**

ReelVaultでは、**関心の分離**と**保守性の向上**を目指し、段階的なCSS統合を実施しています。このドキュメントは、設計方針、実装ガイドライン、ベストプラクティスを包括的に説明します。

## 🎯 **設計方針**

### **ファイル分離の哲学**

#### **`index.css`**: キャンバス準備
- **役割**: ブラウザのデフォルトスタイルをリセットし、基本的な設定を適用
- **喩え**: 絵を描く前の**キャンバスそのもの**を準備する作業
- **内容**:
  - `body { margin: 0; }`
  - `* { box-sizing: border-box; }`
  - フォントのスムージング設定
  - 全体的な背景色設定

#### **`common.css`**: 絵の具パレット
- **役割**: アプリケーション固有のデザインシステムを定義
- **喩え**: 実際に絵を描くための**絵の具のパレット**を準備する作業
- **内容**:
  - CSS変数（カラーパレット）の定義
  - 共通コンポーネントクラス（`.btn`, `.card`, `.alert`など）
  - 共通レイアウトクラス（`.two-column-layout`など）

### **分離のメリット**

1. **関心の分離**: 目的別の修正が容易
2. **保守性向上**: 修正箇所の特定が簡単
3. **プロフェッショナルな構造**: 大規模開発に対応
4. **再利用性**: コンポーネントの独立性確保

## 🏗️ **ファイル構成**

### **現在の構成**
```
src/
├── index.css (49行) - グローバルスタイル
├── styles/
│   ├── common.css (952行) - 統一デザインシステム
│   └── old/ - アーカイブ化された古いCSS
│       ├── AuthManager.css (147行)
│       ├── ConfigManager.css (1423行)
│       ├── StatusManager.css (168行)
│       └── UploadManager.css (942行)
└── components/
    └── [各コンポーネント].tsx - 個別CSSのインポート削除済み
```

### **インポート構造**
```typescript
// main.tsx - アプリケーション全体のCSS
import "./styles/common.css";

// 個別コンポーネント - CSSインポート削除済み
// import './ComponentName.css'; // 削除
```

## 🎨 **デザインシステム**

### **カラーパレット**

#### **背景色**
```css
:root {
  --bg-main-content: rgb(238, 238, 238); /* #eeeeee */
  --bg-sidebar: rgb(208, 208, 206);      /* #d0d0ce */
  --bg-component: rgb(213, 214, 215);    /* #d5d6d7 */
  --bg-component-light: #ffffff;
  --bg-active-tab: rgb(189, 189, 189);   /* #bdbdbd */
  --bg-hover-tab: rgb(199, 199, 199);    /* #c7c7c7 */
}
```

#### **テキスト色**
```css
:root {
  --text-primary: rgb(0, 0, 0);
  --text-secondary: #333333;
  --text-light: #555555;
  --text-on-dark-bg: #ffffff;
}
```

#### **アクセント色**
```css
:root {
  --accent-success: #2e7d32;
  --accent-success-bg: rgba(46, 125, 50, 0.1);
  --accent-error: #d32f2f;
  --accent-error-bg: rgba(211, 47, 47, 0.1);
  --accent-warning: #666666;
  --accent-warning-bg: rgba(102, 102, 102, 0.1);
}
```

### **共通コンポーネント**

#### **ボタンスタイル**
```css
.btn-primary {
  background: var(--btn-primary-bg);
  color: var(--btn-text-primary);
  border-radius: var(--radius-md);
  padding: 10px 20px;
  font-weight: 500;
  transition: var(--transition-fast);
}

.btn-secondary {
  background: var(--btn-secondary-bg);
  color: var(--btn-text-secondary);
  border: 1px solid var(--btn-secondary-border);
}
```

#### **フォーム要素**
```css
.form-row {
  display: flex;
  align-items: center;
  margin-bottom: var(--spacing-md);
}

.form-row label {
  width: 200px;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-row .control {
  flex: 1;
}
```

#### **アラート**
```css
.alert {
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  margin: var(--spacing-md) 0;
  border: 1px solid transparent;
}

.alert-success {
  background: var(--accent-success-bg);
  border-color: var(--accent-success);
  color: var(--accent-success);
}

.alert-error {
  background: var(--accent-error-bg);
  border-color: var(--accent-error);
  color: var(--accent-error);
}
```

## 🔄 **リファクタリング戦略**

### **段階的アプローチ**

#### **Phase 1: 基盤整備** ✅ 完了
- [x] `common.css`の作成
- [x] `index.css`のクリーンアップ
- [x] グローバルCSSの読み込み設定
- [x] 個別CSSファイルのアーカイブ化

#### **Phase 2: コンポーネント統合** 🚧 進行中
- [ ] `ConfigManager.css`のリファクタリング
- [ ] 設定・ステータス関連スタイルの抽出
- [ ] 復元関連スタイルの後回し処理

#### **Phase 3: 最終調整** 📋 予定
- [ ] 重複スタイルの最終確認
- [ ] レスポンシブデザインの検証
- [ ] アクセシビリティの確認

### **注意点**

1. **一度に一つの敵に集中**: 混乱を避けるため段階的に進める
2. **役割分担の明確化**: 各ファイルの責任範囲を明確に保持
3. **復元関連スタイルの後回し**: `RestoreTab`リファクタリング時に処理

## 📊 **技術的成果**

### **コード削減**
- **個別CSSファイル合計**: 2676行 → アーカイブ化
- **統一デザインシステム**: 952行で全機能をカバー
- **重複スタイル**: 完全排除

### **保守性向上**
- **CSS変数**: 統一カラーパレットによる一貫性
- **共通クラス**: 再利用可能なコンポーネントスタイル
- **レスポンシブ対応**: 統一されたブレークポイント

## 🎯 **実装ガイドライン**

### **新しいコンポーネント作成時**

#### **1. CSSファイル作成禁止**
```typescript
// ❌ 悪い例
import './NewComponent.css';

// ✅ 良い例
// CSSファイルは作成せず、common.cssのクラスを使用
```

#### **2. 共通クラスの使用**
```typescript
// ✅ 良い例
<div className="content-container">
  <div className="section">
    <h3 className="section-title">
      <span className="icon">🎯</span>タイトル
    </h3>
    <div className="form-row">
      <label>ラベル</label>
      <div className="control">
        <input className="input-field" />
      </div>
    </div>
  </div>
</div>
```

#### **3. カスタムスタイルが必要な場合**
```css
/* common.cssに追加 */
.custom-component {
  /* 既存の変数を使用 */
  background: var(--bg-component);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
}
```

### **既存コンポーネント修正時**

#### **1. 個別CSSの削除**
```typescript
// ❌ 削除
import './ComponentName.css';
```

#### **2. 共通クラスへの移行**
```typescript
// ❌ 古いスタイル
<div className="old-custom-style">

// ✅ 新しいスタイル
<div className="content-container">
```

## ⚠️ **現在の問題点**

### **TypeScriptエラー**
- AuthManager分離による型定義変更で81個のエラーが発生
- テストファイルの型定義修正が必要

### **残存作業**
- `ConfigManager.css`のリファクタリング未完了
- `RestoreTab`の中途半端な分離
- 最終統合テスト

## 🎯 **次のステップ**

### **優先度1: TypeScriptエラー修正**
1. AuthManager.test.tsxの型定義修正
2. UploadManager.test.tsxの型定義修正
3. ConfigManager.test.tsxの未使用import削除

### **優先度2: CSS統合完了**
1. `ConfigManager.css`のリファクタリング
2. 重複スタイルの最終確認
3. レスポンシブデザインの検証

### **優先度3: 品質保証**
1. 全コンポーネントの動作確認
2. デザインの一貫性確認
3. アクセシビリティテスト

## 📈 **期待される効果**

### **開発効率**
- 統一されたデザインシステムによる開発速度向上
- 新コンポーネント作成時の迷い減少

### **保守性**
- 関心の分離による修正の容易さ
- 重複コードの排除

### **一貫性**
- 全コンポーネントでの統一されたデザイン
- ブランドアイデンティティの強化

### **拡張性**
- 新しいコンポーネントの追加が容易
- テーマ変更への対応力向上

## 🔗 **関連ドキュメント**

- [AuthManager分離 Issue #82](https://github.com/CIVICTECH-TV/ReelVault/issues/82)
- [Tauri Command API仕様書](../api/tauri-command-api.md)
- [プロジェクト実装計画](../project-management/IMPLEMENTATION_PLAN.md)

---

**最終更新**: 2025年6月20日  
**バージョン**: 1.0  
**ステータス**: 実装中（Phase 2） 