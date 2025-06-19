use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use tauri::{command, State, AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio::time::sleep;
use uuid::Uuid;

use crate::commands::aws_auth::AwsCredentials;
use crate::commands::metadata::create_file_metadata;
use crate::internal::{InternalError, standardize_error};

/// アップロードアイテムの状態
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum UploadStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
    Paused,
    Cancelled,
}

/// アップロードアイテム
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadItem {
    pub id: String,
    pub file_path: String,
    pub file_name: String,
    pub file_size: u64,
    pub s3_key: String,
    pub status: UploadStatus,
    pub progress: f64,
    pub uploaded_bytes: u64,
    pub speed_mbps: f64,
    pub eta_seconds: Option<u64>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub error_message: Option<String>,
    pub retry_count: u32,
}

/// アップロード進捗情報
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadProgress {
    pub item_id: String,
    pub uploaded_bytes: u64,
    pub total_bytes: u64,
    pub percentage: f64,
    pub speed_mbps: f64,
    pub eta_seconds: Option<u64>,
    pub status: UploadStatus,
}

/// アップロード設定
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadConfig {
    pub aws_credentials: AwsCredentials,
    pub bucket_name: String,
    pub max_concurrent_uploads: usize,
    pub chunk_size_mb: u64,
    pub retry_attempts: u32,
    pub timeout_seconds: u64,
    pub auto_create_metadata: bool,
    pub s3_key_prefix: Option<String>,
    
    // 🎯 統一システム用の制限パラメータ
    pub max_concurrent_parts: usize,        // チャンクレベル並列度（無料版: 1, プレミアム版: 4-8）
    pub adaptive_chunk_size: bool,          // 動的チャンクサイズ（無料版: false, プレミアム版: true）
    pub min_chunk_size_mb: u64,            // 最小チャンクサイズ（無料版: 5MB固定）
    pub max_chunk_size_mb: u64,            // 最大チャンクサイズ（無料版: 5MB固定）
    pub bandwidth_limit_mbps: Option<f64>,  // 帯域制限（無料版: なし, プレミアム版: 設定可能）
    pub enable_resume: bool,                // 中断・再開機能（無料版: false, プレミアム版: true）
    pub tier: UploadTier,                   // 機能ティア
}

/// アップロード機能ティア
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum UploadTier {
    Free,     // 無料版
    Premium,  // プレミアム版
}

impl UploadConfig {


}



/// アップロードキューの管理
#[derive(Debug)]
pub struct UploadQueue {
    pub items: Vec<UploadItem>,
    pub active_uploads: HashMap<String, UploadProgress>,
    pub config: Option<UploadConfig>,
    pub is_processing: bool,
    pub total_uploaded_bytes: u64,
    pub total_files_uploaded: u64,
    /// 厳格な同時実行制御のための専用カウンター
    pub active_upload_count: usize,
}

impl UploadQueue {
    pub fn new() -> Self {
        Self {
            items: Vec::new(),
            active_uploads: HashMap::new(),
            config: None,
            is_processing: false,
            total_uploaded_bytes: 0,
            total_files_uploaded: 0,
            active_upload_count: 0,
        }
    }
    
    /// 安全な同時実行数取得
    pub fn get_active_upload_count(&self) -> usize {
        // 複数の状態を確認して最も正確な値を返す
        let in_progress_count = self.items.iter()
            .filter(|item| item.status == UploadStatus::InProgress)
            .count();
        let active_uploads_count = self.active_uploads.len();
        
        // 最大値を使用（より保守的なアプローチ）
        std::cmp::max(
            std::cmp::max(in_progress_count, active_uploads_count),
            self.active_upload_count
        )
    }
    
    /// アップロード開始時の状態更新
    pub fn start_upload(&mut self, item_id: &str) -> Result<(), InternalError> {
        if let Some(config) = &self.config {
            let current_active = self.get_active_upload_count();
            
            // 無料版の厳格な制限チェック
            if config.max_concurrent_uploads == 1 && current_active > 0 {
                return Err(InternalError::Other(format!("無料版では同時アップロードは1つまでです。現在アクティブ: {}", current_active)));
            }
            
            if current_active >= config.max_concurrent_uploads {
                return Err(InternalError::Other(format!("同時アップロード数の上限に達しています: {}/{}", 
                                 current_active, config.max_concurrent_uploads)));
            }
        }
        
        // 状態を更新
        if let Some(item) = self.items.iter_mut().find(|i| i.id == item_id) {
            item.status = UploadStatus::InProgress;
            item.started_at = Some(chrono::Utc::now().to_rfc3339());
            self.active_upload_count += 1;
            
            log::info!("Upload started: {} (active count: {})", item_id, self.active_upload_count);
            Ok(())
        } else {
            Err(InternalError::Other(format!("Upload item not found: {}", item_id)))
        }
    }
    
    /// アップロード完了時の状態更新
    pub fn complete_upload(&mut self, item_id: &str, success: bool, error_msg: Option<String>) {
        log::info!("🔧 complete_upload called: {} (success: {})", item_id, success);
        
        // アイテムの現在の状態をチェック
        let current_status = self.items.iter()
            .find(|i| i.id == item_id)
            .map(|i| i.status.clone());
        
        if let Some(status) = &current_status {
            if *status == UploadStatus::Completed {
                log::info!("⚠️  Upload already completed, skipping duplicate cleanup: {}", item_id);
                return;
            }
        }
        
        // アクティブカウントを減らす（重複減算を防ぐ）
        let was_active = self.active_uploads.contains_key(item_id) || 
                        current_status == Some(UploadStatus::InProgress);
        
        log::info!("🔍 Cleanup state check - was_active: {}, active_uploads contains: {}, current_status: {:?}", 
                   was_active, self.active_uploads.contains_key(item_id), current_status);
        
        if was_active && self.active_upload_count > 0 {
            self.active_upload_count -= 1;
            log::info!("🔽 Active upload count decreased: {} -> {}", 
                       self.active_upload_count + 1, self.active_upload_count);
        }
        
        // active_uploadsから削除（成功・失敗に関わらず必ず削除）
        let removed = self.active_uploads.remove(item_id);
        log::info!("🗑️  Removing from active_uploads: {} (was present: {})", item_id, removed.is_some());
        
        // アイテムの状態を更新
        if let Some(item) = self.items.iter_mut().find(|i| i.id == item_id) {
            if success {
                item.status = UploadStatus::Completed;
                item.completed_at = Some(chrono::Utc::now().to_rfc3339());
                item.progress = 100.0;
                self.total_files_uploaded += 1;
                self.total_uploaded_bytes += item.file_size;
                log::info!("✅ Upload marked as completed: {} ({})", item.file_name, item_id);
            } else {
                item.status = UploadStatus::Failed;
                item.error_message = error_msg;
                log::error!("❌ Upload marked as failed: {} ({})", item.file_name, item_id);
            }
        }
        
        log::info!("📊 Upload completion summary - Active count: {}, Active uploads: {}, Items in progress: {}", 
                   self.active_upload_count, 
                   self.active_uploads.len(),
                   self.items.iter().filter(|i| i.status == UploadStatus::InProgress).count());
    }
    
