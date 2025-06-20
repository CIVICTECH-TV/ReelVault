use std::path::PathBuf;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use tauri::command;
use rusqlite::{Connection, Result as SqliteResult};
use sha2::{Sha256, Digest};
use std::fs::File;
use std::io::{BufReader, Read};
use std::sync::Mutex;
use crate::internal::{InternalError, standardize_error};

/// ファイルメタデータを表す構造体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileMetadata {
    pub id: Option<i64>,
    pub file_path: String,
    pub file_name: String,
    pub file_size: u64,
    pub file_hash: String,
    pub mime_type: String,
    pub created_at: String,
    pub modified_at: String,
    pub video_metadata: Option<VideoMetadata>,
    pub tags: Vec<String>,
    pub custom_fields: HashMap<String, String>,
}

/// 動画メタデータを表す構造体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VideoMetadata {
    pub duration: Option<f64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub frame_rate: Option<f64>,
    pub bit_rate: Option<u64>,
    pub codec: Option<String>,
    pub format: Option<String>,
}

/// メタデータ検索条件
#[derive(Debug, Deserialize)]
pub struct MetadataSearchQuery {
    pub file_name_pattern: Option<String>,
    #[allow(dead_code)]
    pub tags: Option<Vec<String>>,
    pub size_min: Option<u64>,
    pub size_max: Option<u64>,
    #[allow(dead_code)]
    pub date_from: Option<String>,
    #[allow(dead_code)]
    pub date_to: Option<String>,
    pub mime_type: Option<String>,
}

/// データベース管理構造体
pub struct MetadataDatabase {
    connection: Connection,
}

impl MetadataDatabase {
    /// 新しいデータベース接続を作成
    pub fn new(db_path: &str) -> SqliteResult<Self> {
        let connection = Connection::open(db_path)?;
        let db = MetadataDatabase { connection };
        db.initialize_tables()?;
        Ok(db)
    }

    /// データベーステーブルを初期化
    fn initialize_tables(&self) -> SqliteResult<()> {
        // ファイルメタデータテーブル
        self.connection.execute(
            "CREATE TABLE IF NOT EXISTS file_metadata (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT UNIQUE NOT NULL,
                file_name TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                file_hash TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                created_at TEXT NOT NULL,
                modified_at TEXT NOT NULL,
                video_metadata TEXT,
                custom_fields TEXT
            )",
            [],
        )?;

