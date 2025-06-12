use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

// 設定データ構造
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub version: String,
    pub app_settings: AppSettings,
    pub user_preferences: UserPreferences,
    pub aws_settings: AwsSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub log_level: String,
    pub theme: String,
    pub language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPreferences {
    pub default_bucket_name: Option<String>,
    pub default_storage_class: String,
    pub compression_enabled: bool,
    pub notification_enabled: bool,
    pub recent_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AwsSettings {
    pub default_region: String,
    pub timeout_seconds: u64,
    pub max_retries: u32,
    pub profile_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConfigValidationResult {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

// デフォルト設定実装
impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            version: "1.0.0".to_string(),
            app_settings: AppSettings::default(),
            user_preferences: UserPreferences::default(),
            aws_settings: AwsSettings::default(),
        }
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            log_level: "info".to_string(),
            theme: "dark".to_string(),
            language: "ja".to_string(),
        }
    }
}

impl Default for UserPreferences {
    fn default() -> Self {
        UserPreferences {
            default_bucket_name: None,
            default_storage_class: "DEEP_ARCHIVE".to_string(),
            compression_enabled: true,
            notification_enabled: true,
            recent_files: Vec::new(),
        }
    }
}

impl Default for AwsSettings {
    fn default() -> Self {
        AwsSettings {
            default_region: "ap-northeast-1".to_string(), // Default to Tokyo region
            timeout_seconds: 300,
            max_retries: 3,
            profile_name: None,
        }
    }
}

// 設定ファイルパス取得
fn get_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    // ディレクトリが存在しない場合は作成
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }
    
    Ok(app_data_dir.join("config.json"))
}

// バックアップファイルパス取得
fn get_backup_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    Ok(app_data_dir.join("config.backup.json"))
}

// 設定検証
fn validate_config(config: &AppConfig) -> ConfigValidationResult {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    // バージョン検証
    if config.version.is_empty() {
        errors.push("Config version cannot be empty".to_string());
    }

    // ログレベル検証
    let valid_log_levels = ["error", "warn", "info", "debug", "trace"];
    if !valid_log_levels.contains(&config.app_settings.log_level.as_str()) {
        errors.push(format!("Invalid log level: {}", config.app_settings.log_level));
    }

    // テーマ検証
    let valid_themes = ["light", "dark", "auto"];
    if !valid_themes.contains(&config.app_settings.theme.as_str()) {
        warnings.push(format!("Unknown theme: {}", config.app_settings.theme));
    }

    // AWS設定検証
    if config.aws_settings.timeout_seconds == 0 {
        errors.push("AWS timeout cannot be zero".to_string());
    }

    if config.aws_settings.timeout_seconds > 3600 {
        warnings.push("AWS timeout is very long (>1 hour)".to_string());
    }

    // ストレージクラス検証
    let valid_storage_classes = ["STANDARD", "STANDARD_IA", "ONEZONE_IA", "REDUCED_REDUNDANCY", "GLACIER", "DEEP_ARCHIVE"];
    if !valid_storage_classes.contains(&config.user_preferences.default_storage_class.as_str()) {
        errors.push(format!("Invalid storage class: {}", config.user_preferences.default_storage_class));
    }

    ConfigValidationResult {
        valid: errors.is_empty(),
        errors,
        warnings,
    }
}

// Tauri Commands

#[tauri::command]
pub async fn get_config(app: AppHandle) -> Result<AppConfig, String> {
    let config_path = get_config_path(&app)?;
    
    if !config_path.exists() {
        // 設定ファイルが存在しない場合はデフォルト設定を返す
        let default_config = AppConfig::default();
        return Ok(default_config);
    }

    let config_content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config file: {}", e))?;

    let config: AppConfig = serde_json::from_str(&config_content)
        .map_err(|e| format!("Failed to parse config file: {}", e))?;

    Ok(config)
}

