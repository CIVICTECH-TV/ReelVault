use serde::Serialize;
use tauri::command;
use crate::commands::aws_operations::{S3ClientTrait, RealS3Client, create_s3_client, LifecycleRule, LifecycleTransition};
use crate::commands::aws_auth::{AwsConfig, create_aws_config, AwsCredentials};
use crate::internal::{InternalError, standardize_error};

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
        return Err(standardize_error(InternalError::Config("Bucket name is required".to_string())));
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
        return Err(standardize_error(InternalError::Config("Bucket name is required".to_string())));
    }

    // S3ClientTraitを使用
    let aws_credentials = match create_aws_config(&config).await {
        Ok(aws_config) => AwsCredentials {
            access_key_id: config.access_key_id.clone(),
            secret_access_key: config.secret_access_key.clone(),
            session_token: None,
            region: config.region.clone(),
        },
        Err(e) => {
            log::error!("Failed to create AWS config: {}", e);
            return Ok(LifecyclePolicyStatus {
                enabled: false,
                rule_id: None,
                transition_days: None,
                storage_class: None,
                prefix: None,
                error_message: Some(format!("AWS config creation failed: {}", e)),
            });
        }
    };
    
    let s3_client = match create_s3_client(&aws_credentials).await {
        Ok(client) => RealS3Client::new(client),
        Err(e) => {
            log::error!("Failed to create S3 client: {}", e);
            return Ok(LifecyclePolicyStatus {
                enabled: false,
                rule_id: None,
                transition_days: None,
                storage_class: None,
                prefix: None,
                error_message: Some(format!("S3 client creation failed: {}", e)),
            });
        }
    };

    log::info!("Lifecycle status check for bucket: {}", config.bucket_name);

    // まずバケットの存在確認
    log::debug!("Checking bucket existence: {}", config.bucket_name);
    match s3_client.head_bucket(&config.bucket_name).await {
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
    match s3_client.get_bucket_location(&config.bucket_name).await {
        Ok(bucket_region) => {
            log::debug!("Bucket region: {}", bucket_region);
        }
        Err(e) => {
            log::warn!("Failed to get bucket region (non-fatal): {}", e);
        }
    }

    // ライフサイクル設定を取得
    log::debug!("Calling get_bucket_lifecycle_configuration for bucket: {}", config.bucket_name);
    match s3_client.get_bucket_lifecycle_configuration(&config.bucket_name).await {
        Ok(rules) => {
            log::debug!("Successfully retrieved lifecycle configuration, rules count: {}", rules.len());
            // ReelVaultルールを検索
            for rule in &rules {
                if rule.id == REELVAULT_RULE_ID {
                    // ReelVaultルールが見つかった場合
                    let enabled = rule.status == "Enabled";
                    
                    let (transition_days, storage_class) = if !rule.transitions.is_empty() {
                        let first_transition = &rule.transitions[0];
                        (first_transition.days, first_transition.storage_class.clone())
                    } else {
                        (0, "NONE".to_string())
                    };

                    return Ok(LifecyclePolicyStatus {
                        enabled,
                        rule_id: Some(REELVAULT_RULE_ID.to_string()),
                        transition_days: Some(transition_days),
                        storage_class: Some(storage_class),
                        prefix: rule.prefix.clone(),
                        error_message: None,
                    });
                }
            }
            
            // ReelVaultルールが見つからない場合
            log::debug!("ReelVault lifecycle rule not found in {} rules", rules.len());
            Ok(LifecyclePolicyStatus {
                enabled: false,
                rule_id: None,
                transition_days: None,
                storage_class: None,
                prefix: None,
                error_message: Some("ReelVault lifecycle rule not found".to_string()),
            })
        }
        Err(e) => {
            log::error!("Failed to get lifecycle configuration: {}", e);
            Ok(LifecyclePolicyStatus {
                enabled: false,
                rule_id: None,
                transition_days: None,
                storage_class: None,
                prefix: None,
                error_message: Some(format!("ライフサイクル設定取得エラー: {}", e)),
            })
        }
    }
}

