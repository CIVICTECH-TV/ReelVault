use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("AWS Error: {0}")]
    Aws(String),

    #[error("File Operation Error: {0}")]
    File(String),

    #[error("Configuration Error: {0}")]
    Config(String),

    #[error("Database Error: {0}")]
    Database(String),

    #[error("I/O Error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Tauri API Error: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("Unknown Error: {0}")]
    Unknown(String),
} 