    /// 無料版制限チェック
    pub fn check_free_tier_limits(&self, new_files_count: usize) -> Result<(), InternalError> {
        if let Some(config) = &self.config {
            if config.tier == UploadTier::Free {
                // 無料版の制限チェック
                let total_files = self.items.len() + new_files_count;
                if total_files > 10 {
                    return Err(InternalError::Other("無料版では最大10ファイルまでアップロードできます".to_string()));
                }
                
                let total_size_mb = (self.total_uploaded_bytes + 
                    self.items.iter().map(|i| i.file_size).sum::<u64>()) / 1024 / 1024;
                if total_size_mb > 100 {
                    return Err(InternalError::Other("無料版では最大100MBまでアップロードできます".to_string()));
                }
            }
        }
        Ok(())
    }
}

pub type UploadQueueState = Arc<Mutex<UploadQueue>>;

/// アップロード統計
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadStatistics {
    pub total_files: u64,
    pub completed_files: u64,
    pub failed_files: u64,
    pub pending_files: u64,
    pub in_progress_files: u64,
    pub total_bytes: u64,
    pub uploaded_bytes: u64,
    pub average_speed_mbps: f64,
    pub estimated_time_remaining: Option<u64>,
}

/// ファイル選択ダイアログの結果
#[derive(Debug, Serialize, Deserialize)]
pub struct FileSelection {
    pub selected_files: Vec<String>,
    pub total_size: u64,
    pub file_count: u32,
}

/// S3キー生成設定
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3KeyConfig {
    pub prefix: Option<String>,
    pub use_date_folder: bool,
    pub preserve_directory_structure: bool,
    pub custom_naming_pattern: Option<String>,
}

/// アップロードキューを初期化
#[command]
pub async fn initialize_upload_queue(
    config: UploadConfig,
    queue_state: State<'_, UploadQueueState>,
) -> Result<String, String> {
    let mut queue = queue_state.lock()
        .map_err(|e| standardize_error(InternalError::Other(format!("Failed to lock upload queue: {}", e))))?;
    
    queue.config = Some(config);
    queue.is_processing = false;
    queue.items.clear();
    queue.active_uploads.clear();
    queue.total_uploaded_bytes = 0;
    queue.total_files_uploaded = 0;
    queue.active_upload_count = 0;
    
    log::info!("Upload queue initialized with configuration");
    Ok("Upload queue initialized successfully".to_string())
}

/// ファイル選択ダイアログを開く
#[command]
pub async fn open_file_dialog(
    _app_handle: AppHandle,
    multiple: bool,
    _file_types: Option<Vec<String>>,
) -> Result<FileSelection, String> {
    let files = if multiple {
        rfd::FileDialog::new()
            .set_title("Select files to upload")
            .pick_files()
    } else {
        rfd::FileDialog::new()
            .set_title("Select a file to upload")
            .pick_file()
            .map(|f| vec![f])
    };

    match files {
        Some(selected_files) => {
            let total_size: u64 = selected_files.iter()
                .map(|f| f.as_path().metadata().map(|m| m.len()).unwrap_or(0))
                .sum();
            
            let file_paths: Vec<String> = selected_files.iter()
                .map(|f| f.as_path().to_string_lossy().to_string())
                .collect();
            
            Ok(FileSelection {
                selected_files: file_paths,
                total_size,
                file_count: selected_files.len() as u32,
            })
        }
        None => Err(standardize_error(InternalError::Other("No files selected".to_string())))
    }
}

