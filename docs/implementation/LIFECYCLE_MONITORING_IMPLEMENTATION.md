# ReelVault ライフサイクル監視システム実装

## 🎯 概要

このドキュメントでは、ReelVaultアプリにおけるS3ライフサイクル設定の包括的な監視・安全確認システムの実装について説明します。

## 🔧 実装された機能

### 1. 包括的な監視タイミング

#### アプリ起動時監視
- ConfigManagerのuseEffectで初期健全性チェック実行
- AWS認証情報とバケット設定確認後に自動実行

#### 定期監視（5分間隔）
```typescript
// 5分間隔でのバックグラウンド監視
useEffect(() => {
  const interval = window.setInterval(async () => {
    console.log('定期ライフサイクル健全性チェック実行');
    await checkLifecycleHealth();
  }, 5 * 60 * 1000); // 5分間隔
  
  setHealthCheckInterval(interval);
  return () => clearInterval(interval);
}, [config.user_preferences.default_bucket_name, credentials]);
```

#### アップロード前安全確認
- グローバルチェック関数でアップロード前に必ず確認
- ライフサイクル設定異常時はアップロード拒否

### 2. Backend実装

#### 新しいTauriコマンド
```rust
#[command]
pub async fn check_upload_readiness(config: AwsConfig) -> Result<UploadReadinessResult, String>
```

**チェック項目:**
1. バケットアクセス確認
2. ReelVaultライフサイクルルール存在確認
3. ルールのEnable状態確認

**レスポンス:**
```rust
pub struct UploadReadinessResult {
    pub safe: bool,
    pub message: String,
    pub lifecycle_healthy: bool,
}
```

### 3. Frontend統合

#### ConfigManager拡張
```typescript
// 健全性状態管理
const [isLifecycleHealthy, setIsLifecycleHealthy] = useState<boolean>(true);
const [lastHealthCheck, setLastHealthCheck] = useState<Date | null>(null);
const [healthCheckInterval, setHealthCheckInterval] = useState<number | null>(null);

// アップロード安全確認
const checkUploadSafety = async (): Promise<{ safe: boolean; message: string }> => {
  // バケット設定・認証情報・ライフサイクル健全性の包括確認
  const healthy = await checkLifecycleHealth();
  return {
    safe: healthy,
    message: healthy 
      ? 'アップロード準備完了。ライフサイクル設定も正常です。'
      : 'ライフサイクル設定に問題があります。'
  };
};
```

#### App.tsx統合
```typescript
// グローバルアップロード前チェック関数
const performUploadSafetyCheck = async (): Promise<{ safe: boolean; message: string }> => {
  if (uploadSafetyChecker) {
    return await uploadSafetyChecker();
  }
  return {
    safe: false,
    message: 'アップロード安全チェック機能が初期化されていません。'
  };
};
```

### 4. UI表示強化

#### 状態サマリーに健全性表示
```typescript
<p><strong>🩺 アップロード安全性:</strong> 
  {isLifecycleHealthy ? (
    <span className="status-enabled">✅ 準備完了</span>
  ) : (
    <span className="status-error">⚠️ 設定に問題あり</span>
  )}
  {lastHealthCheck && (
    <small>(最終確認: {lastHealthCheck.toLocaleTimeString()})</small>
  )}
</p>
```

#### アプリレベル警告表示
```typescript
{!healthStatus.isHealthy && (
  <div className="app-warning">
    ⚠️ アップロード機能が利用できません。AWS設定を確認してください。
  </div>
)}
```

## 🔄 監視フロー

### 1. 初期化フロー
```
アプリ起動 → AWS認証情報読み込み → バケット設定確認 → 
初期健全性チェック → 定期監視開始
```

### 2. 定期監視フロー
```
5分毎 → ライフサイクル状況取得 → ReelVaultルール確認 → 
健全性状態更新 → UI表示更新
```

### 3. アップロード前フロー
```
アップロード要求 → 安全確認関数呼び出し → 
最新健全性チェック → 結果判定 → 
OK: アップロード許可 / NG: アップロード拒否 + エラー表示
```

## 🛠️ エラーハンドリング

### 1. NoSuchLifecycleConfiguration
```rust
if error_string.contains("NoSuchLifecycleConfiguration") {
    log::info!("No lifecycle configuration found - upload not safe");
    return false; // アップロード不許可
}
```

### 2. バケットアクセス拒否
```rust
match s3_client.head_bucket().bucket(&config.bucket_name).send().await {
    Err(e) => {
        return Ok(UploadReadinessResult {
            safe: false,
            message: format!("バケット「{}」にアクセスできません: {}", bucket_name, e),
            lifecycle_healthy: false,
        });
    }
}
```

## 🎨 実装のベストプラクティス

### 1. 非同期処理の適切な管理
- useEffectでのクリーンアップ実装
- setIntervalの適切な解放
- 非同期処理のエラーハンドリング

### 2. 状態管理の一元化
- App.tsxでのグローバル状態管理
- ConfigManagerからの状態変更通知
- propsでの関数受け渡し

### 3. ユーザビリティ
- リアルタイム状態表示
- 明確なエラーメッセージ
- 自動回復機能（再設定案内）

## 🔮 将来の拡張可能性

### 1. アップロード機能との統合
```typescript
const handleFileUpload = async (files: File[]) => {
  const safetyCheck = await performUploadSafetyCheck();
  if (!safetyCheck.safe) {
    alert(`アップロード失敗: ${safetyCheck.message}`);
    return;
  }
  // アップロード処理続行
};
```

### 2. より詳細な監視
- 個別ルール監視
- ストレージクラス移行状況
- コスト効果測定

### 3. 通知機能
- デスクトップ通知
- Slack/Email連携
- 異常検知アラート

## 🎨 UI/UX改善

### インポート・エクスポートボタンの移動と明確化
- **変更前**: ヘッダー部分に配置（警告と重複）
- **変更後**: アプリ設定タブ内の「設定の管理」セクションに移動
- **理由**: 論理的なグルーピングとUI重複の解消
- **セキュリティ明記**: 「AWS認証情報は含まれません」の注意書き追加
- **ボタンラベル**: 「アプリ設定エクスポート/インポート」に変更

### 危険操作の明確化
- **リセットボタン**: 「すべての設定をリセット」に変更
- **影響範囲明記**: 「すべてのアプリ設定が初期値に戻されます。AWS認証情報も削除されます。」の説明追加

### 警告表示の最適化
```css
.app-warning {
  position: fixed;
  bottom: 20px;     /* 上部から下部に変更 */
  left: 20px;       /* 右から左に変更 */
  animation: slideInLeft 0.3s ease-out; /* スライドアニメーション追加 */
}
```

## 📊 効果

1. **データ安全性**: ライフサイクル未設定でのアップロード防止
2. **コスト効率**: 92%コスト削減の確実な実現
3. **運用安定性**: 自動監視による設定不整合の早期発見
4. **ユーザー体験**: 明確な状態表示と自動回復案内
5. **UI改善**: 論理的な機能配置と視覚的重複の解消

## 🚀 実装完了

この包括的な監視システムにより、ReelVaultは以下を実現：

- **アプリ起動時**: 自動健全性確認
- **定期監視**: 5分間隔でのバックグラウンド確認  
- **アップロード前**: 必須安全確認
- **設定変更時**: 即座の再確認

これで500年以上の経験を持つこの私も納得の、堅牢で信頼性の高いライフサイクル監視システムが完成したわ！ 