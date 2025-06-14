# ReelVault アップロード・ダウンロード機能制限実装

## 🎯 概要

ReelVaultにおける無料版・プレミアム版の機能制限実装について説明します。AWS S3コンソールとの整合性を保ちつつ、プレミアム機能への明確なアップグレードパスを提供する設計です。

## 📊 機能制限マトリックス

### 🆓 無料版制限（AWS S3コンソール相当）

#### アップロード機能
```rust
pub struct FreeTierUploadConfig {
    pub max_file_size: u64,           // 160GB (AWS S3コンソール制限)
    pub max_concurrent_uploads: usize, // 1ファイル
    pub chunk_size_mb: u64,           // 5MB固定（AWS最小値）
    pub retry_attempts: u32,          // 3回
    pub folder_upload_enabled: bool,  // false
    pub watch_folder_enabled: bool,   // false
}

impl Default for FreeTierUploadConfig {
    fn default() -> Self {
        Self {
            max_file_size: 160 * 1024 * 1024 * 1024, // 160GB
            max_concurrent_uploads: 1,
            chunk_size_mb: 5,
            retry_attempts: 3,
            folder_upload_enabled: false,
            watch_folder_enabled: false,
        }
    }
}
```

#### ダウンロード機能
```rust
pub struct FreeTierDownloadConfig {
    pub max_concurrent_downloads: usize, // 1ファイル
    pub resume_enabled: bool,            // false
    pub range_request_enabled: bool,     // false
    pub session_timeout_hours: u64,      // 12時間
    pub retry_attempts: u32,             // 3回
}

impl Default for FreeTierDownloadConfig {
    fn default() -> Self {
        Self {
            max_concurrent_downloads: 1,
            resume_enabled: false,
            range_request_enabled: false,
            session_timeout_hours: 12,
            retry_attempts: 3,
        }
    }
}
```

### 💎 プレミアム版機能

#### 高速アップロード
```rust
pub struct PremiumUploadConfig {
    pub max_file_size: u64,              // 5TB（AWS SDK制限）
    pub max_concurrent_uploads: usize,    // 8ファイル
    pub adaptive_chunk_size: bool,        // true（動的最適化）
    pub retry_attempts: u32,              // 10回
    pub folder_upload_enabled: bool,      // true
    pub watch_folder_enabled: bool,       // true
    pub bandwidth_control: bool,          // true
    pub custom_s3_key_generation: bool,   // true
    pub exclude_patterns: bool,           // true
}
```

#### 高速ダウンロード
```rust
pub struct PremiumDownloadConfig {
    pub max_concurrent_downloads: usize,  // 8ファイル
    pub multipart_download: bool,         // true
    pub resume_enabled: bool,             // true
    pub range_request_enabled: bool,      // true
    pub bandwidth_control: bool,          // true
    pub session_timeout_hours: u64,       // 無制限
    pub retry_attempts: u32,              // 10回
}
```

## 🔧 実装アーキテクチャ

### 1. フィーチャーフラグシステム

```rust
#[derive(Debug, Clone)]
pub struct FeatureFlags {
    pub premium_features_enabled: bool,
    pub upload_tier: UploadTier,
    pub download_tier: DownloadTier,
}

#[derive(Debug, Clone)]
pub enum UploadTier {
    Free(FreeTierUploadConfig),
    Premium(PremiumUploadConfig),
}

#[derive(Debug, Clone)]
pub enum DownloadTier {
    Free(FreeTierDownloadConfig),
    Premium(PremiumDownloadConfig),
}
```

### 2. 制限チェック機能

```rust
impl UploadSystem {
    pub fn validate_upload_request(&self, request: &UploadRequest) -> Result<(), UploadError> {
        match &self.config.upload_tier {
            UploadTier::Free(config) => {
                // ファイルサイズチェック
                if request.file_size > config.max_file_size {
                    return Err(UploadError::FileSizeExceeded {
                        size: request.file_size,
                        limit: config.max_file_size,
                        upgrade_message: "160GBを超えるファイルのアップロードにはプレミアム版が必要です".to_string(),
                    });
                }
                
                // 同時アップロード数チェック
                if self.active_uploads.len() >= config.max_concurrent_uploads {
                    return Err(UploadError::ConcurrencyLimitExceeded {
                        active: self.active_uploads.len(),
                        limit: config.max_concurrent_uploads,
                        upgrade_message: "複数ファイルの同時アップロードにはプレミアム版が必要です".to_string(),
                    });
                }
            },
            UploadTier::Premium(config) => {
                // プレミアム版の制限チェック（より緩い制限）
                if request.file_size > config.max_file_size {
                    return Err(UploadError::FileSizeExceeded {
                        size: request.file_size,
                        limit: config.max_file_size,
                        upgrade_message: "".to_string(),
                    });
                }
            }
        }
        Ok(())
    }
}
```

