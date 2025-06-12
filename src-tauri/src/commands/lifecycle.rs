use serde::Serialize;
use tauri::command;
use aws_sdk_s3::Client as S3Client;
use crate::commands::aws_auth::{AwsConfig, create_aws_config};

/// ReelVault固定ライフサイクル設定
const REELVAULT_TRANSITION_DAYS: i32 = 1;  // 1日後移行
const REELVAULT_RULE_ID: &str = "ReelVault-Default-Auto-Archive";
const REELVAULT_STORAGE_CLASS: &str = "DEEP_ARCHIVE";



/// ライフサイクルポリシー設定結果
#[derive(Debug, Serialize)]
pub struct LifecyclePolicyResult {
    pub success: bool,
    pub message: String,
    pub rule_id: String,
    pub transition_days: i32,
    pub storage_class: String,
}

/// ライフサイクルポリシー状況
#[derive(Debug, Serialize)]
pub struct LifecyclePolicyStatus {
    pub enabled: bool,
    pub rule_id: Option<String>,
    pub transition_days: Option<i32>,
    pub storage_class: Option<String>,
    pub prefix: Option<String>,
    pub error_message: Option<String>,
}

/// ライフサイクルルール詳細
#[derive(Debug, Serialize)]
pub struct LifecycleRule {
    pub id: String,
    pub status: String,  // "Enabled" or "Disabled"
    pub prefix: Option<String>,
    pub transitions: Vec<LifecycleTransition>,
}

/// ライフサイクル移行設定
#[derive(Debug, Serialize)]
pub struct LifecycleTransition {
    pub days: i32,
    pub storage_class: String,
}

/// ReelVault標準ライフサイクルポリシーを有効化
/// 
/// 固定設定:
/// - uploads/配下の全ファイル
/// - 1日後にDEEP_ARCHIVEに移行
/// - 128KB以上のファイルのみ（AWS制限）
#[command]
pub async fn enable_reelvault_lifecycle(config: AwsConfig) -> Result<LifecyclePolicyResult, String> {
    // 設定の基本検証
    if config.bucket_name.is_empty() {
        return Err("Bucket name is required".to_string());
    }

    // TODO: AWS SDK for Rustを使った実装
    // 現在はモック実装
    // 
    // let aws_config = aws_config::load_from_env().await;
    // let s3_client = aws_sdk_s3::Client::new(&aws_config);
    // 
    // let lifecycle_config = create_reelvault_lifecycle_config();
    // let result = s3_client
    //     .put_bucket_lifecycle_configuration()
    //     .bucket(&config.bucket_name)
    //     .lifecycle_configuration(lifecycle_config)
    //     .send()
    //     .await
    //     .map_err(|e| format!("Failed to set lifecycle policy: {}", e))?;

    log::info!("ReelVault lifecycle policy enabled for bucket: {}", config.bucket_name);
    log::info!("Rule: {} days -> {}", REELVAULT_TRANSITION_DAYS, REELVAULT_STORAGE_CLASS);

    Ok(LifecyclePolicyResult {
        success: true,
        message: format!(
            "ReelVault lifecycle policy enabled: {} day(s) -> {}",
            REELVAULT_TRANSITION_DAYS, REELVAULT_STORAGE_CLASS
        ),
        rule_id: REELVAULT_RULE_ID.to_string(),
        transition_days: REELVAULT_TRANSITION_DAYS,
        storage_class: REELVAULT_STORAGE_CLASS.to_string(),
    })
}