/// ファイルをアップロードキューに追加
#[command]
pub async fn add_files_to_upload_queue(
    file_paths: Vec<String>,
    s3_key_config: S3KeyConfig,
    queue_state: State<'_, UploadQueueState>,
) -> Result<String, String> {
    let mut queue = queue_state.lock()
        .map_err(|e| standardize_error(InternalError::Other(format!("Failed to lock upload queue: {}", e))))?;
    
    // 無料版の制限チェック
    queue.check_free_tier_limits(file_paths.len())
        .map_err(|e| standardize_error(e))?;
    
    let _config = queue.config.as_ref()
        .ok_or_else(|| standardize_error(InternalError::Config("Upload configuration not initialized".to_string())))?;
    
    for file_path in &file_paths {
        // ファイルの存在確認
        if !Path::new(&file_path).exists() {
            return Err(standardize_error(InternalError::File(format!("File not found: {}", file_path))));
        }
        
        // S3キーを生成
        let s3_key = generate_s3_key(&file_path, &s3_key_config)
            .map_err(|e| standardize_error(InternalError::Other(e.to_string())))?;
        
        // ファイル情報を取得
        let metadata = std::fs::metadata(&file_path)
            .map_err(|e| standardize_error(InternalError::File(format!("Failed to get file metadata: {}", e))))?;
        
        let file_name = Path::new(&file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();
        
        // アップロードアイテムを作成
        let item = UploadItem {
            id: Uuid::new_v4().to_string(),
            file_path: file_path.clone(),
            file_name,
            file_size: metadata.len(),
            s3_key,
            status: UploadStatus::Pending,
            progress: 0.0,
            uploaded_bytes: 0,
            speed_mbps: 0.0,
            eta_seconds: None,
            created_at: chrono::Utc::now().to_rfc3339(),
            started_at: None,
            completed_at: None,
            error_message: None,
            retry_count: 0,
        };
        
        queue.items.push(item);
    }
    
    log::info!("Added {} files to upload queue", file_paths.len());
    Ok(format!("Added {} files to upload queue", file_paths.len()))
}

/// アップロードアイテムを削除
#[command]
pub async fn remove_upload_item(
    item_id: String,
    queue_state: State<'_, UploadQueueState>,
) -> Result<String, String> {
    let mut queue = queue_state.lock()
        .map_err(|e| standardize_error(InternalError::Other(format!("Failed to lock upload queue: {}", e))))?;
    
    let initial_count = queue.items.len();
    queue.items.retain(|item| item.id != item_id);
    queue.active_uploads.remove(&item_id);
    
    let removed_count = initial_count - queue.items.len();
    if removed_count > 0 {
        log::info!("Removed upload item: {}", item_id);
        Ok(format!("Removed {} upload item(s)", removed_count))
    } else {
        Err(standardize_error(InternalError::Other(format!("Upload item not found: {}", item_id))))
    }
}

/// アップロード処理を開始
#[command]
pub async fn start_upload_processing(
    app_handle: AppHandle,
    queue_state: State<'_, UploadQueueState>,
) -> Result<String, String> {
    let mut queue = queue_state.lock()
        .map_err(|e| standardize_error(InternalError::Other(format!("Failed to lock upload queue: {}", e))))?;
    
    if queue.is_processing {
        return Err(standardize_error(InternalError::Other("Upload processing is already running".to_string())));
    }
    
    let config = queue.config.as_ref()
        .ok_or_else(|| standardize_error(InternalError::Config("Upload configuration not initialized".to_string())))?
        .clone();
    
    queue.is_processing = true;
    drop(queue); // ロックを解放
    
    // バックグラウンドでアップロード処理を開始
    let queue_state_clone = queue_state.inner().clone();
    let config_clone = config.clone();
    
    tokio::spawn(async move {
        if let Err(e) = process_upload_queue(queue_state_clone, app_handle, config_clone).await {
            log::error!("Upload processing failed: {}", e);
        }
    });
    
    Ok("Upload processing started".to_string())
}

/// アップロード処理を停止
#[command]
pub async fn stop_upload_processing(
    queue_state: State<'_, UploadQueueState>,
) -> Result<String, String> {
    let mut queue = queue_state.lock()
        .map_err(|e| standardize_error(InternalError::Other(format!("Failed to lock upload queue: {}", e))))?;
    
    queue.is_processing = false;
    
    // 進行中のアップロードをキャンセル
    for item in queue.items.iter_mut() {
        if item.status == UploadStatus::InProgress {
            item.status = UploadStatus::Cancelled;
        }
    }
    
    queue.active_uploads.clear();
    queue.active_upload_count = 0;
    
    log::info!("Upload processing stopped");
    Ok("Upload processing stopped".to_string())
}

/// アップロードキューの状態を取得
#[command]
pub async fn get_upload_queue_status(
    queue_state: State<'_, UploadQueueState>,
) -> Result<UploadStatistics, String> {
    let queue = queue_state.lock()
        .map_err(|e| standardize_error(InternalError::Other(format!("Failed to lock upload queue: {}", e))))?;
    
    let total_files = queue.items.len() as u64;
    let completed_files = queue.items.iter()
        .filter(|item| item.status == UploadStatus::Completed)
        .count() as u64;
    let failed_files = queue.items.iter()
        .filter(|item| item.status == UploadStatus::Failed)
        .count() as u64;
    let pending_files = queue.items.iter()
        .filter(|item| item.status == UploadStatus::Pending)
        .count() as u64;
    let in_progress_files = queue.items.iter()
        .filter(|item| item.status == UploadStatus::InProgress)
        .count() as u64;
    
    let total_bytes: u64 = queue.items.iter().map(|item| item.file_size).sum();
    let uploaded_bytes: u64 = queue.items.iter().map(|item| item.uploaded_bytes).sum();
    
    let average_speed = if !queue.active_uploads.is_empty() {
        queue.active_uploads.values()
            .map(|progress| progress.speed_mbps)
            .sum::<f64>() / queue.active_uploads.len() as f64
    } else {
        0.0
    };
    
    let estimated_time = if average_speed > 0.0 {
        let remaining_bytes = total_bytes.saturating_sub(uploaded_bytes);
        let remaining_mb = remaining_bytes as f64 / 1024.0 / 1024.0;
        Some((remaining_mb / average_speed) as u64)
    } else {
        None
    };
    
    Ok(UploadStatistics {
        total_files,
        completed_files,
        failed_files,
        pending_files,
        in_progress_files,
        total_bytes,
        uploaded_bytes,
        average_speed_mbps: average_speed,
        estimated_time_remaining: estimated_time,
    })
}

/// アップロードキューアイテムを取得
#[command]
pub async fn get_upload_queue_items(
    queue_state: State<'_, UploadQueueState>,
) -> Result<Vec<UploadItem>, String> {
    let queue = queue_state.lock()
        .map_err(|e| standardize_error(InternalError::Other(format!("Failed to lock upload queue: {}", e))))?;
    
    Ok(queue.items.clone())
}

/// アップロードアイテムをリトライ
#[command]
pub async fn retry_upload_item(
    item_id: String,
    queue_state: State<'_, UploadQueueState>,
) -> Result<String, String> {
    let mut queue = queue_state.lock()
        .map_err(|e| standardize_error(InternalError::Other(format!("Failed to lock upload queue: {}", e))))?;
    
    if let Some(item) = queue.items.iter_mut().find(|i| i.id == item_id) {
        item.status = UploadStatus::Pending;
        item.progress = 0.0;
        item.uploaded_bytes = 0;
        item.error_message = None;
        item.retry_count += 1;
        
        log::info!("Retrying upload item: {}", item_id);
        Ok("Upload item queued for retry".to_string())
    } else {
        Err(standardize_error(InternalError::Other(format!("Upload item not found: {}", item_id))))
    }
}

/// S3キーを生成
fn generate_s3_key(file_path: &str, config: &S3KeyConfig) -> Result<String, InternalError> {
    let path = Path::new(file_path);
    let file_name = path.file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| InternalError::File("Invalid file name".to_string()))?;
    
    let mut s3_key = String::new();
    
    // プレフィックスを追加
    if let Some(prefix) = &config.prefix {
        s3_key.push_str(prefix);
        if !s3_key.ends_with('/') {
            s3_key.push('/');
        }
    }
    
    // 日付フォルダを追加
    if config.use_date_folder {
        let date = chrono::Utc::now().format("%Y/%m/%d");
        s3_key.push_str(&date.to_string());
        s3_key.push('/');
    }
    
    // ディレクトリ構造を保持
    if config.preserve_directory_structure {
        if let Some(parent) = path.parent() {
            if let Some(parent_str) = parent.to_str() {
                if !parent_str.is_empty() && parent_str != "." {
                    s3_key.push_str(parent_str);
                    s3_key.push('/');
                }
            }
        }
    }
    
    // カスタム命名パターンを適用
    if let Some(pattern) = &config.custom_naming_pattern {
        // 簡易的なパターン置換
        let custom_name = pattern
            .replace("{filename}", file_name)
            .replace("{timestamp}", &chrono::Utc::now().timestamp().to_string())
            .replace("{uuid}", &Uuid::new_v4().to_string());
        s3_key.push_str(&custom_name);
    } else {
        s3_key.push_str(file_name);
    }
    
    Ok(s3_key)
}

