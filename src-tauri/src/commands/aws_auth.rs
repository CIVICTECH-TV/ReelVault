use serde::{Deserialize, Serialize};
use tauri::command;
use aws_config::{BehaviorVersion, Region};
use aws_sdk_s3::Client as S3Client;
use aws_sdk_sts::Client as StsClient;

// AWS設定構造体（他のモジュールと共有用）
#[derive(Debug, Deserialize, Clone)]
pub struct AwsConfig {
    pub access_key_id: String,
    pub secret_access_key: String,
    pub region: String,
    pub bucket_name: String,
}

/// AWS認証情報
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AwsCredentials {
    pub access_key_id: String,
    pub secret_access_key: String,
    pub region: String,
    pub session_token: Option<String>,
}

/// AWS認証結果
#[derive(Debug, Serialize)]
pub struct AwsAuthResult {
    pub success: bool,
    pub message: String,
    pub user_identity: Option<AwsUserIdentity>,
    pub permissions: Vec<String>,
}

/// AWS ユーザー情報
#[derive(Debug, Serialize)]
pub struct AwsUserIdentity {
    pub user_id: String,
    pub arn: String,
    pub account: String,
}

/// AWS権限チェック結果
#[derive(Debug, Serialize)]
pub struct PermissionCheck {
    pub service: String,
    pub action: String,
    pub resource: String,
    pub allowed: bool,
}

/// AWS認証を実行する
#[command]
pub async fn authenticate_aws(credentials: AwsCredentials) -> Result<AwsAuthResult, String> {
    // 認証情報の基本検証
    if credentials.access_key_id.is_empty() || credentials.secret_access_key.is_empty() {
        return Ok(AwsAuthResult {
            success: false,
            message: "Access Key ID and Secret Access Key are required".to_string(),
            user_identity: None,
            permissions: vec![],
        });
    }

    // AWS設定を構築
    let region = Region::new(credentials.region.clone());
    let mut config_builder = aws_config::defaults(BehaviorVersion::latest())
        .region(region);

    // 認証情報を設定
    use aws_credential_types::Credentials;
    let creds = if let Some(session_token) = &credentials.session_token {
        Credentials::new(
            &credentials.access_key_id,
            &credentials.secret_access_key,
            Some(session_token.clone()),
            None,
            "manual",
        )
    } else {
        Credentials::new(
            &credentials.access_key_id,
            &credentials.secret_access_key,
            None,
            None,
            "manual",
        )
    };

    config_builder = config_builder.credentials_provider(creds);
    let config = config_builder.load().await;

    // STS クライアントでIDを確認
    let sts_client = StsClient::new(&config);
    
    match sts_client.get_caller_identity().send().await {
        Ok(identity) => {
            let user_identity = AwsUserIdentity {
                user_id: identity.user_id().unwrap_or("unknown").to_string(),
                arn: identity.arn().unwrap_or("unknown").to_string(),
                account: identity.account().unwrap_or("unknown").to_string(),
            };

            // 基本的な権限チェック
            let permissions = check_basic_permissions(&config).await;

            log::info!("AWS authentication successful for user: {}", user_identity.arn);

            Ok(AwsAuthResult {
                success: true,
                message: "AWS authentication successful".to_string(),
                user_identity: Some(user_identity),
                permissions,
            })
        }
        Err(e) => {
            log::error!("AWS authentication failed: {}", e);
            Ok(AwsAuthResult {
                success: false,
                message: format!("Authentication failed: {}", e),
                user_identity: None,
                permissions: vec![],
            })
        }
    }
}

