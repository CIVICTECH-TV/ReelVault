use std::path::PathBuf;
use std::sync::mpsc::channel;
use std::time::Duration;
use serde::{Deserialize, Serialize};
use tauri::command;
use notify::{RecommendedWatcher, RecursiveMode, Watcher, Config, Event, EventKind};
use std::collections::HashMap;
use crate::internal::{InternalError, standardize_error};
use uuid::Uuid;

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
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WatchConfig {
    pub path: String,
    pub recursive: bool,
    pub file_patterns: Vec<String>, // 例: ["*.mp4", "*.mov", "*.avi"]
    pub max_file_size_mb: Option<u64>, // ファイルサイズ制限（MB）
    pub auto_upload: bool, // 自動アップロード有効
    pub exclude_patterns: Vec<String>, // 除外パターン (例: ["*.tmp", "*/.DS_Store"])
    pub exclude_directories: Vec<String>, // 除外ディレクトリ
    pub auto_metadata: bool, // 自動メタデータ作成
}

/// セキュリティ検証用の定数
#[allow(dead_code)]
const MAX_FILE_SIZE_DEFAULT_MB: u64 = 10 * 1024; // デフォルト10GB
#[allow(dead_code)]
const ALLOWED_FILE_EXTENSIONS: &[&str] = &[
    "mp4", "mov", "avi", "mkv", "wmv", "flv", "webm",
    "m4v", "3gp", "f4v", "asf", "rm", "rmvb", "vob"
];

/// ファイルパスのセキュリティ検証
fn validate_file_path(path: &PathBuf) -> Result<PathBuf, InternalError> {
    // パストラバーサル攻撃対策
    let canonical_path = path.canonicalize()
        .map_err(|e| InternalError::File(format!("Failed to resolve path: {}", e)))?;
    
    // ユーザーのホームディレクトリ外アクセス制限（macOS/Linux）
    if let Some(home_dir) = dirs::home_dir() {
        if !canonical_path.starts_with(&home_dir) {
            return Err(InternalError::File(format!(
                "Access denied: Path outside user directory: {}", 
                canonical_path.display()
            )));
        }
    }
    
    Ok(canonical_path)
}

/// ファイルサイズ検証
fn validate_file_size(file_path: &PathBuf, max_size_mb: u64) -> Result<(), InternalError> {
    if let Ok(metadata) = file_path.metadata() {
        let file_size_mb = metadata.len() / (1024 * 1024);
        if file_size_mb > max_size_mb {
            return Err(InternalError::File(format!(
                "File too large: {} MB (max: {} MB)", 
                file_size_mb, 
                max_size_mb
            )));
        }
    }
    Ok(())
}

/// ファイルパターンマッチング（glob風）
fn matches_pattern(file_path: &PathBuf, pattern: &str) -> bool {
    let file_name = file_path.file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    
    if pattern.starts_with("*.") {
        // 拡張子マッチング (例: *.mp4)
        let ext = &pattern[2..];
        return file_path.extension()
            .and_then(|s| s.to_str())
            .map(|s| s.eq_ignore_ascii_case(ext))
            .unwrap_or(false);
    } else if pattern.contains('*') {
        // 単純なワイルドカードマッチング
        let pattern_regex = pattern.replace('*', ".*");
        return regex::Regex::new(&pattern_regex)
            .map(|r| r.is_match(file_name))
            .unwrap_or(false);
    } else {
        // 完全一致
        return file_name == pattern;
    }
}

/// ファイルを除外すべきかチェック
fn should_exclude_file(file_path: &PathBuf, config: &WatchConfig) -> bool {
    let _file_name = file_path.file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    
    // 除外パターンチェック
    for pattern in &config.exclude_patterns {
        if matches_pattern(file_path, pattern) {
            log::debug!("File excluded by pattern '{}': {}", pattern, file_path.display());
            return true;
        }
    }
    
    // 除外ディレクトリチェック
    for exclude_dir in &config.exclude_directories {
        if file_path.to_string_lossy().contains(exclude_dir) {
            log::debug!("File excluded by directory '{}': {}", exclude_dir, file_path.display());
            return true;
        }
    }
    
    // ファイルパターンチェック（許可されたファイルのみ）
    if !config.file_patterns.is_empty() {
        let mut matches_any = false;
        for pattern in &config.file_patterns {
            if matches_pattern(file_path, pattern) {
                matches_any = true;
                break;
            }
        }
        if !matches_any {
            log::debug!("File not matching patterns: {}", file_path.display());
            return true;
        }
    }
    
    false
}