/// 現在のライフサイクルポリシー設定状況を取得
#[command]
pub async fn get_lifecycle_status(config: AwsConfig) -> Result<LifecyclePolicyStatus, String> {
    // 設定の基本検証
    if config.bucket_name.is_empty() {
        return Err("Bucket name is required".to_string());
    }

    use aws_config::{Region, BehaviorVersion};
    use aws_credential_types::Credentials;
    use aws_sdk_s3::Client as S3Client;

    let region = Region::new(config.region.clone());
    let mut config_builder = aws_config::defaults(BehaviorVersion::latest())
        .region(region);

    // 認証情報を設定
    let creds = Credentials::new(
        &config.access_key_id,
        &config.secret_access_key,
        None,
        None,
        "manual",
    );
    config_builder = config_builder.credentials_provider(creds);
    let aws_config = config_builder.load().await;

    let s3_client = S3Client::new(&aws_config);

    log::info!("Lifecycle status check for bucket: {}", config.bucket_name);

    // まずバケットの存在確認
    log::debug!("Checking bucket existence: {}", config.bucket_name);
    match s3_client.head_bucket().bucket(&config.bucket_name).send().await {
        Ok(_) => {
            log::debug!("Bucket exists and accessible: {}", config.bucket_name);
        }
        Err(e) => {
            log::error!("Bucket access failed: {}", e);
            return Ok(LifecyclePolicyStatus {
                enabled: false,
                rule_id: None,
                transition_days: None,
                storage_class: None,
                prefix: None,
                error_message: Some(format!("バケットアクセスエラー: {}", e)),
            });
        }
    }

    // バケットのリージョン確認
    log::debug!("Checking bucket region: {}", config.bucket_name);
    match s3_client.get_bucket_location().bucket(&config.bucket_name).send().await {
        Ok(response) => {
            let bucket_region = response.location_constraint().map(|r| r.as_str()).unwrap_or("us-east-1");
            log::debug!("Bucket region: {}", bucket_region);
        }
        Err(e) => {
            log::warn!("Failed to get bucket region (non-fatal): {}", e);
        }
    }

    // ライフサイクル設定を取得
    log::debug!("Calling get_bucket_lifecycle_configuration for bucket: {}", config.bucket_name);
    match s3_client
        .get_bucket_lifecycle_configuration()
        .bucket(&config.bucket_name)
        .send()
        .await
    {
        Ok(response) => {
            log::debug!("Successfully retrieved lifecycle configuration, rules count: {}", response.rules().len());
            // ReelVaultルールを検索
            for rule in response.rules() {
                if rule.id().unwrap_or("") == REELVAULT_RULE_ID {
                    // ReelVaultルールが見つかった場合
                    let enabled = rule.status() == &aws_sdk_s3::types::ExpirationStatus::Enabled;
                    
                    let (transition_days, storage_class) = if !rule.transitions().is_empty() {
                        let transitions = rule.transitions();
                        if let Some(first_transition) = transitions.first() {
                            (
                                first_transition.days(),
                                first_transition.storage_class().map(|sc| match sc {
                                    aws_sdk_s3::types::TransitionStorageClass::DeepArchive => "DEEP_ARCHIVE",
                                    aws_sdk_s3::types::TransitionStorageClass::Glacier => "GLACIER",
                                    aws_sdk_s3::types::TransitionStorageClass::StandardIa => "STANDARD_IA",
                                    _ => "UNKNOWN",
                                }).unwrap_or("UNKNOWN").to_string()
                            )
                        } else {
                            (None, "NONE".to_string())
                        }
                    } else {
                        (None, "NONE".to_string())
                    };

                    let prefix = rule.filter()
                        .and_then(|f| f.prefix())
                        .map(|p| p.to_string());

                    return Ok(LifecyclePolicyStatus {
                        enabled,
                        rule_id: Some(REELVAULT_RULE_ID.to_string()),
                        transition_days,
                        storage_class: Some(storage_class),
                        prefix,
                        error_message: None,
                    });
                }
            }
            
            // ReelVaultルールが見つからない場合
            log::debug!("ReelVault lifecycle rule not found in {} rules", response.rules().len());
            Ok(LifecyclePolicyStatus {
                enabled: false,
                rule_id: None,
                transition_days: None,
                storage_class: None,
                prefix: None,
                error_message: None,
            })
        }
        Err(e) => {
            let error_string = e.to_string();
            log::warn!("Error getting lifecycle configuration: {}", error_string);
            
            // より詳細なエラー情報をログ出力
            log::error!("Detailed error: {:?}", e);
            
            // 詳細エラーからエラーコードを抽出
            let detailed_error = format!("{:?}", e);
            log::debug!("Searching for error codes in: {}", detailed_error);
            
            if error_string.contains("NoSuchLifecycleConfiguration") || detailed_error.contains("NoSuchLifecycleConfiguration") {
                // ライフサイクル設定が存在しない - これは正常な状態
                log::info!("No lifecycle configuration found for bucket: {} - this is normal for new buckets", config.bucket_name);
                Ok(LifecyclePolicyStatus {
                    enabled: false,
                    rule_id: None,
                    transition_days: None,
                    storage_class: None,
                    prefix: None,
                    error_message: Some("ライフサイクル設定が未設定です。AWS設定でバケットアクセステストを実行してください。".to_string()),
                })
            } else if error_string.contains("AccessDenied") || error_string.contains("Forbidden") {
                // 権限エラーの場合
                log::error!("Access denied for lifecycle configuration on bucket: {}", config.bucket_name);
                Ok(LifecyclePolicyStatus {
                    enabled: false,
                    rule_id: None,
                    transition_days: None,
                    storage_class: None,
                    prefix: None,
                    error_message: Some("権限エラー: ライフサイクル設定の読み取り権限がありません".to_string()),
                })
            } else {
                log::error!("Failed to get lifecycle status for bucket {}: {}", config.bucket_name, e);
                // エラーの場合でも、とりあえず無効状態として返す（UIが固まらないように）
                Ok(LifecyclePolicyStatus {
                    enabled: false,
                    rule_id: None,
                    transition_days: None,
                    storage_class: None,
                    prefix: None,
                    error_message: Some(format!("エラー: {}", error_string)),
                })
            }
        }
    }
}