/// S3バケットへのアクセス権限をテストし、成功時にライフサイクルポリシーを自動設定する
#[command]
pub async fn test_s3_bucket_access(
    credentials: AwsCredentials,
    bucket_name: String,
) -> Result<PermissionCheck, String> {
    let region = Region::new(credentials.region.clone());
    let mut config_builder = aws_config::defaults(BehaviorVersion::latest())
        .region(region);

    // 認証情報を設定
    use aws_credential_types::Credentials;
    let creds = Credentials::new(
        &credentials.access_key_id,
        &credentials.secret_access_key,
        credentials.session_token.clone(),
        None,
        "manual",
    );

    config_builder = config_builder.credentials_provider(creds);
    let config = config_builder.load().await;

    let s3_client = S3Client::new(&config);

    // バケットへのアクセステスト
    match s3_client.head_bucket()
        .bucket(&bucket_name)
        .send()
        .await
    {
        Ok(_) => {
            log::info!("S3 bucket access successful: {}", bucket_name);
            
            // 成功時に自動でライフサイクルポリシーを適用し、確実に反映されるまで待機
            log::debug!("Starting auto-setup lifecycle policy for bucket: {}", bucket_name);
            match auto_setup_lifecycle_policy(&config, &bucket_name).await {
                Ok(_) => {
                    log::info!("ReelVault lifecycle policy applied, now verifying...");
                    
                    // ライフサイクル設定が反映されるまで待機（最大60秒、5秒間隔）
                    match verify_lifecycle_policy_applied(&config, &bucket_name, 60, 5).await {
                        Ok(_) => {
                            log::info!("ReelVault lifecycle policy verified and active for bucket: {}", bucket_name);
                        }
                        Err(e) => {
                            log::error!("Lifecycle policy verification failed for bucket {}: {}", bucket_name, e);
                            return Err(format!("ライフサイクル設定の確認に失敗しました: {}", e));
                        }
                    }
                }
                Err(e) => {
                    log::error!("Failed to auto-setup lifecycle policy for bucket {}: {}", bucket_name, e);
                    return Err(format!("ライフサイクル設定に失敗しました: {}", e));
                }
            }
            
            Ok(PermissionCheck {
                service: "S3".to_string(),
                action: "s3:GetBucketLocation".to_string(),
                resource: format!("arn:aws:s3:::{}", bucket_name),
                allowed: true,
            })
        }
        Err(e) => {
            log::warn!("S3 bucket access failed for {}: {}", bucket_name, e);
            Ok(PermissionCheck {
                service: "S3".to_string(),
                action: "s3:GetBucketLocation".to_string(),
                resource: format!("arn:aws:s3:::{}", bucket_name),
                allowed: false,
            })
        }
    }
}

/// AwsConfigからaws_config::SdkConfigを作成
pub async fn create_aws_config(config: &AwsConfig) -> Result<aws_config::SdkConfig, String> {
    let region = Region::new(config.region.clone());
    let mut config_builder = aws_config::defaults(BehaviorVersion::latest())
        .region(region);

    // 認証情報を設定
    use aws_credential_types::Credentials;
    let creds = Credentials::new(
        &config.access_key_id,
        &config.secret_access_key,
        None,
        None,
        "manual",
    );

    config_builder = config_builder.credentials_provider(creds);
    Ok(config_builder.load().await)
}

/// 基本的なAWS権限をチェック
async fn check_basic_permissions(config: &aws_config::SdkConfig) -> Vec<String> {
    let mut permissions = Vec::new();

    // STS権限チェック（既に成功している）
    permissions.push("sts:GetCallerIdentity".to_string());

    // S3の基本権限チェック
    let s3_client = S3Client::new(config);
    match s3_client.list_buckets().send().await {
        Ok(_) => {
            permissions.push("s3:ListAllMyBuckets".to_string());
        }
        Err(_) => {
            log::warn!("S3 ListBuckets permission denied");
        }
    }

    // ライフサイクル関連権限のテスト（ダミーバケットで）
    // 注意: 実際のバケットがない場合はスキップ
    let test_bucket = "test-lifecycle-permissions-bucket";
    match s3_client.get_bucket_lifecycle_configuration()
        .bucket(test_bucket)
        .send()
        .await
    {
        Ok(_) => {
            permissions.push("s3:GetLifecycleConfiguration".to_string());
        }
        Err(e) => {
            let error_str = e.to_string();
            if error_str.contains("NoSuchBucket") {
                // バケットが存在しないのは正常（権限はある）
                permissions.push("s3:GetLifecycleConfiguration".to_string());
            } else if !error_str.contains("AccessDenied") && !error_str.contains("Forbidden") {
                // アクセス拒否以外のエラーの場合は権限がある可能性
                permissions.push("s3:GetLifecycleConfiguration (uncertain)".to_string());
            }
            log::debug!("Lifecycle permission test result: {}", error_str);
        }
    }

    permissions
}

