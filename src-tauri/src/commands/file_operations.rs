use std::path::PathBuf;
use std::sync::mpsc::channel;
use std::time::Duration;
use serde::{Deserialize, Serialize};
use tauri::command;
use notify::{RecommendedWatcher, RecursiveMode, Watcher, Config};

/// ファイル情報を表す構造体
#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: String,
    pub is_directory: bool,
    pub extension: Option<String>,
}

/// ディレクトリ監視の設定
#[derive(Debug, Deserialize)]
pub struct WatchConfig {
    pub path: String,
    pub recursive: bool,
    pub file_patterns: Vec<String>, // 例: ["*.mp4", "*.mov", "*.avi"]
    pub max_file_size_mb: Option<u64>, // ファイルサイズ制限（MB）
}

/// セキュリティ検証用の定数
const MAX_FILE_SIZE_DEFAULT_MB: u64 = 10 * 1024; // デフォルト10GB
const ALLOWED_FILE_EXTENSIONS: &[&str] = &[
    "mp4", "mov", "avi", "mkv", "wmv", "flv", "webm",
    "m4v", "3gp", "f4v", "asf", "rm", "rmvb", "vob"
];

/// ファイルパスのセキュリティ検証
fn validate_file_path(path: &PathBuf) -> Result<PathBuf, String> {
    // パストラバーサル攻撃対策
    let canonical_path = path.canonicalize()
        .map_err(|e| format!("Failed to resolve path: {}", e))?;
    
    // ユーザーのホームディレクトリ外アクセス制限（macOS/Linux）
    if let Some(home_dir) = dirs::home_dir() {
        if !canonical_path.starts_with(&home_dir) {
            return Err(format!(
                "Access denied: Path outside user directory: {}", 
                canonical_path.display()
            ));
        }
    }
    
    Ok(canonical_path)
}

/// ファイルサイズ検証
fn validate_file_size(file_path: &PathBuf, max_size_mb: u64) -> Result<(), String> {
    if let Ok(metadata) = file_path.metadata() {
        let file_size_mb = metadata.len() / (1024 * 1024);
        if file_size_mb > max_size_mb {
            return Err(format!(
                "File too large: {} MB (max: {} MB)", 
                file_size_mb, 
                max_size_mb
            ));
        }
    }
    Ok(())
}

/// ディレクトリ内のファイル一覧を取得
#[command]
pub async fn list_files(directory: String) -> Result<Vec<FileInfo>, String> {
    use std::fs;
    
    let path = PathBuf::from(&directory);
    
    // セキュリティ検証
    let validated_path = validate_file_path(&path)?;
    
    let mut files = Vec::new();
    
    if !validated_path.is_dir() {
        return Err(format!("Path is not a directory: {}", validated_path.display()));
    }
    
    match fs::read_dir(&validated_path) {
        Ok(entries) => {
            for entry in entries {
                match entry {
                    Ok(entry) => {
                        let metadata = entry.metadata().map_err(|e| e.to_string())?;
                        let file_name = entry.file_name().to_string_lossy().to_string();
                        let file_path = entry.path().to_string_lossy().to_string();
                        
                        let extension = entry.path()
                            .extension()
                            .and_then(|s| s.to_str())
                            .map(|s| s.to_string());
                        
                        let modified = metadata
                            .modified()
                            .map(|t| format!("{:?}", t))
                            .unwrap_or_else(|_| "Unknown".to_string());
                        
                        files.push(FileInfo {
                            name: file_name,
                            path: file_path,
                            size: metadata.len(),
                            modified,
                            is_directory: metadata.is_dir(),
                            extension,
                        });
                    }
                    Err(e) => return Err(e.to_string()),
                }
            }
        }
        Err(e) => return Err(e.to_string()),
    }
    
    Ok(files)
}

/// 特定ファイルの詳細情報を取得
#[command]
pub async fn get_file_info(file_path: String) -> Result<FileInfo, String> {
    use std::fs;
    
    let path = PathBuf::from(&file_path);
    
    // セキュリティ検証
    let validated_path = validate_file_path(&path)?;
    
    let metadata = fs::metadata(&validated_path).map_err(|e| e.to_string())?;
    let file_name = validated_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();
    
    let extension = validated_path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string());
    
    let modified = metadata
        .modified()
        .map(|t| format!("{:?}", t))
        .unwrap_or_else(|_| "Unknown".to_string());
    
    Ok(FileInfo {
        name: file_name,
        path: validated_path.to_string_lossy().to_string(),
        size: metadata.len(),
        modified,
        is_directory: metadata.is_dir(),
        extension,
    })
}

/// ディレクトリ監視を開始（notify crate実装版）
#[command]
pub async fn watch_directory(config: WatchConfig) -> Result<String, String> {
    let path = PathBuf::from(&config.path);
    
    // セキュリティ検証
    let canonical_path = validate_file_path(&path)?;
    
    if !canonical_path.is_dir() {
        return Err(format!("Watch path is not a directory: {}", canonical_path.display()));
    }
    
    // パターンの検証
    if config.file_patterns.is_empty() {
        return Err("File patterns cannot be empty".to_string());
    }
    
    // 実際のファイル監視実装
    let (tx, rx) = channel();
    
    let notify_config = Config::default()
        .with_poll_interval(Duration::from_secs(1));
        
    let mut watcher = RecommendedWatcher::new(tx, notify_config)
        .map_err(|e| format!("Failed to create watcher: {}", e))?;
    
    let recursive_mode = if config.recursive {
        RecursiveMode::Recursive
    } else {
        RecursiveMode::NonRecursive
    };
    
    watcher.watch(&canonical_path, recursive_mode)
        .map_err(|e| format!("Failed to start watching: {}", e))?;
    
    log::info!("File watching started for: {}", canonical_path.display());
    log::info!("Recursive: {}", config.recursive);
    log::info!("Patterns: {:?}", config.file_patterns);
    
    // 監視開始の確認（実際の運用では別スレッドで処理）
    // 現在はセットアップ完了の確認のみ
    tokio::spawn(async move {
        // 監視イベント処理（今後の実装で拡張）
        for result in rx {
            match result {
                Ok(event) => {
                    log::debug!("File event: {:?}", event);
                    // ここで実際のファイル処理ロジックを呼び出す
                    // Epic2の他のタスク（#4, #31等）で実装予定
                }
                Err(error) => {
                    log::error!("Watch error: {:?}", error);
                }
            }
        }
    });
    
    Ok(format!(
        "Directory watching started for: {} (patterns: {:?}, recursive: {})", 
        canonical_path.display(),
        config.file_patterns,
        config.recursive
    ))
} 