        // タグテーブル
        self.connection.execute(
            "CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL
            )",
            [],
        )?;

        // ファイル-タグ関連テーブル
        self.connection.execute(
            "CREATE TABLE IF NOT EXISTS file_tags (
                file_id INTEGER,
                tag_id INTEGER,
                PRIMARY KEY (file_id, tag_id),
                FOREIGN KEY (file_id) REFERENCES file_metadata(id),
                FOREIGN KEY (tag_id) REFERENCES tags(id)
            )",
            [],
        )?;

        // インデックス作成
        self.connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_file_path ON file_metadata(file_path)",
            [],
        )?;
        
        self.connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_file_hash ON file_metadata(file_hash)",
            [],
        )?;

        Ok(())
    }

    /// メタデータを保存
    pub fn save_metadata(&self, metadata: &FileMetadata) -> SqliteResult<i64> {
        let video_metadata_json = metadata.video_metadata
            .as_ref()
            .map(|vm| serde_json::to_string(vm).unwrap_or_default());
        
        let custom_fields_json = serde_json::to_string(&metadata.custom_fields)
            .unwrap_or_default();

        let mut stmt = self.connection.prepare(
            "INSERT OR REPLACE INTO file_metadata 
             (file_path, file_name, file_size, file_hash, mime_type, created_at, modified_at, video_metadata, custom_fields)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"
        )?;

        stmt.execute([
            &metadata.file_path,
            &metadata.file_name,
            &metadata.file_size.to_string(),
            &metadata.file_hash,
            &metadata.mime_type,
            &metadata.created_at,
            &metadata.modified_at,
            &video_metadata_json.unwrap_or_default(),
            &custom_fields_json,
        ])?;

        let file_id = self.connection.last_insert_rowid();

        // タグを保存
        self.save_tags(file_id, &metadata.tags)?;

        Ok(file_id)
    }

    /// タグを保存
    fn save_tags(&self, file_id: i64, tags: &[String]) -> SqliteResult<()> {
        // 既存のタグ関連を削除
        self.connection.execute(
            "DELETE FROM file_tags WHERE file_id = ?1",
            [file_id],
        )?;

        for tag in tags {
            // タグを挿入（既存の場合は無視）
            self.connection.execute(
                "INSERT OR IGNORE INTO tags (name) VALUES (?1)",
                [tag],
            )?;

            // タグIDを取得
            let tag_id: i64 = self.connection.query_row(
                "SELECT id FROM tags WHERE name = ?1",
                [tag],
                |row| row.get(0),
            )?;

            // ファイル-タグ関連を挿入
            self.connection.execute(
                "INSERT INTO file_tags (file_id, tag_id) VALUES (?1, ?2)",
                [file_id, tag_id],
            )?;
        }

        Ok(())
    }

    /// メタデータを検索
    pub fn search_metadata(&self, query: &MetadataSearchQuery) -> SqliteResult<Vec<FileMetadata>> {
        let mut sql = "SELECT * FROM file_metadata WHERE 1=1".to_string();
        let mut params: Vec<String> = Vec::new();

        if let Some(pattern) = &query.file_name_pattern {
            sql.push_str(" AND file_name LIKE ?");
            params.push(format!("%{}%", pattern));
        }

        if let Some(mime_type) = &query.mime_type {
            sql.push_str(" AND mime_type = ?");
            params.push(mime_type.clone());
        }

        if let Some(size_min) = query.size_min {
            sql.push_str(" AND file_size >= ?");
            params.push(size_min.to_string());
        }

        if let Some(size_max) = query.size_max {
            sql.push_str(" AND file_size <= ?");
            params.push(size_max.to_string());
        }

        sql.push_str(" ORDER BY modified_at DESC");

        let mut stmt = self.connection.prepare(&sql)?;
        let metadata_iter = stmt.query_map(
            rusqlite::params_from_iter(params.iter()),
            |row| {
                let id: i64 = row.get(0)?;
                let video_metadata_json: Option<String> = row.get(8)?;
                let custom_fields_json: String = row.get(9)?;

                let video_metadata = video_metadata_json
                    .and_then(|json| serde_json::from_str(&json).ok());
                
                let custom_fields: HashMap<String, String> = 
                    serde_json::from_str(&custom_fields_json).unwrap_or_default();

                // タグを取得
                let tags = self.get_tags_for_file(id).unwrap_or_default();

                Ok(FileMetadata {
                    id: Some(id),
                    file_path: row.get(1)?,
                    file_name: row.get(2)?,
                    file_size: row.get::<_, i64>(3)? as u64,
                    file_hash: row.get(4)?,
                    mime_type: row.get(5)?,
                    created_at: row.get(6)?,
                    modified_at: row.get(7)?,
                    video_metadata,
                    tags,
                    custom_fields,
                })
            },
        )?;

        let mut results = Vec::new();
        for metadata in metadata_iter {
            results.push(metadata?);
        }

        Ok(results)
    }

    /// ファイルのタグを取得
    fn get_tags_for_file(&self, file_id: i64) -> SqliteResult<Vec<String>> {
        let mut stmt = self.connection.prepare(
            "SELECT t.name FROM tags t 
             JOIN file_tags ft ON t.id = ft.tag_id 
             WHERE ft.file_id = ?1"
        )?;
        
        let tag_iter = stmt.query_map([file_id], |row| {
            Ok(row.get::<_, String>(0)?)
        })?;

        let mut tags = Vec::new();
        for tag in tag_iter {
            tags.push(tag?);
        }

        Ok(tags)
    }

    /// ファイルパスでメタデータを取得
    pub fn get_metadata_by_path(&self, file_path: &str) -> SqliteResult<FileMetadata> {
        let mut stmt = self.connection.prepare(
            "SELECT * FROM file_metadata WHERE file_path = ?1"
        )?;

        let metadata = stmt.query_row([file_path], |row| {
            let id: i64 = row.get(0)?;
            let video_metadata_json: Option<String> = row.get(8)?;
            let custom_fields_json: String = row.get(9)?;

            let video_metadata = video_metadata_json
                .and_then(|json| serde_json::from_str(&json).ok());
            
            let custom_fields: HashMap<String, String> = 
                serde_json::from_str(&custom_fields_json).unwrap_or_default();

            // タグを取得
            let tags = self.get_tags_for_file(id).unwrap_or_default();

            Ok(FileMetadata {
                id: Some(id),
                file_path: row.get(1)?,
                file_name: row.get(2)?,
                file_size: row.get::<_, i64>(3)? as u64,
                file_hash: row.get(4)?,
                mime_type: row.get(5)?,
                created_at: row.get(6)?,
                modified_at: row.get(7)?,
                video_metadata,
                tags,
                custom_fields,
            })
        })?;

        Ok(metadata)
    }

    /// ファイルパスでメタデータを削除
    pub fn delete_metadata(&self, file_path: &str) -> SqliteResult<()> {
        // ファイルIDを取得
        let file_id: i64 = self.connection.query_row(
            "SELECT id FROM file_metadata WHERE file_path = ?1",
            [file_path],
            |row| row.get(0),
        )?;

        // タグ関連を削除
        self.connection.execute(
            "DELETE FROM file_tags WHERE file_id = ?1",
            [file_id],
        )?;

        // メタデータを削除
        self.connection.execute(
            "DELETE FROM file_metadata WHERE id = ?1",
            [file_id],
        )?;

        Ok(())
    }

    /// すべてのタグを取得
    pub fn get_all_tags(&self) -> SqliteResult<Vec<String>> {
        let mut stmt = self.connection.prepare("SELECT name FROM tags ORDER BY name")?;
        
        let tag_iter = stmt.query_map([], |row| {
            Ok(row.get::<_, String>(0)?)
        })?;

        let mut tags = Vec::new();
        for tag in tag_iter {
            tags.push(tag?);
        }

        Ok(tags)
    }
}