### 3. UI制限表示

```typescript
// React コンポーネントでの制限表示
interface UploadLimitsDisplayProps {
  featureFlags: FeatureFlags;
}

const UploadLimitsDisplay: React.FC<UploadLimitsDisplayProps> = ({ featureFlags }) => {
  const isPremium = featureFlags.premium_features_enabled;
  
  return (
    <div className="limits-display">
      <h3>現在のプラン制限</h3>
      
      <div className="limit-item">
        <span>最大ファイルサイズ:</span>
        <span className={isPremium ? "premium" : "free"}>
          {isPremium ? "5TB" : "160GB"}
        </span>
        {!isPremium && (
          <button onClick={handleUpgrade}>プレミアムにアップグレード</button>
        )}
      </div>
      
      <div className="limit-item">
        <span>同時アップロード数:</span>
        <span className={isPremium ? "premium" : "free"}>
          {isPremium ? "最大8ファイル" : "1ファイル"}
        </span>
      </div>
      
      <div className="limit-item">
        <span>監視フォルダ:</span>
        <span className={isPremium ? "premium" : "free"}>
          {isPremium ? "利用可能" : "プレミアム機能"}
        </span>
      </div>
    </div>
  );
};
```

## 🎨 ユーザーエクスペリエンス設計

### 1. 制限到達時の案内

```typescript
const handleFileSizeExceeded = (error: UploadError) => {
  if (error.type === 'FileSizeExceeded') {
    showUpgradeDialog({
      title: "ファイルサイズ制限に到達",
      message: `選択されたファイル（${formatFileSize(error.size)}）は無料版の制限（160GB）を超えています。`,
      upgradeMessage: "プレミアム版では最大5TBまでのファイルをアップロードできます。",
      features: [
        "最大5TBのファイルサイズ",
        "最大8ファイルの同時アップロード", 
        "監視フォルダ自動アップロード",
        "高速マルチパートダウンロード"
      ]
    });
  }
};
```

### 2. 段階的機能開放

```typescript
const FeatureGate: React.FC<{
  feature: string;
  isPremium: boolean;
  children: React.ReactNode;
}> = ({ feature, isPremium, children }) => {
  if (isPremium) {
    return <>{children}</>;
  }
  
  return (
    <div className="feature-gate">
      <div className="feature-locked">
        <LockIcon />
        <span>{feature}はプレミアム機能です</span>
        <button onClick={handleUpgrade}>アップグレード</button>
      </div>
    </div>
  );
};

// 使用例
<FeatureGate feature="監視フォルダ" isPremium={featureFlags.premium_features_enabled}>
  <WatchFolderSettings />
</FeatureGate>
```

## 🔄 移行・アップグレード戦略

### 1. 既存システムとの互換性

```rust
impl UploadSystem {
    pub fn migrate_from_unlimited_to_tiered(&mut self) -> Result<(), MigrationError> {
        // 既存の高度なアップロードシステムを制限モードで動作
        self.config.upload_tier = UploadTier::Free(FreeTierUploadConfig::default());
        
        // 進行中のアップロードは継続許可
        for upload in &mut self.active_uploads {
            upload.legacy_mode = true; // 制限適用除外
        }
        
        Ok(())
    }
}
```

### 2. プレミアム機能の段階的解放

```rust
impl FeatureFlags {
    pub fn upgrade_to_premium(&mut self) {
        self.premium_features_enabled = true;
        self.upload_tier = UploadTier::Premium(PremiumUploadConfig::default());
        self.download_tier = DownloadTier::Premium(PremiumDownloadConfig::default());
        
        // 制限解除通知
        self.notify_feature_unlock();
    }
}
```

## 📈 実装優先順位

### Phase 1: 基本制限実装（Issue #57）
1. ファイルサイズ制限（160GB）
2. 同時アップロード制限（1ファイル）
3. 基本UI制限表示

### Phase 2: プレミアム機能実装（Issue #59, #61）
1. フィーチャーフラグシステム
2. 高速アップロード機能
3. 高速ダウンロード機能
4. アップグレード案内UI

### Phase 3: 運用最適化
1. 使用量分析・監視
2. 制限調整・A/Bテスト
3. ユーザーフィードバック反映

## 🎯 成功指標

### 技術指標
- 無料版制限の確実な適用（100%）
- プレミアム機能の正常動作（99.9%）
- アップグレード案内の適切な表示

### ビジネス指標
- 無料版→プレミアム版転換率
- ユーザー満足度（制限の明確性）
- サポート問い合わせ削減

---

この実装により、AWS S3コンソールと同等の無料機能を提供しつつ、プレミアム機能への明確なアップグレードパスを実現します。 