use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::command;

/// アプリケーション設定構造体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub aws: AwsSettings,
    pub app: AppSettings,
    pub watch: WatchSettings,
}

/// AWS関連設定
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AwsSettings {
    pub region: String,
    pub bucket_name: String,
    pub access_key_id: String, // 注意: 実際は暗号化して保存
    pub secret_access_key: String, // 注意: 実際は暗号化して保存
}

/// アプリケーション設定
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub auto_start: bool,
    pub notification_enabled: bool,
    pub log_level: String,
    pub theme: String,
    pub language: String,
}

/// ファイル監視設定
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WatchSettings {
    pub directories: Vec<String>,
    pub file_patterns: Vec<String>,
    pub recursive: bool,
    pub auto_upload: bool,
    pub exclude_patterns: Vec<String>,
}

/// 設定の部分更新用
#[derive(Debug, Deserialize)]
pub struct ConfigUpdate {
    pub section: String, // "aws", "app", "watch"
    pub values: HashMap<String, serde_json::Value>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            aws: AwsSettings {
                region: "ap-northeast-1".to_string(),
                bucket_name: "".to_string(),
                access_key_id: "".to_string(),
                secret_access_key: "".to_string(),
            },
            app: AppSettings {
                auto_start: false,
                notification_enabled: true,
                log_level: "Info".to_string(),
                theme: "system".to_string(),
                language: "ja".to_string(),
            },
            watch: WatchSettings {
                directories: vec![],
                file_patterns: vec![
                    "*.mp4".to_string(),
                    "*.mov".to_string(),
                    "*.avi".to_string(),
                    "*.mkv".to_string(),
                    "*.prproj".to_string(), // Premiere Pro
                    "*.drp".to_string(),    // DaVinci Resolve
                ],
                recursive: true,
                auto_upload: false,
                exclude_patterns: vec![
                    "*.tmp".to_string(),
                    "*.cache".to_string(),
                    ".DS_Store".to_string(),
                ],
            },
        }
    }
}

/// 設定ファイルのパスを取得
fn get_config_path() -> Result<PathBuf, String> {
    let config_dir = dirs::config_dir()
        .ok_or("Could not find config directory")?
        .join("ReelVault");
    
    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;
    
    Ok(config_dir.join("config.json"))
}

/// 設定を読み込む
fn load_config_from_file() -> Result<AppConfig, String> {
    let config_path = get_config_path()?;
    
    if !config_path.exists() {
        // 設定ファイルが存在しない場合はデフォルト設定を返す
        return Ok(AppConfig::default());
    }
    
    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config file: {}", e))?;
    
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config file: {}", e))
}

/// 設定をファイルに保存
fn save_config_to_file(config: &AppConfig) -> Result<(), String> {
    let config_path = get_config_path()?;
    
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    std::fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write config file: {}", e))?;
    
    log::info!("Configuration saved to: {:?}", config_path);
    Ok(())
}

/// アプリケーション設定を取得
#[command]
pub async fn get_config() -> Result<AppConfig, String> {
    match load_config_from_file() {
        Ok(config) => {
            log::info!("Configuration loaded successfully");
            Ok(config)
        }
        Err(e) => {
            log::warn!("Failed to load config, using defaults: {}", e);
            Ok(AppConfig::default())
        }
    }
}

/// アプリケーション設定を保存
#[command]
pub async fn set_config(config: AppConfig) -> Result<String, String> {
    // 設定の基本検証
    if config.aws.region.is_empty() {
        return Err("AWS region cannot be empty".to_string());
    }
    
    if config.app.log_level.is_empty() {
        return Err("Log level cannot be empty".to_string());
    }
    
    match config.app.log_level.as_str() {
        "Error" | "Warn" | "Info" | "Debug" | "Trace" => {},
        _ => return Err("Invalid log level".to_string()),
    }
    
    if config.watch.file_patterns.is_empty() {
        return Err("At least one file pattern must be specified".to_string());
    }
    
    // TODO: 実際の実装では、AWS認証情報は暗号化して保存する
    // let encrypted_config = encrypt_sensitive_data(config)?;
    
    save_config_to_file(&config)?;
    
    Ok("Configuration saved successfully".to_string())
}

/// 設定の部分更新
#[command]
pub async fn update_config(update: ConfigUpdate) -> Result<String, String> {
    let mut config = load_config_from_file()?;
    
    match update.section.as_str() {
        "aws" => {
            for (key, value) in update.values {
                match key.as_str() {
                    "region" => {
                        if let Some(v) = value.as_str() {
                            config.aws.region = v.to_string();
                        }
                    }
                    "bucket_name" => {
                        if let Some(v) = value.as_str() {
                            config.aws.bucket_name = v.to_string();
                        }
                    }
                    "access_key_id" => {
                        if let Some(v) = value.as_str() {
                            config.aws.access_key_id = v.to_string();
                        }
                    }
                    "secret_access_key" => {
                        if let Some(v) = value.as_str() {
                            config.aws.secret_access_key = v.to_string();
                        }
                    }
                    _ => return Err(format!("Unknown AWS setting: {}", key)),
                }
            }
        }
        "app" => {
            for (key, value) in update.values {
                match key.as_str() {
                    "auto_start" => {
                        if let Some(v) = value.as_bool() {
                            config.app.auto_start = v;
                        }
                    }
                    "notification_enabled" => {
                        if let Some(v) = value.as_bool() {
                            config.app.notification_enabled = v;
                        }
                    }
                    "log_level" => {
                        if let Some(v) = value.as_str() {
                            config.app.log_level = v.to_string();
                        }
                    }
                    "theme" => {
                        if let Some(v) = value.as_str() {
                            config.app.theme = v.to_string();
                        }
                    }
                    "language" => {
                        if let Some(v) = value.as_str() {
                            config.app.language = v.to_string();
                        }
                    }
                    _ => return Err(format!("Unknown app setting: {}", key)),
                }
            }
        }
        "watch" => {
            for (key, value) in update.values {
                match key.as_str() {
                    "recursive" => {
                        if let Some(v) = value.as_bool() {
                            config.watch.recursive = v;
                        }
                    }
                    "auto_upload" => {
                        if let Some(v) = value.as_bool() {
                            config.watch.auto_upload = v;
                        }
                    }
                    _ => return Err(format!("Unknown watch setting: {}", key)),
                }
            }
        }
        _ => return Err(format!("Unknown config section: {}", update.section)),
    }
    
    save_config_to_file(&config)?;
    
    Ok(format!("Configuration section '{}' updated successfully", update.section))
}

/// 設定をデフォルトにリセット
#[command]
pub async fn reset_config() -> Result<String, String> {
    let default_config = AppConfig::default();
    save_config_to_file(&default_config)?;
    
    log::info!("Configuration reset to defaults");
    
    Ok("Configuration reset to defaults successfully".to_string())
} 