#[tauri::command]
pub async fn set_config(app: AppHandle, config: AppConfig) -> Result<bool, String> {
    // 設定検証
    let validation = validate_config(&config);
    if !validation.valid {
        return Err(format!("Config validation failed: {}", validation.errors.join(", ")));
    }

    let config_path = get_config_path(&app)?;
    
    // 既存の設定をバックアップ
    if config_path.exists() {
        let backup_path = get_backup_path(&app)?;
        fs::copy(&config_path, &backup_path)
            .map_err(|e| format!("Failed to create backup: {}", e))?;
    }

    // 新しい設定を保存
    let config_json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, config_json)
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    Ok(true)
}

#[tauri::command]
pub async fn update_config(app: AppHandle, updates: HashMap<String, serde_json::Value>) -> Result<AppConfig, String> {
    // 現在の設定を取得
    let mut config = get_config(app.clone()).await?;

    // 更新を適用
    for (key, value) in updates {
        match key.as_str() {

            "app_settings.log_level" => {
                if let Some(v) = value.as_str() {
                    config.app_settings.log_level = v.to_string();
                }
            }
            "app_settings.theme" => {
                if let Some(v) = value.as_str() {
                    config.app_settings.theme = v.to_string();
                }
            }
            "app_settings.language" => {
                if let Some(v) = value.as_str() {
                    config.app_settings.language = v.to_string();
                }
            }
            "user_preferences.default_bucket_name" => {
                config.user_preferences.default_bucket_name = value.as_str().map(String::from);
            }
            "user_preferences.default_storage_class" => {
                if let Some(v) = value.as_str() {
                    config.user_preferences.default_storage_class = v.to_string();
                }
            }
            "user_preferences.compression_enabled" => {
                if let Some(v) = value.as_bool() {
                    config.user_preferences.compression_enabled = v;
                }
            }
            "user_preferences.notification_enabled" => {
                if let Some(v) = value.as_bool() {
                    config.user_preferences.notification_enabled = v;
                }
            }
            "aws_settings.default_region" => {
                if let Some(v) = value.as_str() {
                    config.aws_settings.default_region = v.to_string();
                }
            }
            "aws_settings.timeout_seconds" => {
                if let Some(v) = value.as_u64() {
                    config.aws_settings.timeout_seconds = v;
                }
            }
            "aws_settings.max_retries" => {
                if let Some(v) = value.as_u64() {
                    config.aws_settings.max_retries = v as u32;
                }
            }
            "aws_settings.profile_name" => {
                config.aws_settings.profile_name = value.as_str().map(String::from);
            }
            _ => {
                return Err(format!("Unknown config key: {}", key));
            }
        }
    }

    // 更新された設定を保存
    set_config(app, config.clone()).await?;
    
    Ok(config)
}

#[tauri::command]
pub async fn reset_config(app: AppHandle) -> Result<AppConfig, String> {
    let default_config = AppConfig::default();
    set_config(app, default_config.clone()).await?;
    Ok(default_config)
}

#[tauri::command]
pub async fn validate_config_file(app: AppHandle) -> Result<ConfigValidationResult, String> {
    let config = get_config(app).await?;
    Ok(validate_config(&config))
}

#[tauri::command]
pub async fn validate_config_data(config: AppConfig) -> Result<ConfigValidationResult, String> {
    // 渡された設定を直接検証（保存せずに）
    Ok(validate_config(&config))
}