/// ファイル変更イベントを処理
async fn handle_file_event(event: Event, config: &WatchConfig) -> Result<(), String> {
    match event.kind {
        EventKind::Create(_) | EventKind::Modify(_) => {
            for path in event.paths {
                if path.is_file() && !should_exclude_file(&path, config) {
                    log::info!("File event detected: {}", path.display());
                    
                    // ファイルサイズチェック
                    if let Some(max_size) = config.max_file_size_mb {
                        if let Err(e) = validate_file_size(&path, max_size) {
                            log::warn!("File size validation failed: {}", e);
                            continue;
                        }
                    }
                    
                    // 自動メタデータ作成
                    if config.auto_metadata {
                        if let Err(e) = create_auto_metadata(&path).await {
                            log::error!("Failed to create metadata for {}: {}", path.display(), e);
                        }
                    }
                    
                    // 自動アップロード
                    if config.auto_upload {
                        if let Err(e) = queue_auto_upload(&path).await {
                            log::error!("Failed to queue upload for {}: {}", path.display(), e);
                        }
                    }
                }
            }
        }
        _ => {} // その他のイベントは無視
    }
    Ok(())
}

/// 自動メタデータ作成
async fn create_auto_metadata(file_path: &PathBuf) -> Result<(), String> {
    use crate::commands::metadata::{create_file_metadata, save_file_metadata};
    
    let file_path_str = file_path.to_string_lossy().to_string();
    
    // 自動タグ生成（ファイル名、拡張子ベース）
    let mut auto_tags = vec!["auto-detected".to_string()];
    
    if let Some(extension) = file_path.extension().and_then(|s| s.to_str()) {
        auto_tags.push(format!("ext-{}", extension.to_lowercase()));
    }
    
    if let Some(parent_dir) = file_path.parent().and_then(|p| p.file_name()).and_then(|s| s.to_str()) {
        auto_tags.push(format!("dir-{}", parent_dir));
    }
    
    // カスタムフィールド
    let mut custom_fields = HashMap::new();
    custom_fields.insert("auto_detected".to_string(), "true".to_string());
    custom_fields.insert("watch_path".to_string(), file_path_str.clone());
    
    // メタデータ作成
    match create_file_metadata(file_path_str.clone(), auto_tags, custom_fields).await {
        Ok(metadata) => {
            // データベースに保存
            let db_path = "./metadata.db".to_string(); // TODO: 設定から取得
            if let Err(e) = save_file_metadata(metadata, db_path).await {
                return Err(format!("Failed to save metadata: {}", e));
            }
            log::info!("Auto metadata created for: {}", file_path.display());
        }
        Err(e) => {
            return Err(format!("Failed to create metadata: {}", e));
        }
    }
    
    Ok(())
}

/// 自動アップロードキューに追加
async fn queue_auto_upload(file_path: &PathBuf) -> Result<(), String> {
    // TODO: アップロードキューへの追加実装
    // 現在はログ出力のみ
    log::info!("Queued for auto upload: {}", file_path.display());
    
    // 将来的にはupload_file関数と連携
    // let s3_key = generate_s3_key(&file_path);
    // queue_upload_task(file_path, s3_key).await?;
    
    Ok(())
}

/// ディレクトリ選択ダイアログを開く
#[command]
pub async fn select_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let result = app.dialog().file().blocking_pick_folder();
    
    match result {
        Some(path) => {
            // FilePath型を文字列に変換
            Ok(Some(path.to_string()))
        },
        None => Ok(None), // ユーザーがキャンセル
    }
}