/// バックグラウンドでアップロードキューを処理
async fn process_upload_queue(
    queue_state: UploadQueueState,
    app_handle: AppHandle,
    config: UploadConfig,
) -> Result<(), String> {
    log::info!("🚀 process_upload_queue started with max_concurrent: {}", config.max_concurrent_uploads);
    
    // 開始時のテストイベント送信
    if let Err(e) = app_handle.emit("test-event", "process_upload_queue started") {
        log::error!("Failed to emit process start test event: {}", e);
    } else {
        log::info!("Process start test event emitted successfully");
    }
    
    let max_concurrent = config.max_concurrent_uploads;
    let (tx, mut rx) = mpsc::channel::<UploadProgress>(100);
    
    loop {
        // 処理停止チェック
        {
            let queue = queue_state.lock()
                .map_err(|e| format!("Failed to lock queue: {}", e))?;
            if !queue.is_processing {
                break;
            }
        }
        
        // 新しいアップロードを開始できるかチェック
        let (should_wait, pending_items) = {
            let mut queue = queue_state.lock()
                .map_err(|e| format!("Failed to lock queue: {}", e))?;
            let current_active = queue.get_active_upload_count();
            if current_active >= max_concurrent {
                (true, Vec::new())
            } else {
                let available_slots = max_concurrent.saturating_sub(current_active);
                let mut pending = Vec::new();
                let max_new_uploads = if max_concurrent == 1 {
                    if current_active > 0 { 0 } else { 1 }
                } else {
                    available_slots
                };
                let pending_item_ids: Vec<String> = queue.items.iter()
                    .filter(|item| item.status == UploadStatus::Pending)
                    .take(max_new_uploads)
                    .map(|item| item.id.clone())
                    .collect();
                for item_id in pending_item_ids {
                    match queue.start_upload(&item_id) {
                        Ok(()) => {
                            if let Some(item) = queue.items.iter().find(|i| i.id == item_id) {
                                pending.push(item.clone());
                                if max_concurrent == 1 {
                                    break;
                                }
                            }
                        }
                        Err(e) => {
                            log::error!("Failed to start upload for {}: {}", item_id, e);
                            break;
                        }
                    }
                }
                (false, pending)
            }
        };
        
        if should_wait {
            sleep(Duration::from_millis(1000)).await;
            continue;
        }
        
        // 新しいアップロードタスクを開始
        for item in pending_items {
            let queue_state_clone = queue_state.clone();
            let config_clone = config.clone();
            let tx_clone = tx.clone();
            let item_id = item.id.clone();
            let file_name = item.file_name.clone();
            
            tokio::spawn(async move {
                log::info!("🔄 Starting upload task for: {} ({})", file_name, item_id);
                
                let result = upload_file_to_s3(
                    item.file_path,
                    item.s3_key,
                    config_clone,
                    tx_clone,
                    item_id.clone(),
                ).await;
                
                let (success, error_msg) = match result {
                    Ok(_) => (true, None),
                    Err(e) => (false, Some(e)),
                };
                
                // 新しい状態管理システムを使用してアップロード完了を記録
                {
                    let mut queue = queue_state_clone.lock().unwrap();
                    // 既に完了済みかチェック（進捗更新で先に処理された場合）
                    if let Some(item) = queue.items.iter().find(|i| i.id == item_id) {
                        if item.status == UploadStatus::Completed {
                            log::info!("✅ Upload already completed by progress update, skipping task cleanup: {}", item_id);
                        } else {
                            log::info!("🔄 Task completion: calling complete_upload for {}", item_id);
                            queue.complete_upload(&item_id, success, error_msg.clone());
                        }
                    } else {
                        log::warn!("⚠️  Upload item not found during task completion: {}", item_id);
                    }
                }
                
                if success {
                    log::info!("Upload task completed successfully: {} ({})", file_name, item_id);
                } else {
                    log::error!("Upload task failed: {} ({}), error: {}", file_name, item_id, error_msg.unwrap_or_default());
                }
            });
        }
        
        // 進捗更新を処理
        let mut progress_received = 0;
        while let Ok(progress) = rx.try_recv() {
            progress_received += 1;
            {
                let mut queue = queue_state.lock()
                    .map_err(|e| format!("Failed to lock queue: {}", e))?;
                queue.active_uploads.insert(progress.item_id.clone(), progress.clone());
                
                // キューアイテムの進捗も更新
                let (should_cleanup, file_name, file_size, is_success) = {
                    if let Some(item) = queue.items.iter_mut().find(|i| i.id == progress.item_id) {
                        let was_in_progress = item.status == UploadStatus::InProgress;
                        
                        item.progress = progress.percentage;
                        item.uploaded_bytes = progress.uploaded_bytes;
                        item.speed_mbps = progress.speed_mbps;
                        item.eta_seconds = progress.eta_seconds;
                        item.status = progress.status.clone();
                        
                        // 完了時（成功・失敗問わず）の判定と必要な値の取得
                        let is_completed = matches!(progress.status, UploadStatus::Completed | UploadStatus::Failed);
                        if is_completed && was_in_progress {
                            if progress.status == UploadStatus::Completed {
                                item.completed_at = Some(chrono::Utc::now().to_rfc3339());
                            }
                            (true, item.file_name.clone(), item.file_size, progress.status == UploadStatus::Completed)
                        } else {
                            (false, String::new(), 0, false)
                        }
                    } else {
                        (false, String::new(), 0, false)
                    }
                };
                
                // 借用が終了した後でクリーンアップ処理
                if should_cleanup {
                    if is_success {
                        log::info!("🎉 Upload 100% completed, performing immediate cleanup: {}", progress.item_id);
                        queue.total_files_uploaded += 1;
                        queue.total_uploaded_bytes += file_size;
                    } else {
                        log::info!("💥 Upload failed, performing immediate cleanup: {}", progress.item_id);
                    }
                    
                    // アクティブカウントを減らす
                    let old_count = queue.active_upload_count;
                    if queue.active_upload_count > 0 {
                        queue.active_upload_count -= 1;
                        log::info!("🔽 Active upload count decreased: {} -> {}", 
                                   old_count, queue.active_upload_count);
                    }
                    
                    // active_uploadsから削除
                    let removed = queue.active_uploads.remove(&progress.item_id);
                    log::info!("🗑️  Removed from active_uploads: {} (was present: {})", progress.item_id, removed.is_some());
                    
                    if is_success {
                        log::info!("✅ Upload completed and cleaned up: {} ({})", file_name, progress.item_id);
                    } else {
                        log::info!("❌ Upload failed and cleaned up: {} ({})", file_name, progress.item_id);
                    }
                    log::info!("📊 Cleanup summary - Active count: {}, Active uploads: {}", 
                               queue.active_upload_count, queue.active_uploads.len());
                }
            } // ロックをここで解放
            
            // フロントエンドに進捗を通知
            log::info!("Emitting progress event to frontend: {:.1}% for {}", 
                       progress.percentage, progress.item_id);
            if let Err(e) = app_handle.emit("upload-progress", &progress) {
                log::error!("Failed to emit upload progress: {}", e);
            } else {
                log::info!("Progress event emitted successfully: {:.1}%", progress.percentage);
            }
        }
        
        if progress_received > 0 {
            log::info!("Processed {} progress updates in this cycle", progress_received);
        }
        
        // アップロード停止検出とリカバリ
        let (has_pending, has_active, all_completed) = {
            let queue = queue_state.lock()
                .map_err(|e| format!("Failed to lock queue: {}", e))?;
            let pending = queue.items.iter().any(|item| item.status == UploadStatus::Pending);
            let active = queue.get_active_upload_count() > 0;
            let completed = queue.items.iter().all(|item| 
                matches!(item.status, UploadStatus::Completed | UploadStatus::Failed | UploadStatus::Cancelled)
            );
            (pending, active, completed)
        };
        
        // 全てのファイルが完了した場合は処理を停止
        if all_completed {
            log::info!("🎉 All uploads completed! Stopping processing");
            break;
        }
        
        // 待機時間を設定
        if !has_pending && !has_active {
            log::info!("No pending or active uploads, waiting...");
            sleep(Duration::from_millis(5000)).await;
        } else {
            sleep(Duration::from_millis(100)).await;
        }
    }
    
    log::info!("🚀 process_upload_queue completed");
    Ok(())
}