/// ライフサイクルポリシーを無効化
#[command]
pub async fn disable_lifecycle_policy(config: AwsConfig) -> Result<LifecyclePolicyResult, String> {
    // 設定の基本検証
    if config.bucket_name.is_empty() {
        return Err("Bucket name is required".to_string());
    }

    // TODO: AWS SDK for Rustを使った実装
    // 現在はモック実装
    // 
    // let aws_config = aws_config::load_from_env().await;
    // let s3_client = aws_sdk_s3::Client::new(&aws_config);
    // 
    // let result = s3_client
    //     .delete_bucket_lifecycle()
    //     .bucket(&config.bucket_name)
    //     .send()
    //     .await
    //     .map_err(|e| format!("Failed to disable lifecycle policy: {}", e))?;

    log::info!("Lifecycle policy disabled for bucket: {}", config.bucket_name);

    Ok(LifecyclePolicyResult {
        success: true,
        message: "Lifecycle policy disabled successfully".to_string(),
        rule_id: "".to_string(),
        transition_days: 0,
        storage_class: "".to_string(),
    })
}

/// 全ライフサイクルルール一覧を取得（Phase 2準備）
#[command]
pub async fn list_lifecycle_rules(config: AwsConfig) -> Result<Vec<LifecycleRule>, String> {
    // 設定の基本検証
    if config.bucket_name.is_empty() {
        return Err("Bucket name is required".to_string());
    }

    // TODO: AWS SDK for Rustを使った実装
    // 現在はモック実装
    // 
    // let aws_config = aws_config::load_from_env().await;
    // let s3_client = aws_sdk_s3::Client::new(&aws_config);
    // 
    // let result = s3_client
    //     .get_bucket_lifecycle_configuration()
    //     .bucket(&config.bucket_name)
    //     .send()
    //     .await;
    // 
    // match result {
    //     Ok(output) => {
    //         if let Some(lifecycle_config) = output.rules {
    //             let rules: Vec<LifecycleRule> = lifecycle_config
    //                 .into_iter()
    //                 .map(|rule| parse_full_lifecycle_rule(rule))
    //                 .collect();
    //             Ok(rules)
    //         } else {
    //             Ok(vec![])
    //         }
    //     }
    //     Err(e) => {
    //         if e.to_string().contains("NoSuchLifecycleConfiguration") {
    //             Ok(vec![])
    //         } else {
    //             Err(format!("Failed to list lifecycle rules: {}", e))
    //         }
    //     }
    // }

    log::info!("Lifecycle rules list requested for bucket: {}", config.bucket_name);

    // モック実装：空のリストを返す
    Ok(vec![])
}