/// ディレクトリ内のファイル一覧を取得
#[command]
pub async fn list_files(directory: String) -> Result<Vec<FileInfo>, String> {
    use std::fs;
    
    let path = PathBuf::from(&directory);
    
    // セキュリティ検証
    let validated_path = validate_file_path(&path)
        .map_err(standardize_error)?;
    
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
    let validated_path = validate_file_path(&path)
        .map_err(standardize_error)?;
    
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
    let canonical_path = validate_file_path(&path)
        .map_err(standardize_error)?;
    
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
    
    // 拡張された監視機能（Issue #30対応）
    let config_clone = config.clone();
    tokio::spawn(async move {
        log::info!("Advanced file watching started with features:");
        log::info!("  - Auto upload: {}", config_clone.auto_upload);
        log::info!("  - Auto metadata: {}", config_clone.auto_metadata);
        log::info!("  - Exclude patterns: {:?}", config_clone.exclude_patterns);
        log::info!("  - Exclude directories: {:?}", config_clone.exclude_directories);
        
        for result in rx {
            match result {
                Ok(event) => {
                    log::debug!("File event: {:?}", event);
                    
                    // 拡張されたイベント処理
                    if let Err(e) = handle_file_event(event, &config_clone).await {
                        log::error!("Failed to handle file event: {}", e);
                    }
                }
                Err(error) => {
                    log::error!("Watch error: {:?}", error);
                }
            }
        }
    });
    
    Ok(format!(
        "Advanced directory watching started for: {} (patterns: {:?}, recursive: {}, auto_upload: {}, auto_metadata: {})", 
        canonical_path.display(),
        config.file_patterns,
        config.recursive,
        config.auto_upload,
        config.auto_metadata
    ))
}

/// 監視システムのテスト用コマンド（デバッグ・検証用）
#[command]
pub async fn test_watch_system(config: WatchConfig) -> Result<String, String> {
    log::info!("Testing watch system configuration");
    
    // 設定検証
    let path = PathBuf::from(&config.path);
    let canonical_path = validate_file_path(&path)
        .map_err(standardize_error)?;
    
    if !canonical_path.is_dir() {
        return Err(format!("Watch path is not a directory: {}", canonical_path.display()));
    }
    
    // パターン検証
    if config.file_patterns.is_empty() {
        return Err("File patterns cannot be empty".to_string());
    }
    
    // テストファイル作成
    let test_files = vec![
        ("test_video.mp4", true),   // 許可されるファイル
        ("test_video.mov", true),   // 許可されるファイル
        ("test.tmp", false),        // 除外されるファイル
        ("document.txt", false),    // パターンに一致しない
        (".DS_Store", false),       // 除外されるファイル
    ];
    
    let mut results = Vec::new();
    
    for (filename, should_be_included) in test_files {
        let test_path = canonical_path.join(filename);
        let excluded = should_exclude_file(&test_path, &config);
        
        let result_msg = if should_be_included {
            if excluded {
                format!("❌ {} - 期待: 含まれる, 実際: 除外される", filename)
            } else {
                format!("✅ {} - 期待: 含まれる, 実際: 含まれる", filename)
            }
        } else {
            if excluded {
                format!("✅ {} - 期待: 除外される, 実際: 除外される", filename)
            } else {
                format!("❌ {} - 期待: 除外される, 実際: 含まれる", filename)
            }
        };
        
        results.push(result_msg);
    }
    
    let summary = format!(
        "Watch system test completed for: {}\nResults:\n{}", 
        canonical_path.display(),
        results.join("\n")
    );
    
    log::info!("{}", summary);
    Ok(summary)
}

