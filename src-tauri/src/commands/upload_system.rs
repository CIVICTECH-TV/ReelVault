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
        }
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
        .map_err(|e| format!("Failed to lock upload queue: {}", e))?;
    
    queue.config = Some(config.clone());
    
    log::info!("Upload queue initialized with bucket: {}", config.bucket_name);
    Ok("Upload queue initialized successfully".to_string())
}

/// ファイル選択ダイアログを開く
#[command]
pub async fn open_file_dialog(
    multiple: bool,
    _file_types: Option<Vec<String>>,
) -> Result<FileSelection, String> {
    // TODO: Tauri v2のファイルダイアログAPIに更新
    
    // TODO: Tauri v2のファイルダイアログAPIに更新
    // 現在はモック実装
    let selected_files = if multiple {
        vec![
            "/Users/test/video1.mp4".to_string(),
            "/Users/test/video2.mov".to_string(),
        ]
    } else {
        vec!["/Users/test/video1.mp4".to_string()]
    };
    
    let mut total_size = 0u64;
    for file_path in &selected_files {
        if let Ok(metadata) = std::fs::metadata(file_path) {
            total_size += metadata.len();
        }
    }
    
    Ok(FileSelection {
        file_count: selected_files.len() as u32,
        total_size,
        selected_files,
    })
}

/// ファイルをアップロードキューに追加
#[command]
pub async fn add_files_to_upload_queue(
    file_paths: Vec<String>,
    s3_key_config: S3KeyConfig,
    queue_state: State<'_, UploadQueueState>,
) -> Result<Vec<String>, String> {
    let mut queue = queue_state.lock()
        .map_err(|e| format!("Failed to lock upload queue: {}", e))?;
    
    let mut added_ids = Vec::new();
    
    for file_path in file_paths {
        let path = Path::new(&file_path);
        
        // ファイル存在確認
        if !path.exists() {
            log::warn!("File does not exist: {}", file_path);
            continue;
        }
        
        let metadata = std::fs::metadata(&path)
            .map_err(|e| format!("Failed to get file metadata for {}: {}", file_path, e))?;
        
        let file_name = path.file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();
        
        let s3_key = generate_s3_key(&file_path, &s3_key_config)?;
        
        let item = UploadItem {
            id: Uuid::new_v4().to_string(),
            file_path: file_path.clone(),
            file_name,
            file_size: metadata.len(),
            s3_key: s3_key.clone(),
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
        
        added_ids.push(item.id.clone());
        queue.items.push(item);
        
        log::info!("Added file to upload queue: {} -> {}", file_path, s3_key);
    }
    
    Ok(added_ids)
}

/// アップロードキューからアイテムを削除
#[command]
pub async fn remove_upload_item(
    item_id: String,
    queue_state: State<'_, UploadQueueState>,
) -> Result<String, String> {
    let mut queue = queue_state.lock()
        .map_err(|e| format!("Failed to lock upload queue: {}", e))?;
    
    // アクティブなアップロードの場合はキャンセル
    if let Some(progress) = queue.active_uploads.get(&item_id) {
        if progress.status == UploadStatus::InProgress {
            // TODO: 実際のアップロードキャンセル処理
            log::info!("Cancelling active upload: {}", item_id);
        }
    }
    
    queue.active_uploads.remove(&item_id);
    
    let initial_len = queue.items.len();
    queue.items.retain(|item| item.id != item_id);
    
    if queue.items.len() == initial_len {
        return Err(format!("Upload item not found: {}", item_id));
    }
    
    log::info!("Removed item from upload queue: {}", item_id);
    Ok("Item removed from upload queue".to_string())
}

/// アップロード処理を開始
#[command]
pub async fn start_upload_processing(
    app_handle: AppHandle,
    queue_state: State<'_, UploadQueueState>,
) -> Result<String, String> {
    let mut queue = queue_state.lock()
        .map_err(|e| format!("Failed to lock upload queue: {}", e))?;
    
    if queue.is_processing {
        return Ok("Upload processing is already running".to_string());
    }
    
    let config = queue.config.clone()
        .ok_or("Upload queue not initialized")?;
    
    queue.is_processing = true;
    drop(queue); // ロックを解放
    
    // バックグラウンドでアップロード処理を開始
    let queue_clone = Arc::clone(&queue_state.inner());
    let app_handle_clone = app_handle.clone();
    
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async move {
            if let Err(e) = process_upload_queue(queue_clone, app_handle_clone, config).await {
                log::error!("Upload processing failed: {}", e);
            }
        });
    });
    
    log::info!("Upload processing started");
    Ok("Upload processing started".to_string())
}