/// ライフサイクル設定のバリデーション
#[command]
pub async fn validate_lifecycle_config(config: AwsConfig) -> Result<bool, String> {
    // 基本的なバリデーション
    if config.bucket_name.is_empty() {
        return Err("Bucket name is required".to_string());
    }

    if config.access_key_id.is_empty() {
        return Err("Access Key ID is required".to_string());
    }

    if config.secret_access_key.is_empty() {
        return Err("Secret Access Key is required".to_string());
    }

    if config.region.is_empty() {
        return Err("Region is required".to_string());
    }

    // TODO: AWS接続テストとバケット権限チェック
    // let aws_config = aws_config::load_from_env().await;
    // let s3_client = aws_sdk_s3::Client::new(&aws_config);
    // 
    // // バケット存在チェック
    // s3_client.head_bucket().bucket(&config.bucket_name).send().await
    //     .map_err(|e| format!("Bucket access failed: {}", e))?;
    // 
    // // ライフサイクル設定権限チェック
    // let test_config = create_reelvault_lifecycle_config();
    // s3_client
    //     .put_bucket_lifecycle_configuration()
    //     .bucket(&config.bucket_name)
    //     .lifecycle_configuration(test_config)
    //     .send()
    //     .await
    //     .map_err(|e| format!("Lifecycle permission denied: {}", e))?;

    log::info!("Lifecycle config validation completed for bucket: {}", config.bucket_name);

    Ok(true)
}

#[derive(serde::Serialize)]
pub struct UploadReadinessResult {
    pub safe: bool,
    pub message: String,
    pub lifecycle_healthy: bool,
}