#[tauri::command]
pub async fn backup_config(app: AppHandle) -> Result<String, String> {
    let config_path = get_config_path(&app)?;
    
    if !config_path.exists() {
        return Err("No config file to backup".to_string());
    }

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    let backup_path = app_data_dir.join(format!("config_backup_{}.json", timestamp));
    
    fs::copy(&config_path, &backup_path)
        .map_err(|e| format!("Failed to create backup: {}", e))?;

    Ok(backup_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn export_config(app: AppHandle, export_path: Option<String>) -> Result<String, String> {
    let config_path = get_config_path(&app)?;
    
    if !config_path.exists() {
        return Err("設定ファイルが存在しません".to_string());
    }

    let destination_path = if let Some(path) = export_path {
        PathBuf::from(path)
    } else {
        // デフォルトのエクスポートパス（デスクトップにタイムスタンプ付きで）
        let home_dir = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map_err(|_| "ホームディレクトリが取得できません".to_string())?;
        
        let desktop_path = PathBuf::from(home_dir).join("Desktop");
        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        desktop_path.join(format!("ReelVault_Config_{}.json", timestamp))
    };

    fs::copy(&config_path, &destination_path)
        .map_err(|e| format!("設定のエクスポートに失敗しました: {}", e))?;

    Ok(destination_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn import_config(app: AppHandle, import_path: String) -> Result<AppConfig, String> {
    let import_file = PathBuf::from(import_path);
    
    if !import_file.exists() {
        return Err("インポートファイルが存在しません".to_string());
    }

    if !import_file.is_file() {
        return Err("指定されたパスはファイルではありません".to_string());
    }

    // インポートファイルの読み込み
    let import_content = fs::read_to_string(&import_file)
        .map_err(|e| format!("インポートファイルの読み込みに失敗しました: {}", e))?;

    // JSONとして解析
    let imported_config: AppConfig = serde_json::from_str(&import_content)
        .map_err(|e| format!("設定ファイルの形式が正しくありません: {}", e))?;

    // インポートされた設定を検証
    let validation = validate_config(&imported_config);
    if !validation.valid {
        return Err(format!("インポートされた設定に問題があります: {}", validation.errors.join(", ")));
    }

    // 現在の設定をバックアップしてから新しい設定を適用
    let config_path = get_config_path(&app)?;
    if config_path.exists() {
        let backup_path = get_backup_path(&app)?;
        fs::copy(&config_path, &backup_path)
            .map_err(|e| format!("既存設定のバックアップに失敗しました: {}", e))?;
    }

    // 新しい設定を保存
    let config_json = serde_json::to_string_pretty(&imported_config)
        .map_err(|e| format!("設定の保存に失敗しました: {}", e))?;

    fs::write(&config_path, config_json)
        .map_err(|e| format!("設定ファイルの書き込みに失敗しました: {}", e))?;

    Ok(imported_config)
}

#[tauri::command]
pub async fn restore_config(app: AppHandle, backup_path: String) -> Result<AppConfig, String> {
    let backup_file = PathBuf::from(backup_path);
    
    if !backup_file.exists() {
        return Err("Backup file does not exist".to_string());
    }

    let backup_content = fs::read_to_string(&backup_file)
        .map_err(|e| format!("Failed to read backup file: {}", e))?;

    let config: AppConfig = serde_json::from_str(&backup_content)
        .map_err(|e| format!("Failed to parse backup file: {}", e))?;

    // 設定検証
    let validation = validate_config(&config);
    if !validation.valid {
        return Err(format!("Backup config validation failed: {}", validation.errors.join(", ")));
    }

    // 復元実行
    set_config(app, config.clone()).await?;
    
    Ok(config)
}

#[tauri::command]
pub async fn add_recent_file(app: AppHandle, file_path: String) -> Result<AppConfig, String> {
    let mut config = get_config(app.clone()).await?;
    
    // 既に存在する場合は削除
    config.user_preferences.recent_files.retain(|f| f != &file_path);
    
    // 先頭に追加
    config.user_preferences.recent_files.insert(0, file_path);
    
    // 最大10件まで
    if config.user_preferences.recent_files.len() > 10 {
        config.user_preferences.recent_files.truncate(10);
    }
    
    set_config(app, config.clone()).await?;
    Ok(config)
}

#[tauri::command]
pub async fn clear_recent_files(app: AppHandle) -> Result<AppConfig, String> {
    let mut config = get_config(app.clone()).await?;
    config.user_preferences.recent_files.clear();
    set_config(app, config.clone()).await?;
    Ok(config)
} 