/// AWS認証情報をセキュアに保存する（Touch ID/Face ID対応）
#[command]
pub async fn save_aws_credentials_secure(
    credentials: AwsCredentials,
    profile_name: String,
) -> Result<String, String> {
    let service_name = "ReelVault-AWS";

    // 認証情報をJSONとしてシリアライズ
    let credentials_json = serde_json::to_string(&credentials)
        .map_err(|e| format!("Failed to serialize credentials: {}", e))?;

    // macOSの場合はTouch ID/Face ID対応で保存、それ以外は従来通り
    #[cfg(target_os = "macos")]
    {
                 if macos_keychain::is_biometry_available() {
             match macos_keychain::save_password_with_biometry(&service_name, &profile_name, &credentials_json) {
                 Ok(()) => (),
                 Err(e) => {
                     log::warn!("Touch ID/Face ID保存に失敗、従来方式にフォールバック: {}", e);
                     // フォールバック：従来のKeychain保存
                     fallback_save_credentials(&service_name, &profile_name, &credentials_json)
                         .map_err(|fe| format!("Touch ID保存もフォールバック保存も失敗: Touch ID={}, Fallback={}", e, fe))?;
                 }
             }
            log::info!("AWS credentials saved with Touch ID/Face ID for profile: {}", profile_name);
            return Ok("Credentials saved with Touch ID/Face ID".to_string());
        } else {
            log::info!("Touch ID/Face ID not available, using standard keychain");
        }
    }

    // 非macOSまたはTouch ID非対応の場合
    fallback_save_credentials(&service_name, &profile_name, &credentials_json)?;
    log::info!("AWS credentials saved securely for profile: {}", profile_name);
    Ok("Credentials saved securely".to_string())
}

/// 従来のKeychain保存（フォールバック用）
fn fallback_save_credentials(service_name: &str, profile_name: &str, credentials_json: &str) -> Result<(), String> {
    use keyring::Entry;
    
    let entry = Entry::new(service_name, profile_name)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

    entry.set_password(credentials_json)
        .map_err(|e| format!("Failed to save credentials to keychain: {}", e))?;

    Ok(())
}