/// ファイルハッシュを計算
pub fn calculate_file_hash(file_path: &PathBuf) -> Result<String, InternalError> {
    let file = File::open(file_path)
        .map_err(|e| InternalError::File(format!("Failed to open file: {}", e)))?;
    
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0; 1024];

    loop {
        let count = reader.read(&mut buffer)
            .map_err(|e| InternalError::File(format!("Failed to read file: {}", e)))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

/// MIMEタイプを推定
pub fn detect_mime_type(file_path: &PathBuf) -> String {
    if let Some(extension) = file_path.extension().and_then(|s| s.to_str()) {
        match extension.to_lowercase().as_str() {
            "mp4" => "video/mp4".to_string(),
            "mov" => "video/quicktime".to_string(),
            "avi" => "video/x-msvideo".to_string(),
            "mkv" => "video/x-matroska".to_string(),
            "wmv" => "video/x-ms-wmv".to_string(),
            "flv" => "video/x-flv".to_string(),
            "webm" => "video/webm".to_string(),
            _ => "application/octet-stream".to_string(),
        }
    } else {
        "application/octet-stream".to_string()
    }
}

// Tauri Command API実装

/// グローバルなメタデータデータベース接続
#[allow(dead_code)]
pub struct MetadataState(pub Mutex<Option<MetadataDatabase>>);

/// メタデータデータベースを初期化
#[command]
pub async fn initialize_metadata_db(db_path: String) -> Result<String, String> {
    match MetadataDatabase::new(&db_path) {
        Ok(_) => Ok("Metadata database initialized successfully".to_string()),
        Err(e) => Err(standardize_error(InternalError::Database(format!("Failed to initialize metadata database: {}", e))))
    }
}

/// ファイルメタデータを作成
#[command]
pub async fn create_file_metadata(
    file_path: String,
    tags: Vec<String>,
    custom_fields: HashMap<String, String>,
) -> Result<FileMetadata, String> {
    let path = PathBuf::from(&file_path);
    
    // ファイルの存在確認
    if !path.exists() {
        return Err(standardize_error(InternalError::File(format!("File does not exist: {}", file_path))));
    }

    // ファイル情報を取得
    let metadata = std::fs::metadata(&path)
        .map_err(|e| standardize_error(InternalError::File(format!("Failed to get file metadata: {}", e))))?;

    // ファイルハッシュを計算
    let file_hash = calculate_file_hash(&path)
        .map_err(|e| standardize_error(e))?;

    // MIMEタイプを検出
    let mime_type = detect_mime_type(&path);

    // 動画メタデータを抽出（動画ファイルの場合）
    let video_metadata = if mime_type.starts_with("video/") {
        extract_video_metadata(&path).ok()
    } else {
        None
    };

    let metadata = FileMetadata {
        id: None,
        file_path,
        file_name: path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string(),
        file_size: metadata.len(),
        file_hash,
        mime_type,
        created_at: format!("{:?}", metadata.created().unwrap_or(std::time::SystemTime::now())),
        modified_at: format!("{:?}", metadata.modified().unwrap_or(std::time::SystemTime::now())),
        video_metadata,
        tags,
        custom_fields,
    };

    Ok(metadata)
}

/// ファイルメタデータを保存
#[command]
pub async fn save_file_metadata(
    metadata: FileMetadata,
    db_path: String,
) -> Result<i64, String> {
    let db = MetadataDatabase::new(&db_path)
        .map_err(|e| standardize_error(InternalError::Database(format!("Failed to create database connection: {}", e))))?;

    db.save_metadata(&metadata)
        .map_err(|e| standardize_error(InternalError::Database(format!("Failed to save metadata: {}", e))))
}

/// ファイルメタデータを検索
#[command]
pub async fn search_file_metadata(
    query: MetadataSearchQuery,
    db_path: String,
) -> Result<Vec<FileMetadata>, String> {
    let db = MetadataDatabase::new(&db_path)
        .map_err(|e| standardize_error(InternalError::Database(format!("Failed to create database connection: {}", e))))?;

    db.search_metadata(&query)
        .map_err(|e| standardize_error(InternalError::Database(format!("Failed to search metadata: {}", e))))
}

/// ファイルメタデータを更新
#[command]
pub async fn update_file_metadata(
    file_path: String,
    tags: Option<Vec<String>>,
    custom_fields: Option<HashMap<String, String>>,
    db_path: String,
) -> Result<String, String> {
    let db = MetadataDatabase::new(&db_path)
        .map_err(|e| standardize_error(InternalError::Database(format!("Failed to create database connection: {}", e))))?;

    // 既存のメタデータを取得
    let existing_metadata = db.get_metadata_by_path(&file_path)
        .map_err(|e| standardize_error(InternalError::Database(format!("Failed to get existing metadata: {}", e))))?;

    let mut updated_metadata = existing_metadata;

    // タグを更新
    if let Some(new_tags) = tags {
        updated_metadata.tags = new_tags;
    }

    // カスタムフィールドを更新
    if let Some(new_fields) = custom_fields {
        updated_metadata.custom_fields = new_fields;
    }

    // 更新されたメタデータを保存
    db.save_metadata(&updated_metadata)
        .map_err(|e| standardize_error(InternalError::Database(format!("Failed to update metadata: {}", e))))?;

    Ok("Metadata updated successfully".to_string())
}

/// ファイルメタデータを削除
#[command]
pub async fn delete_file_metadata(
    file_path: String,
    db_path: String,
) -> Result<String, String> {
    let db = MetadataDatabase::new(&db_path)
        .map_err(|e| standardize_error(InternalError::Database(format!("Failed to create database connection: {}", e))))?;

    db.delete_metadata(&file_path)
        .map_err(|e| standardize_error(InternalError::Database(format!("Failed to delete metadata: {}", e))))?;

    Ok("Metadata deleted successfully".to_string())
}

/// すべてのタグを取得
#[command]
pub async fn get_all_tags(db_path: String) -> Result<Vec<String>, String> {
    let db = MetadataDatabase::new(&db_path)
        .map_err(|e| standardize_error(InternalError::Database(format!("Failed to create database connection: {}", e))))?;

    db.get_all_tags()
        .map_err(|e| standardize_error(InternalError::Database(format!("Failed to get tags: {}", e))))
}

/// 動画メタデータを抽出
fn extract_video_metadata(_file_path: &PathBuf) -> Result<VideoMetadata, InternalError> {
    // TODO: 実際の動画メタデータ抽出を実装
    // 現在はダミーデータを返す
    Ok(VideoMetadata {
        duration: Some(120.0),
        width: Some(1920),
        height: Some(1080),
        frame_rate: Some(30.0),
        bit_rate: Some(5000000),
        codec: Some("H.264".to_string()),
        format: Some("MP4".to_string()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;
    use tempfile::TempDir;

    /// テスト用データベースを作成
    fn create_test_db() -> (MetadataDatabase, TempDir) {
        let temp_dir = tempfile::tempdir().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let db = MetadataDatabase::new(db_path.to_str().unwrap()).unwrap();
        (db, temp_dir)
    }

    /// テスト用ファイルメタデータを作成
    fn create_test_metadata() -> FileMetadata {
        let mut custom_fields = HashMap::new();
        custom_fields.insert("description".to_string(), "Test video file".to_string());

        FileMetadata {
            id: None,
            file_path: "/test/video.mp4".to_string(),
            file_name: "video.mp4".to_string(),
            file_size: 1024 * 1024 * 100, // 100MB
            file_hash: "abc123def456".to_string(),
            mime_type: "video/mp4".to_string(),
            created_at: "1640995200".to_string(), // 2022-01-01
            modified_at: "1640995200".to_string(),
            video_metadata: Some(VideoMetadata {
                duration: Some(120.5),
                width: Some(1920),
                height: Some(1080),
                frame_rate: Some(30.0),
                bit_rate: Some(5000000),
                codec: Some("h264".to_string()),
                format: Some("mp4".to_string()),
            }),
            tags: vec!["test".to_string(), "video".to_string()],
            custom_fields,
        }
    }

    #[test]
    fn test_database_initialization() {
        let (_, _temp_dir) = create_test_db();
        // データベースが正常に作成されることをテスト
        // temp_dirが削除されることで自動的にクリーンアップ
    }

    #[test]
    fn test_save_and_search_metadata() {
        let (db, _temp_dir) = create_test_db();
        let metadata = create_test_metadata();

        // メタデータを保存
        let file_id = db.save_metadata(&metadata).unwrap();
        assert!(file_id > 0);

        // 保存されたメタデータを検索
        let search_query = MetadataSearchQuery {
            file_name_pattern: Some("video".to_string()),
            tags: None,
            size_min: None,
            size_max: None,
            date_from: None,
            date_to: None,
            mime_type: None,
        };

        let results = db.search_metadata(&search_query).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].file_name, "video.mp4");
        assert_eq!(results[0].tags.len(), 2);
        assert!(results[0].tags.contains(&"test".to_string()));
    }

    #[test]
    fn test_file_hash_calculation() {
        // テスト用の一時ファイルを作成
        let temp_dir = tempfile::tempdir().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        fs::write(&file_path, "Hello, World!").unwrap();

        // ハッシュを計算
        let hash = calculate_file_hash(&file_path).unwrap();
        
        // SHA256ハッシュが正しい形式であることを確認
        assert_eq!(hash.len(), 64); // SHA256は64文字の16進数
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_mime_type_detection() {
        let test_cases = vec![
            ("test.mp4", "video/mp4"),
            ("test.mov", "video/quicktime"),
            ("test.avi", "video/x-msvideo"),
            ("test.mkv", "video/x-matroska"),
            ("test.unknown", "application/octet-stream"),
        ];

        for (filename, expected_mime) in test_cases {
            let path = PathBuf::from(filename);
            let detected_mime = detect_mime_type(&path);
            assert_eq!(detected_mime, expected_mime);
        }
    }

    #[test]
    fn test_search_with_filters() {
        let (db, _temp_dir) = create_test_db();
        
        // 複数のテストデータを作成
        let mut metadata1 = create_test_metadata();
        metadata1.file_path = "/test/video1.mp4".to_string();
        metadata1.file_name = "video1.mp4".to_string();
        metadata1.file_size = 1024 * 1024 * 50; // 50MB
        
        let mut metadata2 = create_test_metadata();
        metadata2.file_path = "/test/video2.avi".to_string();
        metadata2.file_name = "video2.avi".to_string();
        metadata2.mime_type = "video/x-msvideo".to_string();
        metadata2.file_size = 1024 * 1024 * 200; // 200MB

        // メタデータを保存
        db.save_metadata(&metadata1).unwrap();
        db.save_metadata(&metadata2).unwrap();

        // サイズフィルタでテスト
        let size_query = MetadataSearchQuery {
            file_name_pattern: None,
            tags: None,
            size_min: Some(1024 * 1024 * 100), // 100MB以上
            size_max: None,
            date_from: None,
            date_to: None,
            mime_type: None,
        };

        let results = db.search_metadata(&size_query).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].file_name, "video2.avi");

        // MIMEタイプフィルタでテスト
        let mime_query = MetadataSearchQuery {
            file_name_pattern: None,
            tags: None,
            size_min: None,
            size_max: None,
            date_from: None,
            date_to: None,
            mime_type: Some("video/mp4".to_string()),
        };

        let results = db.search_metadata(&mime_query).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].file_name, "video1.mp4");
    }

    #[test]
    fn test_tag_management() {
        let (db, _temp_dir) = create_test_db();
        let metadata = create_test_metadata();

        // メタデータを保存
        let file_id = db.save_metadata(&metadata).unwrap();

        // タグを取得
        let tags = db.get_tags_for_file(file_id).unwrap();
        assert_eq!(tags.len(), 2);
        assert!(tags.contains(&"test".to_string()));
        assert!(tags.contains(&"video".to_string()));
    }

    #[test]
    fn test_video_metadata_extraction() {
        let path = PathBuf::from("test.mp4");
        let video_metadata = extract_video_metadata(&path).unwrap();
        
        // 基本実装では format のみ設定される（大文字で返される）
        assert_eq!(video_metadata.format, Some("MP4".to_string()));
        assert!(video_metadata.duration.is_some()); // 現在の実装では120.0が設定される
    }

    #[test]
    fn test_custom_fields() {
        let (db, _temp_dir) = create_test_db();
        let metadata = create_test_metadata();

        // メタデータを保存
        db.save_metadata(&metadata).unwrap();

        // カスタムフィールドでメタデータを検索
        let search_query = MetadataSearchQuery {
            file_name_pattern: Some("video".to_string()),
            tags: None,
            size_min: None,
            size_max: None,
            date_from: None,
            date_to: None,
            mime_type: None,
        };

        let results = db.search_metadata(&search_query).unwrap();
        assert_eq!(results.len(), 1);
        
        let custom_fields = &results[0].custom_fields;
        assert_eq!(custom_fields.get("description").unwrap(), "Test video file");
    }
} 