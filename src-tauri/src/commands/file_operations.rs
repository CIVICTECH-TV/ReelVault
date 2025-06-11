use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tauri::command;

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
}

/// ディレクトリ内のファイル一覧を取得
#[command]
pub async fn list_files(directory: String) -> Result<Vec<FileInfo>, String> {
    use std::fs;
    
    let path = PathBuf::from(&directory);
    
    if !path.exists() {
        return Err(format!("Directory does not exist: {}", directory));
    }
    
    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", directory));
    }
    
    let mut files = Vec::new();
    
    match fs::read_dir(&path) {
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
    
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }
    
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    let file_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();
    
    let extension = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string());
    
    let modified = metadata
        .modified()
        .map(|t| format!("{:?}", t))
        .unwrap_or_else(|_| "Unknown".to_string());
    
    Ok(FileInfo {
        name: file_name,
        path: file_path,
        size: metadata.len(),
        modified,
        is_directory: metadata.is_dir(),
        extension,
    })
}

/// ディレクトリ監視を開始（基本実装）
/// 注意: 実際のファイル監視はnotify crateを使用して後で実装予定
#[command]
pub async fn watch_directory(config: WatchConfig) -> Result<String, String> {
    // TODO: notify crateを使った実装に置き換える
    // 現在は設定の検証のみ実行
    
    let path = PathBuf::from(&config.path);
    
    if !path.exists() {
        return Err(format!("Watch directory does not exist: {}", config.path));
    }
    
    if !path.is_dir() {
        return Err(format!("Watch path is not a directory: {}", config.path));
    }
    
    // パターンの検証
    if config.file_patterns.is_empty() {
        return Err("File patterns cannot be empty".to_string());
    }
    
    // 将来の実装: notify crateでファイル監視を開始
    // let (tx, rx) = channel();
    // let mut watcher = RecommendedWatcher::new(tx, Duration::from_secs(1))?;
    // watcher.watch(&path, RecursiveMode::from(config.recursive))?;
    
    log::info!("File watching configured for: {}", config.path);
    log::info!("Recursive: {}", config.recursive);
    log::info!("Patterns: {:?}", config.file_patterns);
    
    Ok(format!(
        "Directory watching configured for: {} (patterns: {:?})", 
        config.path, 
        config.file_patterns
    ))
} 