/// 単一ファイルのアップロード処理
async fn upload_file_to_s3(
    file_path: String,
    s3_key: String,
    config: UploadConfig,
    progress_tx: mpsc::Sender<UploadProgress>,
    item_id: String,
) -> Result<String, String> {
    use aws_config::{BehaviorVersion, Region};
    use aws_sdk_s3::Client as S3Client;
    use aws_credential_types::Credentials;
    use std::path::Path;
    use tokio::fs::File;
    use tokio::io::AsyncReadExt;
    
    log::info!("Starting upload for file: {} -> s3://{}/{}", file_path, config.bucket_name, s3_key);
    
    // 🔍 受信した設定の全詳細をデバッグ出力
    log::info!("🔧 === アップロード設定詳細 ===");
    log::info!("🔧 tier: {:?}", config.tier);
    log::info!("🔧 chunk_size_mb: {}", config.chunk_size_mb);
    log::info!("🔧 max_concurrent_uploads: {}", config.max_concurrent_uploads);
    log::info!("🔧 max_concurrent_parts: {}", config.max_concurrent_parts);
    log::info!("🔧 adaptive_chunk_size: {}", config.adaptive_chunk_size);
    log::info!("🔧 min_chunk_size_mb: {}", config.min_chunk_size_mb);
    log::info!("🔧 max_chunk_size_mb: {}", config.max_chunk_size_mb);
    log::info!("🔧 retry_attempts: {}", config.retry_attempts);
    log::info!("🔧 timeout_seconds: {}", config.timeout_seconds);
    log::info!("🔧 enable_resume: {}", config.enable_resume);
    log::info!("🔧 ========================");
    
    // ファイル存在確認
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }
    
    let file_size = std::fs::metadata(&path)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?
        .len();
    
    // AWS設定
    let region = Region::new(config.aws_credentials.region.clone());
    let mut config_builder = aws_config::defaults(BehaviorVersion::latest())
        .region(region);
    
    let creds = Credentials::new(
        &config.aws_credentials.access_key_id,
        &config.aws_credentials.secret_access_key,
        config.aws_credentials.session_token.clone(),
        None,
        "upload",
    );
    
    config_builder = config_builder.credentials_provider(creds);
    let aws_config = config_builder.load().await;
    let s3_client = S3Client::new(&aws_config);
    
    let start_time = Instant::now();
    let mut uploaded_bytes = 0u64;
    
    // 進捗レポート用のクロージャ
    let report_progress = |uploaded: u64, total: u64, speed_mbps: f64| {
        let percentage = if total > 0 {
            (uploaded as f64 / total as f64) * 100.0
        } else {
            0.0
        };
        
        let eta_seconds = if speed_mbps > 0.0 {
            let remaining_mb = (total - uploaded) as f64 / (1024.0 * 1024.0);
            Some((remaining_mb / speed_mbps) as u64)
        } else {
            None
        };
        
        let progress = UploadProgress {
            item_id: item_id.clone(),
            uploaded_bytes: uploaded,
            total_bytes: total,
            percentage,
            speed_mbps,
            eta_seconds,
            status: if uploaded >= total {
                UploadStatus::Completed
            } else {
                UploadStatus::InProgress
            },
        };
        
        if let Err(e) = progress_tx.try_send(progress) {
            log::warn!("Failed to send progress update: {}", e);
        }
    };
    
    // S3制限準拠のチャンクサイズ設定（事前計算）
    let configured_size = config.chunk_size_mb * 1024 * 1024;
    let s3_min_size = 5 * 1024 * 1024; // 5MB
    let effective_chunk_size = std::cmp::max(configured_size, s3_min_size);
    
    // 🔍 チャンクサイズ計算の詳細をデバッグ出力
    log::info!("🔧 === チャンクサイズ計算 ===");
    log::info!("🔧 config.chunk_size_mb: {}", config.chunk_size_mb);
    log::info!("🔧 configured_size (bytes): {}", configured_size);
    log::info!("🔧 s3_min_size (bytes): {}", s3_min_size);
    log::info!("🔧 effective_chunk_size (bytes): {}", effective_chunk_size);
    log::info!("🔧 effective_chunk_size (MB): {}", effective_chunk_size / (1024 * 1024));
    log::info!("🔧 ========================");
    
    if effective_chunk_size != configured_size {
        log::warn!("⚠️ Chunk size adjusted for S3 compliance: {} MB -> {} MB", 
                  configured_size / (1024 * 1024), effective_chunk_size / (1024 * 1024));
    }
    
    // 小さなファイルの場合は単純アップロード（調整後のチャンクサイズで判定）
    if file_size <= effective_chunk_size {
        log::info!("Using simple upload for small file: {} bytes", file_size);
        
        let mut file = File::open(&path).await
            .map_err(|e| format!("Failed to open file: {}", e))?;
        
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer).await
            .map_err(|e| format!("Failed to read file: {}", e))?;
        
        uploaded_bytes = buffer.len() as u64;
        
        // 進捗レポート
        let elapsed = start_time.elapsed().as_secs_f64();
        let speed_mbps = if elapsed > 0.0 {
            (uploaded_bytes as f64 / (1024.0 * 1024.0)) / elapsed
        } else {
            0.0
        };
        
        report_progress(uploaded_bytes, file_size, speed_mbps);
        
        s3_client
            .put_object()
            .bucket(&config.bucket_name)
            .key(&s3_key)
            .body(buffer.into())
            .send()
            .await
            .map_err(|e| format!("S3 upload failed: {}", e))?;
        
        log::info!("Simple upload completed: {} bytes", uploaded_bytes);
        
    } else {
        // マルチパートアップロード
        log::info!("Using multipart upload for large file: {} bytes", file_size);
        
        let create_response = s3_client
            .create_multipart_upload()
            .bucket(&config.bucket_name)
            .key(&s3_key)
            .send()
            .await
            .map_err(|e| format!("Failed to create multipart upload: {}", e))?;
        
        let upload_id = create_response.upload_id()
            .ok_or("No upload ID returned")?;
        
        // 事前計算されたチャンクサイズを使用
        let chunk_size = effective_chunk_size;
        let mut part_number = 1;
        let mut completed_parts = Vec::new();
        
        let mut file = File::open(&path).await
            .map_err(|e| format!("Failed to open file: {}", e))?;
        
        loop {
            let mut buffer = vec![0u8; chunk_size as usize];
            
            // 🔍 バッファサイズをデバッグ出力
            log::info!("🔧 Reading chunk: buffer_size={} bytes ({} MB)", 
                       buffer.len(), buffer.len() / (1024 * 1024));
            
            // 完全にチャンクサイズを読み込むまでループ
            let mut total_bytes_read = 0;
            let mut temp_buffer = vec![0u8; chunk_size as usize];
            
            while total_bytes_read < chunk_size as usize {
                let bytes_read = file.read(&mut temp_buffer[total_bytes_read..]).await
                    .map_err(|e| format!("Failed to read file chunk: {}", e))?;
                
                if bytes_read == 0 {
                    // ファイル終端に達した
                    break;
                }
                
                total_bytes_read += bytes_read;
            }
            
            // 🔍 実際の読み込みサイズをデバッグ出力
            log::info!("🔧 Read result: total_bytes_read={} bytes ({} MB)", 
                       total_bytes_read, total_bytes_read / (1024 * 1024));
            
            if total_bytes_read == 0 {
                break;
            }
            
            // 実際に読み込んだサイズでバッファを調整
            temp_buffer.truncate(total_bytes_read);
            buffer = temp_buffer;
            
            let upload_part_response = s3_client
                .upload_part()
                .bucket(&config.bucket_name)
                .key(&s3_key)
                .upload_id(upload_id)
                .part_number(part_number)
                .body(buffer.into())
                .send()
                .await
                .map_err(|e| format!("Failed to upload part {}: {}", part_number, e))?;
            
            let etag = upload_part_response.e_tag()
                .ok_or(format!("No ETag for part {}", part_number))?;
            
            completed_parts.push(
                aws_sdk_s3::types::CompletedPart::builder()
                    .part_number(part_number)
                    .e_tag(etag)
                    .build()
            );
            
            uploaded_bytes += total_bytes_read as u64;
            part_number += 1;
            
            // 進捗レポート
            let elapsed = start_time.elapsed().as_secs_f64();
            let speed_mbps = if elapsed > 0.0 {
                (uploaded_bytes as f64 / (1024.0 * 1024.0)) / elapsed
            } else {
                0.0
            };
            
            report_progress(uploaded_bytes, file_size, speed_mbps);
            
            log::info!("Uploaded part {}: {} bytes (total: {}/{})", 
                       part_number - 1, total_bytes_read, uploaded_bytes, file_size);
        }
        
        // マルチパートアップロード完了（エラーハンドリング強化）
        log::info!("🔧 Completing multipart upload with {} parts", completed_parts.len());
        
        // パーツを部品番号順にソート（重要）
        let mut sorted_parts = completed_parts;
        sorted_parts.sort_by_key(|part| part.part_number());
        
        // デバッグ情報（詳細）
        log::info!("🔧 Preparing to complete multipart upload with {} parts:", sorted_parts.len());
        for (i, part) in sorted_parts.iter().enumerate() {
            log::info!("  Part {}: number={:?}, etag={:?}", 
                       i + 1, part.part_number(), part.e_tag());
            
            // パーツ番号の検証
            if part.part_number().is_none() {
                log::error!("❌ Part {} has None part_number!", i + 1);
            }
            if part.e_tag().is_none() {
                log::error!("❌ Part {} has None etag!", i + 1);
            }
        }
        
        let parts_count = sorted_parts.len();
        let completed_upload = aws_sdk_s3::types::CompletedMultipartUpload::builder()
            .set_parts(Some(sorted_parts))
            .build();
        
        // リトライ付きマルチパート完了
        let mut retry_count = 0;
        let max_retries = 3;
        
        loop {
            match s3_client
                .complete_multipart_upload()
                .bucket(&config.bucket_name)
                .key(&s3_key)
                .upload_id(upload_id)
                .multipart_upload(completed_upload.clone())
                .send()
                .await
            {
                Ok(response) => {
                    log::info!("✅ Multipart upload completed successfully: {:?}", response.location());
                    break;
                }
                Err(e) => {
                    retry_count += 1;
                    
                    // 詳細なエラー情報をログ出力
                    log::error!("🔍 Multipart upload completion error details:");
                    log::error!("  ├─ Error: {:?}", e);
                    log::error!("  ├─ Bucket: {}", config.bucket_name);
                    log::error!("  ├─ Key: {}", s3_key);
                    log::error!("  ├─ Upload ID: {}", upload_id);
                    log::error!("  ├─ Parts count: {}", parts_count);
                    log::error!("  └─ Attempt: {}/{}", retry_count, max_retries);
                    
                    if retry_count > max_retries {
                        log::error!("❌ Multipart upload completion failed after {} retries: {}", max_retries, e);
                        return Err(format!("Failed to complete multipart upload after {} retries: {}", max_retries, e));
                    }
                    
                    let delay = Duration::from_millis(1000 * retry_count as u64);
                    log::warn!("⚠️ Multipart upload completion failed (attempt {}), retrying in {:?}: {}", 
                              retry_count, delay, e);
                    tokio::time::sleep(delay).await;
                }
            }
        }
        
        log::info!("Multipart upload completed: {} bytes in {} parts", uploaded_bytes, part_number - 1);
    }
    
    // 最終進捗レポート
    let elapsed = start_time.elapsed().as_secs_f64();
    let speed_mbps = if elapsed > 0.0 {
        (uploaded_bytes as f64 / (1024.0 * 1024.0)) / elapsed
    } else {
        0.0
    };
    
    report_progress(uploaded_bytes, file_size, speed_mbps);
    
    // メタデータ作成（設定されている場合）
    if config.auto_create_metadata {
        use std::collections::HashMap;
        let tags = vec!["upload".to_string()];
        let custom_fields = HashMap::new();
        if let Err(e) = create_file_metadata(file_path.clone(), tags, custom_fields).await {
            log::warn!("Failed to create metadata for {}: {}", s3_key, e);
        }
    }
    
    Ok(format!("Upload completed: {} bytes", uploaded_bytes))
}

