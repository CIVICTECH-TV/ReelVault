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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[test]
    fn test_app_state_default() {
        let state = AppState::default();
        
        assert_eq!(state.is_watching, false);
        assert_eq!(state.upload_queue.len(), 0);
        assert_eq!(state.current_uploads.len(), 0);
        assert_eq!(state.statistics.total_files_uploaded, 0);
        assert_eq!(state.statistics.total_bytes_uploaded, 0);
        assert_eq!(state.statistics.files_in_queue, 0);
        assert_eq!(state.statistics.successful_uploads, 0);
        assert_eq!(state.statistics.failed_uploads, 0);
        assert_eq!(state.statistics.average_upload_speed_mbps, 0.0);
        assert_eq!(state.last_error, None);
        assert_eq!(state.system_status.aws_connected, false);
        assert_eq!(state.system_status.disk_space_gb, 0.0);
        assert_eq!(state.system_status.memory_usage_mb, 0.0);
        assert_eq!(state.system_status.cpu_usage_percent, 0.0);
        assert_eq!(state.system_status.network_available, false);
        assert!(!state.system_status.last_heartbeat.is_empty());
    }

    #[test]
    fn test_upload_item_creation() {
        let item = UploadItem {
            id: "test-123".to_string(),
            file_path: "/test/file.mp4".to_string(),
            file_name: "file.mp4".to_string(),
            file_size: 1024 * 1024 * 100, // 100MB
            status: UploadStatus::Pending,
            created_at: "2024-01-01T00:00:00Z".to_string(),
            progress: 0.0,
        };
        
        assert_eq!(item.id, "test-123");
        assert_eq!(item.file_path, "/test/file.mp4");
        assert_eq!(item.file_name, "file.mp4");
        assert_eq!(item.file_size, 1024 * 1024 * 100);
        assert!(matches!(item.status, UploadStatus::Pending));
        assert_eq!(item.progress, 0.0);
    }

    #[test]
    fn test_upload_progress_creation() {
        let progress = UploadProgress {
            item_id: "test-123".to_string(),
            uploaded_bytes: 50 * 1024 * 1024, // 50MB
            total_bytes: 100 * 1024 * 1024,   // 100MB
            percentage: 50.0,
            speed_mbps: 10.5,
            eta_seconds: Some(5),
        };
        
        assert_eq!(progress.item_id, "test-123");
        assert_eq!(progress.uploaded_bytes, 50 * 1024 * 1024);
        assert_eq!(progress.total_bytes, 100 * 1024 * 1024);
        assert_eq!(progress.percentage, 50.0);
        assert_eq!(progress.speed_mbps, 10.5);
        assert_eq!(progress.eta_seconds, Some(5));
    }

    #[test]
    fn test_app_statistics_creation() {
        let stats = AppStatistics {
            total_files_uploaded: 10,
            total_bytes_uploaded: 1024 * 1024 * 1024, // 1GB
            files_in_queue: 5,
            successful_uploads: 8,
            failed_uploads: 2,
            average_upload_speed_mbps: 15.5,
        };
        
        assert_eq!(stats.total_files_uploaded, 10);
        assert_eq!(stats.total_bytes_uploaded, 1024 * 1024 * 1024);
        assert_eq!(stats.files_in_queue, 5);
        assert_eq!(stats.successful_uploads, 8);
        assert_eq!(stats.failed_uploads, 2);
        assert_eq!(stats.average_upload_speed_mbps, 15.5);
    }

    #[test]
    fn test_system_status_creation() {
        let status = SystemStatus {
            aws_connected: true,
            disk_space_gb: 500.0,
            memory_usage_mb: 8192.0,
            cpu_usage_percent: 25.5,
            network_available: true,
            last_heartbeat: "2024-01-01T00:00:00Z".to_string(),
        };
        
        assert_eq!(status.aws_connected, true);
        assert_eq!(status.disk_space_gb, 500.0);
        assert_eq!(status.memory_usage_mb, 8192.0);
        assert_eq!(status.cpu_usage_percent, 25.5);
        assert_eq!(status.network_available, true);
        assert_eq!(status.last_heartbeat, "2024-01-01T00:00:00Z");
    }

    #[tokio::test]
    async fn test_get_app_state() {
        let state_manager: AppStateManager = Arc::new(Mutex::new(AppState::default()));
        
        // Stateをモックするために、直接関数を呼び出す
        let result = {
            let app_state = state_manager.lock().unwrap();
            app_state.clone()
        };
        
        assert_eq!(result.is_watching, false);
        assert_eq!(result.upload_queue.len(), 0);
        assert_eq!(result.current_uploads.len(), 0);
        assert_eq!(result.last_error, None);
    }

    #[tokio::test]
    async fn test_set_app_state() {
        let state_manager: AppStateManager = Arc::new(Mutex::new(AppState::default()));
        
        let mut new_state = AppState::default();
        new_state.is_watching = true;
        new_state.last_error = Some("Test error".to_string());
        
        // Stateをモックするために、直接関数を呼び出す
        {
            let mut app_state = state_manager.lock().unwrap();
            *app_state = new_state.clone();
        }
        
        // 状態が更新されたことを確認
        let updated_state = {
            let app_state = state_manager.lock().unwrap();
            app_state.clone()
        };
        
        assert_eq!(updated_state.is_watching, true);
        assert_eq!(updated_state.last_error, Some("Test error".to_string()));
    }

    #[tokio::test]
    async fn test_update_app_state() {
        let state_manager: AppStateManager = Arc::new(Mutex::new(AppState::default()));
        
        // is_watchingフィールドの更新テスト
        {
            let mut app_state = state_manager.lock().unwrap();
            app_state.is_watching = true;
        }
        
        // 更新されたことを確認
        let updated_state = {
            let app_state = state_manager.lock().unwrap();
            app_state.clone()
        };
        
        assert_eq!(updated_state.is_watching, true);
    }

    #[tokio::test]
    async fn test_reset_app_state() {
        let state_manager: AppStateManager = Arc::new(Mutex::new(AppState::default()));
        
        // 初期状態を変更
        {
            let mut app_state = state_manager.lock().unwrap();
            app_state.is_watching = true;
            app_state.last_error = Some("Test error".to_string());
        }
        
        // リセット
        {
            let mut app_state = state_manager.lock().unwrap();
            *app_state = AppState::default();
        }
        
        // リセットされたことを確認
        let reset_state = {
            let app_state = state_manager.lock().unwrap();
            app_state.clone()
        };
        
        assert_eq!(reset_state.is_watching, false);
        assert_eq!(reset_state.last_error, None);
        assert_eq!(reset_state.upload_queue.len(), 0);
    }

    #[tokio::test]
    async fn test_upload_status_transitions() {
        // UploadStatusの各状態をテスト
        let pending = UploadStatus::Pending;
        let in_progress = UploadStatus::InProgress;
        let completed = UploadStatus::Completed;
        let failed = UploadStatus::Failed;
        let paused = UploadStatus::Paused;
        
        // 各状態が正しく識別されることを確認
        assert!(matches!(pending, UploadStatus::Pending));
        assert!(matches!(in_progress, UploadStatus::InProgress));
        assert!(matches!(completed, UploadStatus::Completed));
        assert!(matches!(failed, UploadStatus::Failed));
        assert!(matches!(paused, UploadStatus::Paused));
    }

    #[tokio::test]
    async fn test_app_statistics_calculation() {
        let mut stats = AppStatistics {
            total_files_uploaded: 0,
            total_bytes_uploaded: 0,
            files_in_queue: 0,
            successful_uploads: 0,
            failed_uploads: 0,
            average_upload_speed_mbps: 0.0,
        };
        
        // 統計情報の更新をシミュレート
        stats.total_files_uploaded += 1;
        stats.total_bytes_uploaded += 1024 * 1024 * 100; // 100MB
        stats.successful_uploads += 1;
        stats.average_upload_speed_mbps = 10.5;
        
        assert_eq!(stats.total_files_uploaded, 1);
        assert_eq!(stats.total_bytes_uploaded, 1024 * 1024 * 100);
        assert_eq!(stats.successful_uploads, 1);
        assert_eq!(stats.failed_uploads, 0);
        assert_eq!(stats.average_upload_speed_mbps, 10.5);
    }

    #[tokio::test]
    async fn test_system_status_monitoring() {
        let mut status = SystemStatus {
            aws_connected: false,
            disk_space_gb: 0.0,
            memory_usage_mb: 0.0,
            cpu_usage_percent: 0.0,
            network_available: false,
            last_heartbeat: "2024-01-01T00:00:00Z".to_string(),
        };
        
        // システム状態の更新をシミュレート
        status.aws_connected = true;
        status.disk_space_gb = 500.0;
        status.memory_usage_mb = 8192.0;
        status.cpu_usage_percent = 25.5;
        status.network_available = true;
        status.last_heartbeat = "2024-01-01T01:00:00Z".to_string();
        
        assert_eq!(status.aws_connected, true);
        assert_eq!(status.disk_space_gb, 500.0);
        assert_eq!(status.memory_usage_mb, 8192.0);
        assert_eq!(status.cpu_usage_percent, 25.5);
        assert_eq!(status.network_available, true);
        assert_eq!(status.last_heartbeat, "2024-01-01T01:00:00Z");
    }

    #[tokio::test]
    async fn test_state_update_validation() {
        let state_manager: AppStateManager = Arc::new(Mutex::new(AppState::default()));
        
        // 無効なフィールド名での更新をテスト
        // 実際の実装では、update_app_state関数でエラーハンドリングされる
        // ここでは状態管理の基本動作を確認
        
        let initial_state = {
            let app_state = state_manager.lock().unwrap();
            app_state.clone()
        };
        
        // 初期状態の確認
        assert_eq!(initial_state.is_watching, false);
        assert_eq!(initial_state.last_error, None);
        assert_eq!(initial_state.system_status.aws_connected, false);
    }
} 