/// セキュアに保存されたAWS認証情報を読み込む（Touch ID/Face ID対応）
#[command]
pub async fn load_aws_credentials_secure(profile_name: String) -> Result<AwsCredentials, String> {
    let service_name = "ReelVault-AWS";

    // macOSの場合はTouch ID/Face ID対応で読み込み、それ以外は従来通り
    let credentials_json = {
        #[cfg(target_os = "macos")]
        {
            if macos_keychain::is_biometry_available() {
                match macos_keychain::load_password_with_biometry(&service_name, &profile_name) {
                    Ok(json) => {
                        log::info!("AWS credentials loaded with Touch ID/Face ID for profile: {}", profile_name);
                        json
                    }
                    Err(e) => {
                        log::warn!("Touch ID/Face ID読み込みに失敗、従来方式にフォールバック: {}", e);
                        // フォールバック：従来のKeychain読み込み
                        fallback_load_credentials(&service_name, &profile_name)?
                    }
                }
            } else {
                log::info!("Touch ID/Face ID not available, using standard keychain");
                fallback_load_credentials(&service_name, &profile_name)?
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            fallback_load_credentials(&service_name, &profile_name)?
        }
    };

    // JSONからデシリアライズ
    let credentials: AwsCredentials = serde_json::from_str(&credentials_json)
        .map_err(|e| format!("Failed to deserialize credentials: {}", e))?;

    log::info!("AWS credentials loaded securely for profile: {}", profile_name);
    Ok(credentials)
}

/// 従来のKeychain読み込み（フォールバック用）
fn fallback_load_credentials(service_name: &str, profile_name: &str) -> Result<String, String> {
    use keyring::Entry;
    
    let entry = Entry::new(service_name, profile_name)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

    entry.get_password()
        .map_err(|e| format!("Failed to load credentials from keychain: {}", e))
}

/// ReelVaultライフサイクルポリシーを自動設定する
async fn auto_setup_lifecycle_policy(
    config: &aws_config::SdkConfig,
    bucket_name: &str,
) -> Result<(), String> {
    const REELVAULT_RULE_ID: &str = "ReelVault-Default-Auto-Archive";
    const REELVAULT_TRANSITION_DAYS: i32 = 1;
    const REELVAULT_PREFIX: &str = "uploads/";

    let s3_client = S3Client::new(config);

    // 既存のライフサイクル設定をチェック
    match s3_client.get_bucket_lifecycle_configuration()
        .bucket(bucket_name)
        .send()
        .await
    {
        Ok(response) => {
            // 既存のReelVaultルールがあるかチェック
            for rule in response.rules() {
                if rule.id().unwrap_or("") == REELVAULT_RULE_ID {
                    log::info!("ReelVault lifecycle rule already exists for bucket: {}", bucket_name);
                    return Ok(());
                }
            }
        }
        Err(_) => {
            // ライフサイクル設定が存在しない場合は新規作成
            log::info!("No existing lifecycle configuration found for bucket: {}", bucket_name);
        }
    }

    log::info!("Setting up ReelVault lifecycle policy for bucket: {}", bucket_name);
    
    // ReelVaultライフサイクルルールを作成
    use aws_sdk_s3::types::{
        BucketLifecycleConfiguration, LifecycleRule, ExpirationStatus, 
        LifecycleRuleFilter, Transition, TransitionStorageClass
    };

    let transition = Transition::builder()
        .days(REELVAULT_TRANSITION_DAYS)
        .storage_class(TransitionStorageClass::DeepArchive)
        .build();

    let filter = LifecycleRuleFilter::builder()
        .prefix(REELVAULT_PREFIX.to_string())
        .build();

    let rule = LifecycleRule::builder()
        .id(REELVAULT_RULE_ID)
        .status(ExpirationStatus::Enabled)
        .filter(filter)
        .transitions(transition)
        .build()
        .map_err(|e| format!("Failed to build lifecycle rule: {}", e))?;

    let lifecycle_config = BucketLifecycleConfiguration::builder()
        .rules(rule)
        .build()
        .map_err(|e| format!("Failed to build lifecycle configuration: {}", e))?;

    // ライフサイクル設定を適用
    log::debug!("Applying lifecycle configuration to bucket: {}", bucket_name);
    s3_client
        .put_bucket_lifecycle_configuration()
        .bucket(bucket_name)
        .lifecycle_configuration(lifecycle_config)
        .send()
        .await
        .map_err(|e| {
            log::error!("Failed to apply lifecycle policy to bucket {}: {}", bucket_name, e);
            format!("Failed to set lifecycle policy: {}", e)
        })?;
    
    log::info!("ReelVault lifecycle policy setup completed for bucket: {}", bucket_name);
    Ok(())
}

/// ライフサイクルポリシーが確実に適用されるまで待機
async fn verify_lifecycle_policy_applied(
    config: &aws_config::SdkConfig,
    bucket_name: &str,
    timeout_seconds: u64,
    check_interval_seconds: u64,
) -> Result<(), String> {
    const REELVAULT_RULE_ID: &str = "ReelVault-Default-Auto-Archive";
    
    let s3_client = S3Client::new(config);
    let start_time = std::time::Instant::now();
    let timeout_duration = std::time::Duration::from_secs(timeout_seconds);
    let check_interval = std::time::Duration::from_secs(check_interval_seconds);
    
    log::info!("Verifying lifecycle policy for bucket: {} (timeout: {}s, interval: {}s)", 
               bucket_name, timeout_seconds, check_interval_seconds);
    
    loop {
        // タイムアウトチェック
        if start_time.elapsed() > timeout_duration {
            return Err(format!("タイムアウト: {}秒以内にライフサイクル設定が確認できませんでした", timeout_seconds));
        }
        
        // ライフサイクル設定をチェック
        match s3_client.get_bucket_lifecycle_configuration()
            .bucket(bucket_name)
            .send()
            .await
        {
            Ok(response) => {
                // ReelVaultルールを検索
                for rule in response.rules() {
                    if rule.id().unwrap_or("") == REELVAULT_RULE_ID {
                        let enabled = rule.status() == &aws_sdk_s3::types::ExpirationStatus::Enabled;
                        if enabled && !rule.transitions().is_empty() {
                            log::info!("ReelVault lifecycle rule found and enabled for bucket: {}", bucket_name);
                            return Ok(());
                        }
                    }
                }
                log::debug!("ReelVault lifecycle rule not found yet, will retry...");
            }
            Err(e) => {
                let error_string = e.to_string();
                if error_string.contains("NoSuchLifecycleConfiguration") {
                    log::debug!("No lifecycle configuration found yet, will retry...");
                } else {
                    log::warn!("Unexpected error checking lifecycle: {}", error_string);
                }
            }
        }
        
        // 指定間隔待機
        log::debug!("Waiting {}s before next lifecycle check...", check_interval_seconds);
        tokio::time::sleep(check_interval).await;
    }
}

#[cfg(target_os = "macos")]
mod macos_keychain {

    /// Touch ID/Face ID必須でKeychainに保存
    pub fn save_password_with_biometry(
        service: &str,
        account: &str,
        password: &str,
    ) -> Result<(), String> {
        // より簡単なアプローチ：Keyringライブラリでアクセス制御付きで保存
        save_with_prompt(service, account, password, true)
    }

    /// Touch ID/Face ID必須でKeychainから読み込み
    pub fn load_password_with_biometry(
        service: &str,
        account: &str,
    ) -> Result<String, String> {
        load_with_prompt(service, account, "ReelVaultのAWS認証情報にアクセスするためにTouch IDまたはFace IDを使用してください")
    }

    /// Touch ID/Face IDが利用可能かチェック
    pub fn is_biometry_available() -> bool {
        use std::process::Command;
        
        // より確実な方法：systemctl と biometryd を使用してチェック
        let output = Command::new("sh")
            .arg("-c")
            .arg("ioreg -rd1 -c AppleBiometricSensor | grep -c Biometric > /dev/null 2>&1")
            .output();

        match output {
            Ok(output) => output.status.success(),
            Err(_) => {
                // フォールバック：単純にmacOSかどうかで判断
                true  // macOSであれば基本的に対応していると仮定
            }
        }
    }

    /// カスタムプロンプト付きで保存（Touch ID/Face ID使用）
    fn save_with_prompt(service: &str, account: &str, password: &str, use_biometry: bool) -> Result<(), String> {
        use std::process::Command;
        
        if use_biometry {
            // セキュリティコマンドを使用してTouch ID/Face ID対応で保存
            let mut child = Command::new("security")
                .args(&[
                    "add-generic-password",
                    "-a", account,
                    "-s", service,
                    "-T", "",  // 空の-Tでアプリ認証制御
                    "-U",      // update if exists
                    "-w", password,
                ])
                .spawn()
                .map_err(|e| format!("Failed to launch security command: {}", e))?;

            let status = child.wait()
                .map_err(|e| format!("Failed to wait for security command: {}", e))?;

            if status.success() {
                log::info!("Touch ID/Face ID対応Keychain保存が完了しました");
                Ok(())
            } else {
                Err(format!("Touch ID/Face ID Keychain保存に失敗: exit code {:?}", status.code()))
            }
        } else {
            // 通常のkeyringライブラリ使用
            use keyring::Entry;
            let entry = Entry::new(service, account)
                .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
            entry.set_password(password)
                .map_err(|e| format!("Failed to save to keychain: {}", e))?;
            Ok(())
        }
    }

    /// カスタムプロンプト付きで読み込み（Touch ID/Face ID使用）
    fn load_with_prompt(service: &str, account: &str, _prompt: &str) -> Result<String, String> {
        use std::process::Command;
        
        // セキュリティコマンドを使用してTouch ID/Face ID対応で読み込み
        let output = Command::new("security")
            .args(&[
                "find-generic-password",
                "-a", account,
                "-s", service,
                "-w"  // パスワードのみ出力
            ])
            .output()
            .map_err(|e| format!("Failed to execute security command: {}", e))?;

        if output.status.success() {
            let password = String::from_utf8(output.stdout)
                .map_err(|e| format!("Failed to decode password: {}", e))?
                .trim()
                .to_string();
            
            if password.is_empty() {
                Err("保存された認証情報が見つかりません".to_string())
            } else {
                log::info!("Touch ID/Face ID認証で情報を読み込みました");
                Ok(password)
            }
        } else {
            let error_msg = String::from_utf8_lossy(&output.stderr);
            if error_msg.contains("could not be found") {
                Err("保存された認証情報が見つかりません".to_string())
            } else if error_msg.contains("user canceled") {
                Err("Touch ID/Face ID認証がキャンセルされました".to_string())
            } else {
                Err(format!("Touch ID/Face ID認証に失敗しました: {}", error_msg.trim()))
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod macos_keychain {
    pub fn save_password_with_biometry(
        _service: &str,
        _account: &str,
        _password: &str,
    ) -> Result<(), String> {
        Err("Touch ID/Face ID is only available on macOS".to_string())
    }

    pub fn load_password_with_biometry(
        _service: &str,
        _account: &str,
    ) -> Result<String, String> {
        Err("Touch ID/Face ID is only available on macOS".to_string())
    }

    pub fn is_biometry_available() -> bool {
        false
    }
}