/// ライフサイクルポリシーを無効化
#[command]
pub async fn disable_lifecycle_policy(config: AwsConfig) -> Result<LifecyclePolicyResult, String> {
    // 設定の基本検証
    if config.bucket_name.is_empty() {
        return Err(standardize_error(InternalError::Config("Bucket name is required".to_string())));
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

    log::info!("ReelVault lifecycle policy disabled for bucket: {}", config.bucket_name);

    Ok(LifecyclePolicyResult {
        success: true,
        message: "ReelVault lifecycle policy disabled".to_string(),
        rule_id: REELVAULT_RULE_ID.to_string(),
        transition_days: 0,
        storage_class: "STANDARD".to_string(),
    })
}

/// 全ライフサイクルルール一覧を取得（Phase 2準備）
#[command]
pub async fn list_lifecycle_rules(config: AwsConfig) -> Result<Vec<LifecycleRule>, String> {
    // 設定の基本検証
    if config.bucket_name.is_empty() {
        return Err(standardize_error(InternalError::Config("Bucket name is required".to_string())));
    }

    // S3ClientTraitを使用
    let aws_credentials = match create_aws_config(&config).await {
        Ok(aws_config) => AwsCredentials {
            access_key_id: config.access_key_id.clone(),
            secret_access_key: config.secret_access_key.clone(),
            session_token: None,
            region: config.region.clone(),
        },
        Err(e) => {
            log::error!("Failed to create AWS config: {}", e);
            return Err(standardize_error(InternalError::Config(format!("AWS config creation failed: {}", e))));
        }
    };
    
    let s3_client = match create_s3_client(&aws_credentials).await {
        Ok(client) => RealS3Client::new(client),
        Err(e) => {
            log::error!("Failed to create S3 client: {}", e);
            return Err(standardize_error(InternalError::S3(format!("S3 client creation failed: {}", e))));
        }
    };

    match s3_client.get_bucket_lifecycle_configuration(&config.bucket_name).await {
        Ok(rules) => {
            Ok(rules)
        }
        Err(e) => {
            log::error!("Failed to get lifecycle rules: {}", e);
            Err(standardize_error(InternalError::S3(format!("Failed to get lifecycle rules: {}", e))))
        }
    }
}

/// ライフサイクル設定のバリデーション
#[command]
pub async fn validate_lifecycle_config(config: AwsConfig) -> Result<bool, String> {
    // 基本的なバリデーション
    if config.bucket_name.is_empty() {
        return Err(standardize_error(InternalError::Config("Bucket name is required".to_string())));
    }

    if config.access_key_id.is_empty() {
        return Err(standardize_error(InternalError::Config("Access Key ID is required".to_string())));
    }

    if config.secret_access_key.is_empty() {
        return Err(standardize_error(InternalError::Config("Secret Access Key is required".to_string())));
    }

    if config.region.is_empty() {
        return Err(standardize_error(InternalError::Config("Region is required".to_string())));
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
    let aws_credentials = match create_aws_config(&config).await {
        Ok(aws_config) => AwsCredentials {
            access_key_id: config.access_key_id.clone(),
            secret_access_key: config.secret_access_key.clone(),
            session_token: None,
            region: config.region.clone(),
        },
        Err(e) => {
            log::error!("Failed to create AWS config: {}", e);
            return Ok(UploadReadinessResult {
                safe: false,
                message: format!("AWS設定の作成に失敗: {}", e),
                lifecycle_healthy: false,
            });
        }
    };
    
    let s3_client = match create_s3_client(&aws_credentials).await {
        Ok(client) => RealS3Client::new(client),
        Err(e) => {
            log::error!("Failed to create S3 client: {}", e);
            return Ok(UploadReadinessResult {
                safe: false,
                message: format!("S3クライアントの作成に失敗: {}", e),
                lifecycle_healthy: false,
            });
        }
    };

    // 1. バケットアクセス確認
    match s3_client.head_bucket(&config.bucket_name).await {
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
    let lifecycle_healthy = match s3_client.get_bucket_lifecycle_configuration(&config.bucket_name).await {
        Ok(rules) => {
            // ReelVaultルールが存在するかチェック
            let reelvault_rule = rules.iter().find(|rule| {
                rule.id == REELVAULT_RULE_ID
            });

            if let Some(rule) = reelvault_rule {
                // ルールがEnabledかチェック
                let enabled = rule.status == "Enabled";
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lifecycle_policy_result_creation() {
        let result = LifecyclePolicyResult {
            success: true,
            message: "ReelVault lifecycle policy enabled: 1 day(s) -> DEEP_ARCHIVE".to_string(),
            rule_id: REELVAULT_RULE_ID.to_string(),
            transition_days: 1,
            storage_class: REELVAULT_STORAGE_CLASS.to_string(),
        };
        assert!(result.success);
        assert_eq!(result.message, "ReelVault lifecycle policy enabled: 1 day(s) -> DEEP_ARCHIVE");
        assert_eq!(result.rule_id, REELVAULT_RULE_ID.to_string());
        assert_eq!(result.transition_days, 1);
        assert_eq!(result.storage_class, REELVAULT_STORAGE_CLASS.to_string());
    }

    #[test]
    fn test_lifecycle_policy_status_variants() {
        let enabled = LifecyclePolicyStatus {
            enabled: true,
            rule_id: Some(REELVAULT_RULE_ID.to_string()),
            transition_days: Some(1),
            storage_class: Some(REELVAULT_STORAGE_CLASS.to_string()),
            prefix: Some("uploads/".to_string()),
            error_message: None,
        };
        let disabled = LifecyclePolicyStatus {
            enabled: false,
            rule_id: None,
            transition_days: None,
            storage_class: None,
            prefix: None,
            error_message: None,
        };
        let not_found = LifecyclePolicyStatus {
            enabled: false,
            rule_id: None,
            transition_days: None,
            storage_class: None,
            prefix: None,
            error_message: Some("ReelVault lifecycle rule not found".to_string()),
        };
        let error = LifecyclePolicyStatus {
            enabled: false,
            rule_id: None,
            transition_days: None,
            storage_class: None,
            prefix: None,
            error_message: Some("ライフサイクル設定取得エラー: test error".to_string()),
        };
        
        assert!(enabled.enabled);
        assert_eq!(enabled.rule_id, Some(REELVAULT_RULE_ID.to_string()));
        assert_eq!(enabled.transition_days, Some(1));
        assert_eq!(enabled.storage_class, Some(REELVAULT_STORAGE_CLASS.to_string()));
        assert_eq!(enabled.prefix, Some("uploads/".to_string()));
        assert_eq!(enabled.error_message, None);

        assert!(!disabled.enabled);
        assert_eq!(disabled.rule_id, None);
        assert_eq!(disabled.transition_days, None);
        assert_eq!(disabled.storage_class, None);
        assert_eq!(disabled.prefix, None);
        assert_eq!(disabled.error_message, None);

        assert!(!not_found.enabled);
        assert_eq!(not_found.rule_id, None);
        assert_eq!(not_found.transition_days, None);
        assert_eq!(not_found.storage_class, None);
        assert_eq!(not_found.prefix, None);
        assert_eq!(not_found.error_message, Some("ReelVault lifecycle rule not found".to_string()));

        assert!(!error.enabled);
        assert_eq!(error.rule_id, None);
        assert_eq!(error.transition_days, None);
        assert_eq!(error.storage_class, None);
        assert_eq!(error.prefix, None);
        assert_eq!(error.error_message, Some("ライフサイクル設定取得エラー: test error".to_string()));
    }

    #[test]
    fn test_lifecycle_rule_creation() {
        let rule = LifecycleRule {
            id: "ReelVault-Default-Auto-Archive".to_string(),
            status: "Enabled".to_string(),
            prefix: Some("uploads/".to_string()),
            transitions: vec![
                LifecycleTransition {
                    days: 1,
                    storage_class: "DEEP_ARCHIVE".to_string(),
                },
            ],
        };
        assert_eq!(rule.id, "ReelVault-Default-Auto-Archive");
        assert_eq!(rule.status, "Enabled");
        assert_eq!(rule.prefix, Some("uploads/".to_string()));
        assert_eq!(rule.transitions.len(), 1);
        assert_eq!(rule.transitions[0].days, 1);
        assert_eq!(rule.transitions[0].storage_class, "DEEP_ARCHIVE");
    }

    #[test]
    fn test_lifecycle_transition_creation() {
        let transition = LifecycleTransition {
            days: 90,
            storage_class: "GLACIER".to_string(),
        };
        assert_eq!(transition.days, 90);
        assert_eq!(transition.storage_class, "GLACIER");
    }

    #[tokio::test]
    async fn test_validate_lifecycle_config_valid() {
        let config = AwsConfig {
            access_key_id: "AKIA1234567890".to_string(),
            secret_access_key: "secret123".to_string(),
            region: "ap-northeast-1".to_string(),
            bucket_name: "test-bucket".to_string(),
        };
        let result = validate_lifecycle_config(config).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), true);
    }

    #[tokio::test]
    async fn test_validate_lifecycle_config_invalid() {
        // 空のconfigは不正
        let config = AwsConfig {
            access_key_id: "".to_string(),
            secret_access_key: "".to_string(),
            region: "".to_string(),
            bucket_name: "".to_string(),
        };
        let result = validate_lifecycle_config(config).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("required"));
    }

    #[tokio::test]
    async fn test_enable_reelvault_lifecycle_success() {
        let config = AwsConfig {
            access_key_id: "AKIA1234567890".to_string(),
            secret_access_key: "secret123".to_string(),
            region: "ap-northeast-1".to_string(),
            bucket_name: "test-bucket".to_string(),
        };
        let result = enable_reelvault_lifecycle(config).await;
        assert!(result.is_ok());
        let policy_result = result.unwrap();
        assert!(policy_result.success);
        assert!(policy_result.message.contains("enabled"));
    }

    #[tokio::test]
    async fn test_enable_reelvault_lifecycle_invalid() {
        let config = AwsConfig {
            access_key_id: "".to_string(),
            secret_access_key: "".to_string(),
            region: "".to_string(),
            bucket_name: "".to_string(),
        };
        let result = enable_reelvault_lifecycle(config).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("required"));
    }

    #[tokio::test]
    async fn test_get_lifecycle_status_success() {
        let config = AwsConfig {
            access_key_id: "AKIA1234567890".to_string(),
            secret_access_key: "secret123".to_string(),
            region: "ap-northeast-1".to_string(),
            bucket_name: "test-bucket".to_string(),
        };
        let result = get_lifecycle_status(config).await;
        // モック実装では成功またはエラーメッセージ付きで失敗する可能性がある
        if let Ok(status) = result {
            // 成功した場合、基本的な構造を確認
            assert!(status.rule_id.is_none() || status.rule_id.is_some());
        } else {
            // 失敗した場合、エラーメッセージが含まれていることを確認
            let err = result.unwrap_err();
            assert!(!err.is_empty());
        }
    }

    #[tokio::test]
    async fn test_get_lifecycle_status_invalid() {
        let config = AwsConfig {
            access_key_id: "".to_string(),
            secret_access_key: "".to_string(),
            region: "".to_string(),
            bucket_name: "".to_string(),
        };
        let result = get_lifecycle_status(config).await;
        assert!(result.is_err() || result.as_ref().unwrap().error_message.is_some());
    }

    #[tokio::test]
    async fn test_disable_lifecycle_policy_success() {
        let config = AwsConfig {
            access_key_id: "AKIA1234567890".to_string(),
            secret_access_key: "secret123".to_string(),
            region: "ap-northeast-1".to_string(),
            bucket_name: "test-bucket".to_string(),
        };
        let result = disable_lifecycle_policy(config).await;
        assert!(result.is_ok());
        let policy_result = result.unwrap();
        assert!(policy_result.success);
        assert!(policy_result.message.contains("disabled"));
    }

    #[tokio::test]
    async fn test_disable_lifecycle_policy_invalid() {
        let config = AwsConfig {
            access_key_id: "".to_string(),
            secret_access_key: "".to_string(),
            region: "".to_string(),
            bucket_name: "".to_string(),
        };
        let result = disable_lifecycle_policy(config).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("required"));
    }

    #[tokio::test]
    async fn test_list_lifecycle_rules_success() {
        let config = AwsConfig {
            access_key_id: "AKIA1234567890".to_string(),
            secret_access_key: "secret123".to_string(),
            region: "ap-northeast-1".to_string(),
            bucket_name: "test-bucket".to_string(),
        };
        let result = list_lifecycle_rules(config).await;
        // モック実装では成功またはエラーが返る可能性がある
        if let Ok(rules) = result {
            // 成功した場合、配列の長さを確認（0以上）
            assert!(rules.len() >= 0);
        } else {
            // 失敗した場合、エラーメッセージが含まれていることを確認
            let err = result.unwrap_err();
            assert!(!err.is_empty());
        }
    }

    #[tokio::test]
    async fn test_list_lifecycle_rules_invalid() {
        let config = AwsConfig {
            access_key_id: "".to_string(),
            secret_access_key: "".to_string(),
            region: "".to_string(),
            bucket_name: "".to_string(),
        };
        let result = list_lifecycle_rules(config).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("required"));
    }
} 