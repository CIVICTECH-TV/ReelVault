use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{command, State};
use crate::internal::{InternalError, standardize_error};

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
        .map_err(|e| standardize_error(InternalError::Other(format!("Failed to lock state: {}", e))))?;
    
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
        .map_err(|e| standardize_error(InternalError::Other(format!("Failed to lock state: {}", e))))?;
    
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
        .map_err(|e| standardize_error(InternalError::Other(format!("Failed to lock state: {}", e))))?;
    
    match update.field.as_str() {
        "is_watching" => {
            if let Some(value) = update.value.as_bool() {
                app_state.is_watching = value;
                log::info!("Watching status updated: {}", value);
            } else {
                return Err(standardize_error(InternalError::Config("Invalid value for is_watching field".to_string())));
            }
        }
        "last_error" => {
            if update.value.is_null() {
                app_state.last_error = None;
            } else if let Some(error) = update.value.as_str() {
                app_state.last_error = Some(error.to_string());
                log::warn!("Error recorded: {}", error);
            } else {
                return Err(standardize_error(InternalError::Config("Invalid value for last_error field".to_string())));
            }
        }
        "aws_connected" => {
            if let Some(value) = update.value.as_bool() {
                app_state.system_status.aws_connected = value;
                log::info!("AWS connection status updated: {}", value);
            } else {
                return Err(standardize_error(InternalError::Config("Invalid value for aws_connected field".to_string())));
            }
        }
        _ => {
            return Err(standardize_error(InternalError::Config(format!("Unknown state field: {}", update.field))));
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
        return Err(standardize_error(InternalError::File(format!("File does not exist: {}", file_path))));
    }
    
    let metadata = std::fs::metadata(&path)
        .map_err(|e| standardize_error(InternalError::File(format!("Failed to get file metadata: {}", e))))?;
    
    let file_name = path.file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();
    
    let upload_item = UploadItem {
        id: uuid::Uuid::new_v4().to_string(),
        file_path: file_path.clone(),
        file_name,
        file_size: metadata.len(),
        status: UploadStatus::Pending,
        created_at: chrono::Utc::now().to_rfc3339(),
        progress: 0.0,
    };
    
    let mut app_state = state.lock()
        .map_err(|e| standardize_error(InternalError::Other(format!("Failed to lock state: {}", e))))?;
    
    app_state.upload_queue.push(upload_item);
    app_state.statistics.files_in_queue = app_state.upload_queue.len() as u64;
    
    log::info!("Added file to upload queue: {}", file_path);
    Ok(format!("Added file to upload queue: {}", file_path))
}

/// システム統計を更新
#[command]
pub async fn update_system_stats(
    state: State<'_, AppStateManager>
) -> Result<SystemStatus, String> {
    let mut app_state = state.lock()
        .map_err(|e| standardize_error(InternalError::Other(format!("Failed to lock state: {}", e))))?;
    
    // システム情報を取得（簡易実装）
    let disk_space = sysinfo::System::new_all().total_memory() as f64 / 1024.0 / 1024.0 / 1024.0;
    let memory_usage = sysinfo::System::new_all().used_memory() as f64 / 1024.0 / 1024.0;
    
    app_state.system_status.disk_space_gb = disk_space;
    app_state.system_status.memory_usage_mb = memory_usage;
    app_state.system_status.last_heartbeat = chrono::Utc::now().to_rfc3339();
    
    log::debug!("System stats updated");
    Ok(app_state.system_status.clone())
}

/// アプリケーション状態をリセット
#[command]
pub async fn reset_app_state(
    state: State<'_, AppStateManager>
) -> Result<String, String> {
    let mut app_state = state.lock()
        .map_err(|e| standardize_error(InternalError::Other(format!("Failed to lock state: {}", e))))?;
    
    *app_state = AppState::default();
    
    log::info!("App state reset to default");
    Ok("Application state reset successfully".to_string())
} 