/// アップロード前の安全確認
#[command]
pub async fn check_upload_readiness(config: AwsConfig) -> Result<UploadReadinessResult, String> {
    log::info!("Checking upload readiness for bucket: {}", config.bucket_name);

    // 基本設定チェック
    if config.bucket_name.is_empty() {
        return Ok(UploadReadinessResult {
            safe: false,
            message: "S3バケット名が設定されていません".to_string(),
            lifecycle_healthy: false,
        });
    }

    if config.access_key_id.is_empty() || config.secret_access_key.is_empty() {
        return Ok(UploadReadinessResult {
            safe: false,
            message: "AWS認証情報が不完全です".to_string(),
            lifecycle_healthy: false,
        });
    }

    // AWS設定を作成
    let aws_config = match create_aws_config(&config).await {
        Ok(cfg) => cfg,
        Err(e) => {
            log::error!("Failed to create AWS config: {}", e);
            return Ok(UploadReadinessResult {
                safe: false,
                message: format!("AWS設定の作成に失敗: {}", e),
                lifecycle_healthy: false,
            });
        }
    };

    let s3_client = S3Client::new(&aws_config);

    // 1. バケットアクセス確認
    match s3_client.head_bucket()
        .bucket(&config.bucket_name)
        .send()
        .await 
    {
        Ok(_) => {
            log::info!("✅ Bucket access confirmed: {}", config.bucket_name);
        }
        Err(e) => {
            log::warn!("❌ Bucket access check failed: {:?}", e);
            return Ok(UploadReadinessResult {
                safe: false,
                message: format!("バケット「{}」にアクセスできません: {}", config.bucket_name, e),
                lifecycle_healthy: false,
            });
        }
    }

    // 2. ライフサイクル設定確認
    let lifecycle_healthy = match s3_client.get_bucket_lifecycle_configuration()
        .bucket(&config.bucket_name)
        .send()
        .await 
    {
        Ok(response) => {
            // ReelVaultルールが存在するかチェック
                         let rules = response.rules();
            let reelvault_rule = rules.iter().find(|rule| {
                rule.id().map_or(false, |id| id == REELVAULT_RULE_ID)
            });

            if let Some(rule) = reelvault_rule {
                // ルールがEnabledかチェック
                let enabled = rule.status() == &aws_sdk_s3::types::ExpirationStatus::Enabled;
                log::info!("ReelVault lifecycle rule found, enabled: {}", enabled);
                enabled
            } else {
                log::warn!("ReelVault lifecycle rule not found");
                false
            }
        },
        Err(e) => {
            // エラーの詳細をチェック
            let error_string = e.to_string();
            log::warn!("Error checking lifecycle configuration: {}", error_string);
            
            if error_string.contains("NoSuchLifecycleConfiguration") {
                log::info!("No lifecycle configuration found for bucket: {} - upload not safe", config.bucket_name);
                false
            } else {
                log::error!("Unexpected lifecycle check error: {:?}", e);
                false
            }
        }
    };

    // 3. 結果判定
    if lifecycle_healthy {
        log::info!("✅ Upload readiness check passed for bucket: {}", config.bucket_name);
        Ok(UploadReadinessResult {
            safe: true,
            message: "アップロード準備完了。ライフサイクル設定も正常です。".to_string(),
            lifecycle_healthy: true,
        })
    } else {
        log::warn!("⚠️ Upload readiness check failed - lifecycle not configured for bucket: {}", config.bucket_name);
        Ok(UploadReadinessResult {
            safe: false,
            message: format!(
                "ライフサイクル設定に問題があります。バケット「{}」のライフサイクルポリシーが見つかりません。AWS認証タブで「🔄 ライフサイクル再設定」を実行してください。", 
                config.bucket_name
            ),
            lifecycle_healthy: false,
        })
    }
}

// 内部ヘルパー関数（将来のAWS SDK実装用）

// ReelVault固定ライフサイクル設定を生成
// fn create_reelvault_lifecycle_config() -> LifecycleConfiguration {
//     use aws_sdk_s3::types::{
//         LifecycleConfiguration, LifecycleRule, LifecycleRuleFilter,
//         Transition, BucketLifecycleConfigurationStatus, TransitionStorageClass
//     };
//     
//     let transition = Transition::builder()
//         .days(REELVAULT_TRANSITION_DAYS)
//         .storage_class(TransitionStorageClass::DeepArchive)
//         .build();
//     
//     let rule = LifecycleRule::builder()
//         .id(REELVAULT_RULE_ID)
//         .status(BucketLifecycleConfigurationStatus::Enabled)
//         .filter(LifecycleRuleFilter::Prefix("uploads/".to_string()))
//         .transitions(transition)
//         .build();
//     
//     LifecycleConfiguration::builder()
//         .rules(rule)
//         .build()
// }

// ライフサイクルルールをパース
// fn parse_lifecycle_rule(rule: LifecycleRule) -> LifecyclePolicyStatus {
//     let mut transition_days = None;
//     let mut storage_class = None;
//     
//     if let Some(transitions) = rule.transitions {
//         if let Some(first_transition) = transitions.first() {
//             transition_days = first_transition.days;
//             storage_class = first_transition.storage_class.as_ref().map(|s| s.to_string());
//         }
//     }
//     
//     let prefix = match rule.filter {
//         Some(LifecycleRuleFilter::Prefix(p)) => Some(p),
//         _ => None,
//     };
//     
//     LifecyclePolicyStatus {
//         enabled: rule.status == Some(BucketLifecycleConfigurationStatus::Enabled),
//         rule_id: rule.id,
//         transition_days,
//         storage_class,
//         prefix,
//         error_message: None,
//     }
// } 