/// アップロード処理を停止
#[command]
pub async fn stop_upload_processing(
    queue_state: State<'_, UploadQueueState>,
) -> Result<String, String> {
    let mut queue = queue_state.lock()
        .map_err(|e| format!("Failed to lock upload queue: {}", e))?;
    
    queue.is_processing = false;
    
    // アクティブなアップロードを一時停止
    for (_, progress) in queue.active_uploads.iter_mut() {
        if progress.status == UploadStatus::InProgress {
            progress.status = UploadStatus::Paused;
        }
    }
    
    log::info!("Upload processing stopped");
    Ok("Upload processing stopped".to_string())
}

/// アップロードキューの状態を取得
#[command]
pub async fn get_upload_queue_status(
    queue_state: State<'_, UploadQueueState>,
) -> Result<UploadStatistics, String> {
    let queue = queue_state.lock()
        .map_err(|e| format!("Failed to lock upload queue: {}", e))?;
    
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
    
    let average_speed_mbps = if !queue.active_uploads.is_empty() {
        queue.active_uploads.values()
            .map(|p| p.speed_mbps)
            .sum::<f64>() / queue.active_uploads.len() as f64
    } else {
        0.0
    };
    
    let estimated_time_remaining = if average_speed_mbps > 0.0 {
        let remaining_bytes = total_bytes - uploaded_bytes;
        let remaining_mb = remaining_bytes as f64 / (1024.0 * 1024.0);
        Some((remaining_mb / average_speed_mbps) as u64)
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
        average_speed_mbps,
        estimated_time_remaining,
    })
}

/// アップロードキューの全アイテムを取得
#[command]
pub async fn get_upload_queue_items(
    queue_state: State<'_, UploadQueueState>,
) -> Result<Vec<UploadItem>, String> {
    let queue = queue_state.lock()
        .map_err(|e| format!("Failed to lock upload queue: {}", e))?;
    
    Ok(queue.items.clone())
}

/// 特定のアイテムのアップロードを再試行
#[command]
pub async fn retry_upload_item(
    item_id: String,
    queue_state: State<'_, UploadQueueState>,
) -> Result<String, String> {
    let mut queue = queue_state.lock()
        .map_err(|e| format!("Failed to lock upload queue: {}", e))?;
    
    if let Some(item) = queue.items.iter_mut().find(|i| i.id == item_id) {
        if item.status == UploadStatus::Failed {
            item.status = UploadStatus::Pending;
            item.progress = 0.0;
            item.uploaded_bytes = 0;
            item.error_message = None;
            item.retry_count += 1;
            
            log::info!("Retry scheduled for upload item: {}", item_id);
            Ok("Upload retry scheduled".to_string())
        } else {
            Err(format!("Item {} is not in failed state", item_id))
        }
    } else {
        Err(format!("Upload item not found: {}", item_id))
    }
}

/// S3キーを生成する
fn generate_s3_key(file_path: &str, config: &S3KeyConfig) -> Result<String, String> {
    let path = Path::new(file_path);
    let file_name = path.file_name()
        .and_then(|s| s.to_str())
        .ok_or("Invalid file name")?;
    
    let mut key_parts = Vec::new();
    
    // プレフィックスを追加
    if let Some(prefix) = &config.prefix {
        key_parts.push(prefix.clone());
    }
    
    // 日付フォルダを追加
    if config.use_date_folder {
        let now = chrono::Utc::now();
        key_parts.push(now.format("%Y/%m/%d").to_string());
    }
    
    // ディレクトリ構造を保持
            if config.preserve_directory_structure {
            if let Some(parent) = path.parent() {
                if let Some(_parent_str) = parent.to_str() {
                // ホームディレクトリ以下の相対パスを使用
                if let Some(home_dir) = dirs::home_dir() {
                    if let Ok(relative) = path.strip_prefix(&home_dir) {
                        if let Some(parent) = relative.parent() {
                                                         if let Some(parent_str) = parent.to_str() {
                                 key_parts.push(parent_str.to_string());
                            }
                        }
                    }
                }
            }
        }
    }
    
    // カスタム命名パターン
    let final_name = if let Some(pattern) = &config.custom_naming_pattern {
        // 簡単なパターン置換（拡張可能）
        pattern
            .replace("{filename}", file_name)
            .replace("{timestamp}", &chrono::Utc::now().timestamp().to_string())
            .replace("{uuid}", &Uuid::new_v4().to_string())
    } else {
        file_name.to_string()
    };
    
    key_parts.push(final_name);
    
    Ok(key_parts.join("/"))
}