/// アップロードキューをクリア
#[command]
pub async fn clear_upload_queue(
    queue_state: State<'_, UploadQueueState>,
) -> Result<String, String> {
    let mut queue = queue_state.lock()
        .map_err(|e| format!("Failed to lock upload queue: {}", e))?;
    
    // アクティブなアップロードがある場合は停止
    if !queue.active_uploads.is_empty() {
        queue.is_processing = false;
    }
    
    queue.items.clear();
    queue.active_uploads.clear();
    
    log::info!("Upload queue cleared");
    Ok("Upload queue cleared".to_string())
}

/// アップロード設定をテスト
#[command]
pub async fn test_upload_config(config: UploadConfig) -> Result<String, String> {
    use aws_config::{BehaviorVersion, Region};
    use aws_sdk_s3::Client as S3Client;
    use aws_credential_types::Credentials;
    
    // AWS認証テスト
    let region = Region::new(config.aws_credentials.region.clone());
    let mut config_builder = aws_config::defaults(BehaviorVersion::latest())
        .region(region);
    
    let creds = Credentials::new(
        &config.aws_credentials.access_key_id,
        &config.aws_credentials.secret_access_key,
        config.aws_credentials.session_token.clone(),
        None,
        "test",
    );
    
    config_builder = config_builder.credentials_provider(creds);
    let aws_config = config_builder.load().await;
    let s3_client = S3Client::new(&aws_config);
    
    // バケットアクセステスト
    s3_client
        .head_bucket()
        .bucket(&config.bucket_name)
        .send()
        .await
        .map_err(|e| format!("Bucket access test failed: {}", e))?;
    
    Ok(format!("Upload configuration test successful for bucket: {}", config.bucket_name))
}