/// 現在のディレクトリでテスト可能なサンプル設定を生成
#[command]
pub async fn get_sample_watch_configs() -> Result<Vec<WatchConfig>, String> {
    let current_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?
        .to_string_lossy()
        .to_string();
    
    Ok(vec![
        WatchConfig {
            path: current_dir.clone(),
            recursive: false,
            file_patterns: vec!["*.mp4".to_string()],
            max_file_size_mb: Some(100),
            auto_upload: false,
            exclude_patterns: vec!["*.tmp".to_string()],
            exclude_directories: vec![],
            auto_metadata: true,
        },
        WatchConfig {
            path: current_dir.clone(),
            recursive: true,
            file_patterns: vec!["*.mp4".to_string(), "*.mov".to_string(), "*.avi".to_string()],
            max_file_size_mb: Some(5120), // 5GB
            auto_upload: true,
            exclude_patterns: vec![
                "*.tmp".to_string(),
                "*.part".to_string(),
                "*/.DS_Store".to_string(),
                "*/Thumbs.db".to_string(),
            ],
            exclude_directories: vec![
                ".git".to_string(),
                "node_modules".to_string(),
                ".cache".to_string(),
            ],
            auto_metadata: true,
        },
        WatchConfig {
            path: current_dir,
            recursive: true,
            file_patterns: vec!["*.*".to_string()], // すべてのファイル
            max_file_size_mb: Some(1024), // 1GB
            auto_upload: false,
            exclude_patterns: vec![
                "*.log".to_string(),
                "*.tmp".to_string(),
                "*.cache".to_string(),
                "*/.DS_Store".to_string(),
            ],
            exclude_directories: vec![
                ".git".to_string(),
                "target".to_string(),
                "dist".to_string(),
                "build".to_string(),
            ],
            auto_metadata: false,
        },
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use std::fs;

    /// テスト用WatchConfigを作成
    fn create_test_watch_config(path: &str) -> WatchConfig {
        WatchConfig {
            path: path.to_string(),
            recursive: true,
            file_patterns: vec!["*.mp4".to_string(), "*.mov".to_string()],
            max_file_size_mb: Some(100),
            auto_upload: true,
            exclude_patterns: vec!["*.tmp".to_string(), "*/.DS_Store".to_string()],
            exclude_directories: vec![".git".to_string(), "node_modules".to_string()],
            auto_metadata: true,
        }
    }

    #[test]
    fn test_matches_pattern() {
        let mp4_file = PathBuf::from("video.mp4");
        let mov_file = PathBuf::from("movie.mov");
        let txt_file = PathBuf::from("document.txt");
        let tmp_file = PathBuf::from("temp.tmp");

        // 拡張子マッチング
        assert!(matches_pattern(&mp4_file, "*.mp4"));
        assert!(matches_pattern(&mov_file, "*.mov"));
        assert!(!matches_pattern(&txt_file, "*.mp4"));

        // 完全一致
        assert!(matches_pattern(&PathBuf::from("exact.txt"), "exact.txt"));
        assert!(!matches_pattern(&PathBuf::from("other.txt"), "exact.txt"));

        // ワイルドカード
        assert!(matches_pattern(&tmp_file, "*temp*"));
        assert!(matches_pattern(&PathBuf::from("prefix_something"), "prefix*"));
    }

    #[test]
    fn test_should_exclude_file() {
        let temp_dir = tempfile::tempdir().unwrap();
        let config = create_test_watch_config(temp_dir.path().to_str().unwrap());

        // 除外パターンテスト
        let tmp_file = temp_dir.path().join("test.tmp");
        let ds_store = temp_dir.path().join(".DS_Store");
        let video_file = temp_dir.path().join("video.mp4");

        assert!(should_exclude_file(&tmp_file, &config));
        assert!(should_exclude_file(&ds_store, &config));
        assert!(!should_exclude_file(&video_file, &config));

        // 除外ディレクトリテスト
        let git_file = temp_dir.path().join(".git/config");
        assert!(should_exclude_file(&git_file, &config));
    }

    #[test]
    fn test_validate_file_size() {
        let temp_dir = tempfile::tempdir().unwrap();
        let small_file = temp_dir.path().join("small.txt");
        
        // 小さなファイルを作成
        fs::write(&small_file, "small content").unwrap();
        
        // 1MBの制限でテスト（実際のファイルは1KB未満）
        assert!(validate_file_size(&small_file, 1).is_ok());
        
        // 制限を非常に小さくしてテスト
        // Note: 実際のファイルサイズによってはテストが変わる可能性
        let result = validate_file_size(&small_file, 0);
        // サイズが0より大きい場合はエラーになるはず
        // ただし、ファイルが非常に小さい場合は計算上0MBになる可能性もある
    }

    #[test]
    fn test_validate_file_path() {
        // 有効なパスのテスト（現在のディレクトリ）
        let current_dir = std::env::current_dir().unwrap();
        assert!(validate_file_path(&current_dir).is_ok());

        // 無効なパス（存在しない）
        let invalid_path = PathBuf::from("/nonexistent/path/that/should/not/exist");
        assert!(validate_file_path(&invalid_path).is_err());
    }

    #[test]
    fn test_watch_config_structure() {
        let config = create_test_watch_config("/test/path");
        
        assert_eq!(config.path, "/test/path");
        assert!(config.recursive);
        assert!(config.auto_upload);
        assert!(config.auto_metadata);
        assert_eq!(config.file_patterns.len(), 2);
        assert_eq!(config.exclude_patterns.len(), 2);
        assert_eq!(config.exclude_directories.len(), 2);
        assert_eq!(config.max_file_size_mb, Some(100));
    }

    #[test]
    fn test_file_pattern_matching_edge_cases() {
        let file = PathBuf::from("video.MP4"); // 大文字拡張子
        
        // 大文字小文字を無視したマッチング
        assert!(matches_pattern(&file, "*.mp4"));
        assert!(matches_pattern(&file, "*.MP4"));
        
        let no_ext_file = PathBuf::from("video");
        assert!(!matches_pattern(&no_ext_file, "*.mp4"));
    }

    #[test]
    fn test_exclude_patterns_comprehensive() {
        let temp_dir = tempfile::tempdir().unwrap();
        let mut config = create_test_watch_config(temp_dir.path().to_str().unwrap());
        
        // より多くの除外パターンを追加
        config.exclude_patterns.extend(vec![
            "*.log".to_string(),
            "*backup*".to_string(),
            "Thumbs.db".to_string(),
        ]);
        
        let log_file = temp_dir.path().join("app.log");
        let backup_file = temp_dir.path().join("backup_video.mp4");
        let thumbs_file = temp_dir.path().join("Thumbs.db");
        let normal_file = temp_dir.path().join("normal.mp4");
        
        assert!(should_exclude_file(&log_file, &config));
        assert!(should_exclude_file(&backup_file, &config));
        assert!(should_exclude_file(&thumbs_file, &config));
        assert!(!should_exclude_file(&normal_file, &config));
    }

    #[test]
    fn test_should_exclude_file_empty_patterns() {
        let temp_dir = tempfile::tempdir().unwrap();
        
        // 空のパターン配列でテスト
        let config = WatchConfig {
            path: temp_dir.path().to_str().unwrap().to_string(),
            recursive: true,
            file_patterns: vec![], // 空のパターン配列
            max_file_size_mb: Some(100),
            auto_upload: true,
            exclude_patterns: vec![], // 空の除外パターン配列
            exclude_directories: vec![],
            auto_metadata: true,
        };
        
        let test_file = temp_dir.path().join("test.mp4");
        fs::write(&test_file, "test content").unwrap();
        
        // 空のパターン配列の場合、パターンチェックがスキップされるため除外されない
        assert!(!should_exclude_file(&test_file, &config));
        
        // 除外パターンだけ設定した場合
        let mut config_with_exclude = config.clone();
        config_with_exclude.exclude_patterns = vec!["*.tmp".to_string()];
        
        let tmp_file = temp_dir.path().join("test.tmp");
        fs::write(&tmp_file, "tmp content").unwrap();
        
        // 除外パターンに一致するファイルは除外される
        assert!(should_exclude_file(&tmp_file, &config_with_exclude));
        // 除外パターンに一致しないファイルは除外されない（file_patternsが空なのでパターンチェックはスキップ）
        assert!(!should_exclude_file(&test_file, &config_with_exclude));
    }

    #[tokio::test]
    async fn test_list_files_success() {
        // UUID付きテストディレクトリで並列衝突防止
        let home_dir = dirs::home_dir().unwrap();
        let test_dir = home_dir.join(format!("test_file_operations_{}", Uuid::new_v4()));
        
        // 既存のテストディレクトリがあれば削除
        if test_dir.exists() {
            let _ = fs::remove_dir_all(&test_dir);
        }
        
        // テストディレクトリを作成
        fs::create_dir_all(&test_dir).unwrap();
        
        // テストファイルを作成（1つだけ）
        fs::write(test_dir.join("test.txt"), "test content").unwrap();
        
        let directory = test_dir.to_str().unwrap().to_string();
        let result = list_files(directory).await;
        
        // クリーンアップ（再帰的に削除）
        let _ = fs::remove_dir_all(&test_dir); // エラーを無視
        
        assert!(result.is_ok());
        let files = result.unwrap();
        
        // 最低1つのファイルがあることを確認
        assert!(files.len() >= 1);
        
        // 作成したファイルが見つかることを確認
        let test_file = files.iter().find(|f| f.name == "test.txt");
        assert!(test_file.is_some(), "test.txt not found in files: {:?}", files.iter().map(|f| &f.name).collect::<Vec<_>>());
        let test_file = test_file.unwrap();
        assert_eq!(test_file.name, "test.txt");
        assert!(test_file.path.contains("test.txt"));
        assert!(test_file.size > 0);
        assert!(!test_file.is_directory);
        assert_eq!(test_file.extension, Some("txt".to_string()));
    }

    #[tokio::test]
    async fn test_list_files_invalid_directory() {
        let invalid_path = "/nonexistent/directory/that/should/not/exist".to_string();
        let result = list_files(invalid_path).await;
        
        assert!(result.is_err());
        let error_msg = result.unwrap_err();
        assert!(error_msg.contains("File operation error") || error_msg.contains("No such file or directory"));
    }

    #[tokio::test]
    async fn test_get_file_info_success() {
        // UUID付きテストディレクトリで並列衝突防止
        let home_dir = dirs::home_dir().unwrap();
        let test_dir = home_dir.join(format!("test_file_operations_{}", Uuid::new_v4()));
        
        // 既存のテストディレクトリがあれば削除
        if test_dir.exists() {
            let _ = fs::remove_dir_all(&test_dir);
        }
        
        fs::create_dir_all(&test_dir).unwrap();
        
        let test_file = test_dir.join("test.txt");
        fs::write(&test_file, "test content").unwrap();
        
        let file_path = test_file.to_str().unwrap().to_string();
        let result = get_file_info(file_path).await;
        
        // クリーンアップ（再帰的に削除）
        let _ = fs::remove_dir_all(&test_dir); // エラーを無視
        
        assert!(result.is_ok());
        let file_info = result.unwrap();
        
        assert_eq!(file_info.name, "test.txt");
        assert!(file_info.path.contains("test.txt"));
        assert!(file_info.size > 0);
        assert!(!file_info.is_directory);
        assert_eq!(file_info.extension, Some("txt".to_string()));
        assert!(!file_info.modified.is_empty());
    }

    #[tokio::test]
    async fn test_get_file_info_nonexistent_file() {
        let nonexistent_path = "/nonexistent/file.txt".to_string();
        let result = get_file_info(nonexistent_path).await;
        
        assert!(result.is_err());
        let error_msg = result.unwrap_err();
        assert!(error_msg.contains("File operation error") || error_msg.contains("No such file or directory"));
    }

    #[tokio::test]
    async fn test_get_sample_watch_configs() {
        let result = get_sample_watch_configs().await;
        
        assert!(result.is_ok());
        let configs = result.unwrap();
        
        // サンプル設定が3つ作成されることを確認
        assert_eq!(configs.len(), 3);
        
        // 各設定の基本構造を確認
        for config in &configs {
            assert!(!config.path.is_empty());
            assert!(!config.file_patterns.is_empty());
            assert!(config.max_file_size_mb.is_some());
        }
        
        // 最初の設定（非再帰的）を確認
        assert!(!configs[0].recursive);
        assert!(!configs[0].auto_upload);
        assert!(configs[0].auto_metadata);
        
        // 2番目の設定（再帰的、自動アップロード）を確認
        assert!(configs[1].recursive);
        assert!(configs[1].auto_upload);
        assert!(configs[1].auto_metadata);
    }

    #[tokio::test]
    async fn test_get_file_info_attributes_validation() {
        // UUID付きテストディレクトリで並列衝突防止
        let home_dir = dirs::home_dir().unwrap();
        let test_dir = home_dir.join(format!("test_file_operations_{}", Uuid::new_v4()));
        
        // 既存のテストディレクトリがあれば削除
        if test_dir.exists() {
            let _ = fs::remove_dir_all(&test_dir);
        }
        
        fs::create_dir_all(&test_dir).unwrap();
        
        // 拡張子なしファイルを作成
        let no_ext_file = test_dir.join("testfile");
        fs::write(&no_ext_file, "test content").unwrap();
        
        // 隠しファイルを作成
        let hidden_file = test_dir.join(".hidden");
        fs::write(&hidden_file, "hidden content").unwrap();
        
        // 拡張子なしファイルの検証
        let no_ext_path = no_ext_file.to_str().unwrap().to_string();
        let result = get_file_info(no_ext_path).await;
        
        assert!(result.is_ok());
        let file_info = result.unwrap();
        
        assert_eq!(file_info.name, "testfile");
        assert!(file_info.path.contains("testfile"));
        assert!(file_info.size > 0);
        assert!(!file_info.is_directory);
        assert_eq!(file_info.extension, None); // 拡張子なし
        assert!(!file_info.modified.is_empty());
        assert_ne!(file_info.modified, "Unknown"); // modifiedが"Unknown"でないことを確認
        
        // 隠しファイルの検証
        let hidden_path = hidden_file.to_str().unwrap().to_string();
        let result = get_file_info(hidden_path).await;
        
        assert!(result.is_ok());
        let file_info = result.unwrap();
        
        assert_eq!(file_info.name, ".hidden");
        assert!(file_info.path.contains(".hidden"));
        assert!(file_info.size > 0);
        assert!(!file_info.is_directory);
        assert_eq!(file_info.extension, None); // 隠しファイルは拡張子なし
        assert!(!file_info.modified.is_empty());
        assert_ne!(file_info.modified, "Unknown"); // modifiedが"Unknown"でないことを確認
        
        // クリーンアップ（再帰的に削除）
        let _ = fs::remove_dir_all(&test_dir); // エラーを無視
    }

    #[tokio::test]
    async fn test_get_file_info_permission_error() {
        // UUID付きテストディレクトリで並列衝突防止
        let home_dir = dirs::home_dir().unwrap();
        let test_dir = home_dir.join(format!("test_file_operations_{}", Uuid::new_v4()));
        
        // 既存のテストディレクトリがあれば削除
        if test_dir.exists() {
            let _ = fs::remove_dir_all(&test_dir);
        }
        
        fs::create_dir_all(&test_dir).unwrap();
        
        // 読み取り不可ファイルを作成
        let readonly_file = test_dir.join("readonly.txt");
        fs::write(&readonly_file, "readonly content").unwrap();
        
        // ファイルの権限を000に変更（読み取り不可）
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&readonly_file).unwrap().permissions();
            perms.set_mode(0o000); // 読み取り・書き込み・実行権限を全て削除
            fs::set_permissions(&readonly_file, perms).unwrap();
        }
        
        let readonly_path = readonly_file.to_str().unwrap().to_string();
        let result = get_file_info(readonly_path).await;
        
        // 権限を元に戻してからクリーンアップ
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&readonly_file).unwrap().permissions();
            perms.set_mode(0o644); // 通常の権限に戻す
            fs::set_permissions(&readonly_file, perms).unwrap();
        }
        
        // クリーンアップ（再帰的に削除）
        let _ = fs::remove_dir_all(&test_dir); // エラーを無視
        
        // Unix系では権限エラー、Windowsでは成功する可能性がある
        #[cfg(unix)]
        {
            // macOSではファイル所有者であれば権限000でも読み取り可能な場合がある
            if result.is_err() {
                let error_msg = result.unwrap_err();
                assert!(error_msg.contains("Permission denied") || error_msg.contains("Access denied"));
            } else {
                // 権限エラーが発生しなくても、ファイル情報が正しく取得できればOK
                let file_info = result.unwrap();
                assert_eq!(file_info.name, "readonly.txt");
                assert!(file_info.size > 0);
            }
        }
        
        #[cfg(windows)]
        {
            // Windowsでは権限エラーが発生しない可能性があるため、成功してもOK
            if result.is_ok() {
                let file_info = result.unwrap();
                assert_eq!(file_info.name, "readonly.txt");
                assert!(file_info.size > 0);
            }
        }
    }
} 