/// バックグラウンドでアップロードキューを処理
async fn process_upload_queue(
    queue_state: UploadQueueState,
    app_handle: AppHandle,
    config: UploadConfig,
) -> Result<(), String> {
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
        
        // 待機中のアイテムを取得
        let pending_items = {
            let mut queue = queue_state.lock()
                .map_err(|e| format!("Failed to lock queue: {}", e))?;
            
            let active_count = queue.active_uploads.len();
            if active_count >= max_concurrent {
                drop(queue);
                sleep(Duration::from_millis(1000)).await;
                continue;
            }
            
            let available_slots = max_concurrent - active_count;
            let mut pending = Vec::new();
            
            for item in queue.items.iter_mut() {
                if item.status == UploadStatus::Pending && pending.len() < available_slots {
                    item.status = UploadStatus::InProgress;
                    item.started_at = Some(chrono::Utc::now().to_rfc3339());
                    pending.push(item.clone());
                }
            }
            
            pending
        };
        
        // 新しいアップロードタスクを開始
        for item in pending_items {
            let tx_clone = tx.clone();
            let config_clone = config.clone();
            let queue_clone = Arc::clone(&queue_state);
            let app_handle_clone = app_handle.clone();
            
            tokio::spawn(async move {
                let result = upload_single_file(
                    item.clone(),
                    config_clone,
                    tx_clone,
                    app_handle_clone,
                ).await;
                
                // 結果をキューに反映
                if let Ok(mut queue) = queue_clone.lock() {
                    if let Some(queue_item) = queue.items.iter_mut().find(|i| i.id == item.id) {
                        match result {
                            Ok(_) => {
                                queue_item.status = UploadStatus::Completed;
                                queue_item.progress = 100.0;
                                queue_item.completed_at = Some(chrono::Utc::now().to_rfc3339());
                                let file_size = queue_item.file_size;
                                queue.total_files_uploaded += 1;
                                queue.total_uploaded_bytes += file_size;
                            }
                            Err(e) => {
                                queue_item.status = UploadStatus::Failed;
                                queue_item.error_message = Some(e);
                            }
                        }
                    }
                    queue.active_uploads.remove(&item.id);
                }
            });
        }
        
        // 進捗更新を処理
        while let Ok(progress) = rx.try_recv() {
            {
                let mut queue = queue_state.lock()
                    .map_err(|e| format!("Failed to lock queue: {}", e))?;
                queue.active_uploads.insert(progress.item_id.clone(), progress.clone());
                
                // キューアイテムの進捗も更新
                if let Some(item) = queue.items.iter_mut().find(|i| i.id == progress.item_id) {
                    item.progress = progress.percentage;
                    item.uploaded_bytes = progress.uploaded_bytes;
                    item.speed_mbps = progress.speed_mbps;
                    item.eta_seconds = progress.eta_seconds;
                }
            }
            
            // フロントエンドに進捗を通知
            if let Err(e) = app_handle.emit("upload-progress", &progress) {
                log::warn!("Failed to emit upload progress: {}", e);
            }
        }
        
        sleep(Duration::from_millis(500)).await;
    }
    
    Ok(())
}

