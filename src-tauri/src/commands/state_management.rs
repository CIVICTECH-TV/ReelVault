use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{command, State};

/// アプリケーションのグローバル状態
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppState {
    pub is_watching: bool,
    pub upload_queue: Vec<UploadItem>,
    pub current_uploads: Vec<UploadProgress>,
    pub statistics: AppStatistics,
    pub last_error: Option<String>,
    pub system_status: SystemStatus,
}

/// アップロードキューのアイテム
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UploadItem {
    pub id: String,
    pub file_path: String,
    pub file_name: String,
    pub file_size: u64,
    pub status: UploadStatus,
    pub created_at: String,
    pub progress: f64,
}

/// アップロード状況
#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum UploadStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
    Paused,
}

/// アップロード進捗
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UploadProgress {
    pub item_id: String,
    pub uploaded_bytes: u64,
    pub total_bytes: u64,
    pub percentage: f64,
    pub speed_mbps: f64,
    pub eta_seconds: Option<u64>,
}

/// アプリケーション統計
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppStatistics {
    pub total_files_uploaded: u64,
    pub total_bytes_uploaded: u64,
    pub files_in_queue: u64,
    pub successful_uploads: u64,
    pub failed_uploads: u64,
    pub average_upload_speed_mbps: f64,
}

/// システム状態
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemStatus {
    pub aws_connected: bool,
    pub disk_space_gb: f64,
    pub memory_usage_mb: f64,
    pub cpu_usage_percent: f64,
    pub network_available: bool,
    pub last_heartbeat: String,
}

/// 状態更新リクエスト
#[derive(Debug, Deserialize)]
pub struct StateUpdate {
    pub field: String,
    pub value: serde_json::Value,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            is_watching: false,
            upload_queue: Vec::new(),
            current_uploads: Vec::new(),
            statistics: AppStatistics {
                total_files_uploaded: 0,
                total_bytes_uploaded: 0,
                files_in_queue: 0,
                successful_uploads: 0,
                failed_uploads: 0,
                average_upload_speed_mbps: 0.0,
            },
            last_error: None,
            system_status: SystemStatus {
                aws_connected: false,
                disk_space_gb: 0.0,
                memory_usage_mb: 0.0,
                cpu_usage_percent: 0.0,
                network_available: false,
                last_heartbeat: chrono::Utc::now().to_rfc3339(),
            },
        }
    }
}

/// グローバル状態管理用の型エイリアス
pub type AppStateManager = Arc<Mutex<AppState>>;

/// 現在のアプリケーション状態を取得
#[command]
pub async fn get_app_state(state: State<'_, AppStateManager>) -> Result<AppState, String> {
    let app_state = state.lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;
    
    log::debug!("App state requested");
    Ok(app_state.clone())
}

/// アプリケーション状態を更新
#[command]
pub async fn set_app_state(
    new_state: AppState,
    state: State<'_, AppStateManager>
) -> Result<String, String> {
    let mut app_state = state.lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;
    
    *app_state = new_state;
    
    log::info!("App state updated");
    Ok("Application state updated successfully".to_string())
}

/// 状態の部分更新
#[command]
pub async fn update_app_state(
    update: StateUpdate,
    state: State<'_, AppStateManager>
) -> Result<String, String> {
    let mut app_state = state.lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;
    
    match update.field.as_str() {
        "is_watching" => {
            if let Some(value) = update.value.as_bool() {
                app_state.is_watching = value;
                log::info!("Watching status updated: {}", value);
            } else {
                return Err("Invalid value for is_watching field".to_string());
            }
        }
        "last_error" => {
            if update.value.is_null() {
                app_state.last_error = None;
            } else if let Some(error) = update.value.as_str() {
                app_state.last_error = Some(error.to_string());
                log::warn!("Error recorded: {}", error);
            } else {
                return Err("Invalid value for last_error field".to_string());
            }
        }
        "aws_connected" => {
            if let Some(value) = update.value.as_bool() {
                app_state.system_status.aws_connected = value;
                log::info!("AWS connection status updated: {}", value);
            } else {
                return Err("Invalid value for aws_connected field".to_string());
            }
        }
        _ => {
            return Err(format!("Unknown state field: {}", update.field));
        }
    }
    
    // ハートビートを更新
    app_state.system_status.last_heartbeat = chrono::Utc::now().to_rfc3339();
    
    Ok(format!("State field '{}' updated successfully", update.field))
}

/// アップロードキューにアイテムを追加
#[command]
pub async fn add_to_upload_queue(
    file_path: String,
    state: State<'_, AppStateManager>
) -> Result<String, String> {
    use std::path::Path;
    
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }
    
    let metadata = std::fs::metadata(&path)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;
    
    let file_name = path.file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();
    
    let item = UploadItem {
        id: uuid::Uuid::new_v4().to_string(),
        file_path: file_path.clone(),
        file_name,
        file_size: metadata.len(),
        status: UploadStatus::Pending,
        created_at: chrono::Utc::now().to_rfc3339(),
        progress: 0.0,
    };
    
    let mut app_state = state.lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;
    
    app_state.upload_queue.push(item.clone());
    app_state.statistics.files_in_queue = app_state.upload_queue.len() as u64;
    
    log::info!("File added to upload queue: {}", file_path);
    
    Ok(format!("File added to upload queue with ID: {}", item.id))
}

/// アップロードキューからアイテムを削除
#[command]
#[allow(dead_code)]
pub async fn remove_from_upload_queue(
    item_id: String,
    state: State<'_, AppStateManager>
) -> Result<String, String> {
    let mut app_state = state.lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;
    
    let initial_len = app_state.upload_queue.len();
    app_state.upload_queue.retain(|item| item.id != item_id);
    
    if app_state.upload_queue.len() == initial_len {
        return Err(format!("Upload item not found: {}", item_id));
    }
    
    app_state.statistics.files_in_queue = app_state.upload_queue.len() as u64;
    
    log::info!("Upload item removed from queue: {}", item_id);
    
    Ok(format!("Upload item removed: {}", item_id))
}

/// システム統計を更新
#[command]
pub async fn update_system_stats(
    state: State<'_, AppStateManager>
) -> Result<SystemStatus, String> {
    let mut app_state = state.lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;
    
    // TODO: 実際のシステム情報を取得する実装
    // 現在はモックデータを使用
    app_state.system_status.disk_space_gb = 256.5; // GB
    app_state.system_status.memory_usage_mb = 512.3; // MB  
    app_state.system_status.cpu_usage_percent = 15.7; // %
    app_state.system_status.network_available = true;
    app_state.system_status.last_heartbeat = chrono::Utc::now().to_rfc3339();
    
    log::debug!("System statistics updated");
    
    Ok(app_state.system_status.clone())
}

/// 状態をリセット
#[command]
pub async fn reset_app_state(
    state: State<'_, AppStateManager>
) -> Result<String, String> {
    let mut app_state = state.lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;
    
    *app_state = AppState::default();
    
    log::info!("Application state reset to defaults");
    
    Ok("Application state reset successfully".to_string())
} 