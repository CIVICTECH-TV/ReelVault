use serde::{Deserialize, Serialize};
use tauri::command;
use aws_config::{BehaviorVersion, Region};
use aws_sdk_s3::Client as S3Client;
use aws_sdk_sts::Client as StsClient;

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

/// S3バケットへのアクセス権限をテストする
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

    permissions
}

/// AWS認証情報をセキュアに保存する
#[command]
pub async fn save_aws_credentials_secure(
    credentials: AwsCredentials,
    profile_name: String,
) -> Result<String, String> {
    use keyring::Entry;

    // macOS Keychainに保存
    let service_name = "ReelVault-AWS";
    let entry = Entry::new(&service_name, &profile_name)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

    // 認証情報をJSONとしてシリアライズ
    let credentials_json = serde_json::to_string(&credentials)
        .map_err(|e| format!("Failed to serialize credentials: {}", e))?;

    // Keychainに保存
    entry.set_password(&credentials_json)
        .map_err(|e| format!("Failed to save credentials to keychain: {}", e))?;

    log::info!("AWS credentials saved securely for profile: {}", profile_name);
    Ok("Credentials saved securely".to_string())
}

/// セキュアに保存されたAWS認証情報を読み込む
#[command]
pub async fn load_aws_credentials_secure(profile_name: String) -> Result<AwsCredentials, String> {
    use keyring::Entry;

    let service_name = "ReelVault-AWS";
    let entry = Entry::new(&service_name, &profile_name)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

    // Keychainから読み込み
    let credentials_json = entry.get_password()
        .map_err(|e| format!("Failed to load credentials from keychain: {}", e))?;

    // JSONからデシリアライズ
    let credentials: AwsCredentials = serde_json::from_str(&credentials_json)
        .map_err(|e| format!("Failed to deserialize credentials: {}", e))?;

    log::info!("AWS credentials loaded securely for profile: {}", profile_name);
    Ok(credentials)
}

/// 保存されたAWS認証情報を削除する
#[command]
pub async fn delete_aws_credentials_secure(profile_name: String) -> Result<String, String> {
    use keyring::Entry;

    let service_name = "ReelVault-AWS";
    let entry = Entry::new(&service_name, &profile_name)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

    // Keychainから削除
    entry.delete_password()
        .map_err(|e| format!("Failed to delete credentials from keychain: {}", e))?;

    log::info!("AWS credentials deleted securely for profile: {}", profile_name);
    Ok("Credentials deleted successfully".to_string())
} 