#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tempfile::tempdir;
    use std::fs::File;
    use std::io::Write;

    #[cfg(test)]
    fn create_test_credentials() -> AwsCredentials {
        AwsCredentials {
            access_key_id: "test_access_key".to_string(),
            secret_access_key: "test_secret_key".to_string(),
            region: "ap-northeast-1".to_string(),
            session_token: None,
        }
    }

    #[cfg(test)]
    fn create_test_upload_config() -> UploadConfig {
        UploadConfig {
            aws_credentials: create_test_credentials(),
            bucket_name: "test-bucket".to_string(),
            max_concurrent_uploads: 8,
            chunk_size_mb: 10,
            retry_attempts: 10,
            timeout_seconds: 1800,
            auto_create_metadata: true,
            s3_key_prefix: Some("uploads".to_string()),
            max_concurrent_parts: 8,
            adaptive_chunk_size: true,
            min_chunk_size_mb: 5,
            max_chunk_size_mb: 100,
            bandwidth_limit_mbps: None,
            enable_resume: true,
            tier: UploadTier::Premium,
        }
    }

    #[cfg(test)]
    fn create_test_s3_key_config() -> S3KeyConfig {
        S3KeyConfig {
            prefix: Some("test".to_string()),
            use_date_folder: true,
            preserve_directory_structure: false,
            custom_naming_pattern: None,
        }
    }

    #[test]
    fn test_upload_queue_creation() {
        let queue = UploadQueue::new();
        assert_eq!(queue.items.len(), 0);
        assert_eq!(queue.active_uploads.len(), 0);
        assert!(!queue.is_processing);
        assert_eq!(queue.total_uploaded_bytes, 0);
        assert_eq!(queue.total_files_uploaded, 0);
    }

    #[test]
    fn test_s3_key_generation_simple() {
        let config = S3KeyConfig {
            prefix: Some("uploads".to_string()),
            use_date_folder: false,
            preserve_directory_structure: false,
            custom_naming_pattern: None,
        };

        let result = generate_s3_key("/path/to/test.mp4", &config).unwrap();
        assert_eq!(result, "uploads/test.mp4");
    }

    #[test]
    fn test_s3_key_generation_with_date() {
        let config = S3KeyConfig {
            prefix: Some("media".to_string()),
            use_date_folder: true,
            preserve_directory_structure: false,
            custom_naming_pattern: None,
        };

        let result = generate_s3_key("/path/to/video.mov", &config).unwrap();
        assert!(result.starts_with("media/"));
        assert!(result.contains("/video.mov"));
        // 日付フォルダが含まれているかチェック（YYYY/MM/DD形式）
        let parts: Vec<&str> = result.split('/').collect();
        assert!(parts.len() >= 4); // media/YYYY/MM/DD/video.mov
    }

    #[test]
    fn test_s3_key_generation_custom_pattern() {
        let config = S3KeyConfig {
            prefix: None,
            use_date_folder: false,
            preserve_directory_structure: false,
            custom_naming_pattern: Some("{timestamp}_{filename}".to_string()),
        };

        let result = generate_s3_key("/path/to/test.mp4", &config).unwrap();
        assert!(result.contains("_test.mp4"));
        assert!(result.len() > "test.mp4".len()); // タイムスタンプが追加されている
    }

    #[tokio::test]
    async fn test_upload_queue_initialization() {
        let queue = Arc::new(Mutex::new(UploadQueue::new()));
        let config = create_test_upload_config();

        // 初期化テスト（実際のAWS接続は行わない）
        {
            let mut q = queue.lock().unwrap();
            q.config = Some(config.clone());
        }

        let q = queue.lock().unwrap();
        assert!(q.config.is_some());
        assert_eq!(q.config.as_ref().unwrap().bucket_name, "test-bucket");
    }

    #[tokio::test]
    async fn test_file_addition_to_queue() {
        let temp_dir = tempdir().unwrap();
        let file_path = temp_dir.path().join("test_video.mp4");
        
        // テスト用ファイルを作成
        {
            let mut file = File::create(&file_path).unwrap();
            file.write_all(b"test video content").unwrap();
        }

        let queue = Arc::new(Mutex::new(UploadQueue::new()));
        let s3_key_config = create_test_s3_key_config();

        // ファイルをキューに追加（モック）
        let file_path_str = file_path.to_string_lossy().to_string();
        let s3_key = generate_s3_key(&file_path_str, &s3_key_config).unwrap();

        let item = UploadItem {
            id: Uuid::new_v4().to_string(),
            file_path: file_path_str.clone(),
            file_name: "test_video.mp4".to_string(),
            file_size: 18, // "test video content".len()
            s3_key,
            status: UploadStatus::Pending,
            progress: 0.0,
            uploaded_bytes: 0,
            speed_mbps: 0.0,
            eta_seconds: None,
            created_at: chrono::Utc::now().to_rfc3339(),
            started_at: None,
            completed_at: None,
            error_message: None,
            retry_count: 0,
        };

        {
            let mut q = queue.lock().unwrap();
            q.items.push(item);
        }

        let q = queue.lock().unwrap();
        assert_eq!(q.items.len(), 1);
        assert_eq!(q.items[0].file_name, "test_video.mp4");
        assert_eq!(q.items[0].status, UploadStatus::Pending);
        assert!(q.items[0].s3_key.contains("test_video.mp4"));
    }

    #[test]
    fn test_upload_statistics_calculation() {
        let mut queue = UploadQueue::new();

        // テストアイテムを追加
        for i in 0..5 {
            let item = UploadItem {
                id: format!("item_{}", i),
                file_path: format!("/test/file_{}.mp4", i),
                file_name: format!("file_{}.mp4", i),
                file_size: 1000,
                s3_key: format!("uploads/file_{}.mp4", i),
                status: if i < 2 { UploadStatus::Completed } else if i < 4 { UploadStatus::Pending } else { UploadStatus::Failed },
                progress: if i < 2 { 100.0 } else { 0.0 },
                uploaded_bytes: if i < 2 { 1000 } else { 0 },
                speed_mbps: 0.0,
                eta_seconds: None,
                created_at: chrono::Utc::now().to_rfc3339(),
                started_at: None,
                completed_at: None,
                error_message: None,
                retry_count: 0,
            };
            queue.items.push(item);
        }

        let total_files = queue.items.len() as u64;
        let completed_files = queue.items.iter()
            .filter(|item| item.status == UploadStatus::Completed)
            .count() as u64;
        let failed_files = queue.items.iter()
            .filter(|item| item.status == UploadStatus::Failed)
            .count() as u64;
        let pending_files = queue.items.iter()
            .filter(|item| item.status == UploadStatus::Pending)
            .count() as u64;

        assert_eq!(total_files, 5);
        assert_eq!(completed_files, 2);
        assert_eq!(failed_files, 1);
        assert_eq!(pending_files, 2);
    }

    #[test]
    fn test_upload_item_status_transitions() {
        let mut item = UploadItem {
            id: "test_item".to_string(),
            file_path: "/test/file.mp4".to_string(),
            file_name: "file.mp4".to_string(),
            file_size: 1000,
            s3_key: "uploads/file.mp4".to_string(),
            status: UploadStatus::Pending,
            progress: 0.0,
            uploaded_bytes: 0,
            speed_mbps: 0.0,
            eta_seconds: None,
            created_at: chrono::Utc::now().to_rfc3339(),
            started_at: None,
            completed_at: None,
            error_message: None,
            retry_count: 0,
        };

        // Pending -> InProgress
        item.status = UploadStatus::InProgress;
        item.started_at = Some(chrono::Utc::now().to_rfc3339());
        assert_eq!(item.status, UploadStatus::InProgress);
        assert!(item.started_at.is_some());

        // InProgress -> Completed
        item.status = UploadStatus::Completed;
        item.progress = 100.0;
        item.uploaded_bytes = 1000;
        item.completed_at = Some(chrono::Utc::now().to_rfc3339());
        assert_eq!(item.status, UploadStatus::Completed);
        assert_eq!(item.progress, 100.0);
        assert_eq!(item.uploaded_bytes, 1000);
        assert!(item.completed_at.is_some());
    }

    #[test]
    fn test_upload_progress_calculation() {
        let uploaded_bytes = 500u64;
        let total_bytes = 1000u64;
        let percentage = (uploaded_bytes as f64 / total_bytes as f64) * 100.0;

        assert_eq!(percentage, 50.0);

        // 速度計算のテスト
        let elapsed_seconds = 10.0;
        let speed_mbps = (uploaded_bytes as f64 / (1024.0 * 1024.0)) / elapsed_seconds;
        assert!(speed_mbps > 0.0);

        // ETA計算のテスト
        if speed_mbps > 0.0 {
            let remaining_mb = (total_bytes - uploaded_bytes) as f64 / (1024.0 * 1024.0);
            let eta_seconds = (remaining_mb / speed_mbps) as u64;
            assert!(eta_seconds > 0);
        }
    }

    #[test]
    fn test_upload_config_validation() {
        let config = create_test_upload_config();
        
        assert!(!config.aws_credentials.access_key_id.is_empty());
        assert!(!config.aws_credentials.secret_access_key.is_empty());
        assert!(!config.aws_credentials.region.is_empty());
        assert!(!config.bucket_name.is_empty());
        assert!(config.max_concurrent_uploads > 0);
        assert!(config.chunk_size_mb > 0);
        assert!(config.retry_attempts > 0);
        assert!(config.timeout_seconds > 0);
    }

    #[test]
    fn test_s3_key_config_presets() {
        // Simple preset
        let simple = S3KeyConfig {
            prefix: Some("uploads".to_string()),
            use_date_folder: false,
            preserve_directory_structure: false,
            custom_naming_pattern: None,
        };
        let key = generate_s3_key("/test/file.mp4", &simple).unwrap();
        assert_eq!(key, "uploads/file.mp4");

        // Organized preset
        let organized = S3KeyConfig {
            prefix: Some("media".to_string()),
            use_date_folder: true,
            preserve_directory_structure: false,
            custom_naming_pattern: None,
        };
        let key = generate_s3_key("/test/file.mp4", &organized).unwrap();
        assert!(key.starts_with("media/"));
        assert!(key.ends_with("/file.mp4"));
    }
}