/// 単一ファイルのアップロード処理
async fn upload_single_file(
    item: UploadItem,
    config: UploadConfig,
    progress_tx: mpsc::Sender<UploadProgress>,
    _app_handle: AppHandle,
) -> Result<(), String> {
    use aws_config::{BehaviorVersion, Region};
    use aws_sdk_s3::Client as S3Client;
    use aws_credential_types::Credentials;
    
    log::info!("Starting upload: {} -> {}", item.file_path, item.s3_key);
    
    // AWS設定
    let region = Region::new(config.aws_credentials.region.clone());
    let mut config_builder = aws_config::defaults(BehaviorVersion::latest())
        .region(region);
    
    let creds = Credentials::new(
        &config.aws_credentials.access_key_id,
        &config.aws_credentials.secret_access_key,
        config.aws_credentials.session_token.clone(),
        None,
        "upload_system",
    );
    
    config_builder = config_builder.credentials_provider(creds);
    let aws_config = config_builder.load().await;
    let s3_client = S3Client::new(&aws_config);
    
    // ファイル読み込み
    let file_path = Path::new(&item.file_path);
    let file_size = item.file_size;
    
    // 進捗追跡用
    let start_time = Instant::now();
    let mut uploaded_bytes = 0u64;
    
    // チャンクサイズ（MB -> バイト）
    let chunk_size = (config.chunk_size_mb * 1024 * 1024) as usize;
    
    // マルチパートアップロードの開始
    let multipart_upload = s3_client
        .create_multipart_upload()
        .bucket(&config.bucket_name)
        .key(&item.s3_key)
        .send()
        .await
        .map_err(|e| format!("Failed to create multipart upload: {}", e))?;
    
    let upload_id = multipart_upload.upload_id()
        .ok_or("No upload ID returned")?;
    
    // ファイルを読み込んでチャンクごとにアップロード
    use std::fs::File;
    use std::io::{Read, BufReader};
    
    let file = File::open(file_path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    let mut reader = BufReader::new(file);
    let mut buffer = vec![0u8; chunk_size];
    let mut part_number = 1;
    let mut completed_parts = Vec::new();
    
    loop {
        let bytes_read = reader.read(&mut buffer)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        
        if bytes_read == 0 {
            break; // EOF
        }
        
        // パートをアップロード
        let part_data = &buffer[..bytes_read];
        let upload_part_result = s3_client
            .upload_part()
            .bucket(&config.bucket_name)
            .key(&item.s3_key)
            .upload_id(upload_id)
            .part_number(part_number)
            .body(part_data.to_vec().into())
            .send()
            .await
            .map_err(|e| format!("Failed to upload part {}: {}", part_number, e))?;
        
        if let Some(etag) = upload_part_result.e_tag() {
            completed_parts.push(
                aws_sdk_s3::types::CompletedPart::builder()
                    .part_number(part_number)
                    .e_tag(etag)
                    .build()
            );
        }
        
        uploaded_bytes += bytes_read as u64;
        part_number += 1;
        
        // 進捗を計算して送信
        let percentage = (uploaded_bytes as f64 / file_size as f64) * 100.0;
        let elapsed = start_time.elapsed().as_secs_f64();
        let speed_mbps = if elapsed > 0.0 {
            (uploaded_bytes as f64 / (1024.0 * 1024.0)) / elapsed
        } else {
            0.0
        };
        
        let eta_seconds = if speed_mbps > 0.0 {
            let remaining_mb = (file_size - uploaded_bytes) as f64 / (1024.0 * 1024.0);
            Some((remaining_mb / speed_mbps) as u64)
        } else {
            None
        };
        
        let progress = UploadProgress {
            item_id: item.id.clone(),
            uploaded_bytes,
            total_bytes: file_size,
            percentage,
            speed_mbps,
            eta_seconds,
            status: UploadStatus::InProgress,
        };
        
        if let Err(e) = progress_tx.send(progress).await {
            log::warn!("Failed to send progress update: {}", e);
        }
        
        // 小さな遅延を入れてCPU使用率を抑制
        sleep(Duration::from_millis(10)).await;
    }
    
    // マルチパートアップロードを完了
    let completed_multipart_upload = aws_sdk_s3::types::CompletedMultipartUpload::builder()
        .set_parts(Some(completed_parts))
        .build();
    
    s3_client
        .complete_multipart_upload()
        .bucket(&config.bucket_name)
        .key(&item.s3_key)
        .upload_id(upload_id)
        .multipart_upload(completed_multipart_upload)
        .send()
        .await
        .map_err(|e| format!("Failed to complete multipart upload: {}", e))?;
    
    // メタデータ作成（オプション）
    if config.auto_create_metadata {
        use std::collections::HashMap;
        let tags = vec!["upload".to_string()];
        let custom_fields = HashMap::new();
        if let Err(e) = create_file_metadata(item.file_path.clone(), tags, custom_fields).await {
            log::warn!("Failed to create metadata for {}: {}", item.file_path, e);
        }
    }
    
    log::info!("Upload completed: {} -> s3://{}/{}", 
               item.file_path, config.bucket_name, item.s3_key);
    
    Ok(())
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

    fn create_test_credentials() -> AwsCredentials {
        AwsCredentials {
            access_key_id: "test_access_key".to_string(),
            secret_access_key: "test_secret_key".to_string(),
            region: "ap-northeast-1".to_string(),
            session_token: None,
        }
    }

    fn create_test_upload_config() -> UploadConfig {
        UploadConfig {
            aws_credentials: create_test_credentials(),
            bucket_name: "test-bucket".to_string(),
            max_concurrent_uploads: 2,
            chunk_size_mb: 5,
            retry_attempts: 3,
            timeout_seconds: 300,
            auto_create_metadata: true,
            s3_key_prefix: Some("test".to_string()),
        }
    }

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
            s3_key: s3_key.clone(),
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