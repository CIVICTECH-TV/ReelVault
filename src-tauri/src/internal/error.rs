use thiserror::Error;

/// 内部ロジックで使用するエラー型
/// Tauriコマンドの境界ではStringに変換される
#[derive(Error, Debug)]
pub enum InternalError {
    /// AWS S3関連のエラー
    #[error("AWS S3 error: {0}")]
    S3(String),

    /// AWS STS関連のエラー
    #[error("AWS STS error: {0}")]
    Sts(#[from] aws_sdk_sts::Error),

    /// AWS設定関連のエラー
    #[error("AWS configuration error: {0}")]
    AwsConfig(String),

    /// 設定ファイル関連のエラー
    #[error("Configuration error: {0}")]
    Config(String),

    /// ファイル操作関連のエラー
    #[error("File operation error: {0}")]
    File(String),

    /// データベース関連のエラー
    #[error("Database error: {0}")]
    Database(String),

    /// 認証関連のエラー
    #[error("Authentication error: {0}")]
    Auth(String),

    /// 暗号化関連のエラー
    #[error("Encryption error: {0}")]
    Encryption(String),

    /// メタデータ関連のエラー
    #[error("Metadata error: {0}")]
    Metadata(String),

    /// その他のエラー
    #[error("Unexpected error: {0}")]
    Other(String),
}

impl From<std::io::Error> for InternalError {
    fn from(err: std::io::Error) -> Self {
        InternalError::File(err.to_string())
    }
}

impl From<serde_json::Error> for InternalError {
    fn from(err: serde_json::Error) -> Self {
        InternalError::Config(err.to_string())
    }
}

impl From<rusqlite::Error> for InternalError {
    fn from(err: rusqlite::Error) -> Self {
        InternalError::Database(err.to_string())
    }
}

impl From<keyring::Error> for InternalError {
    fn from(err: keyring::Error) -> Self {
        InternalError::Auth(err.to_string())
    }
}

impl From<ring::error::Unspecified> for InternalError {
    fn from(_err: ring::error::Unspecified) -> Self {
        InternalError::Encryption("Cryptographic operation failed".to_string())
    }
}

impl From<base64::DecodeError> for InternalError {
    fn from(err: base64::DecodeError) -> Self {
        InternalError::Encryption(format!("Base64 decode error: {}", err))
    }
}

impl From<uuid::Error> for InternalError {
    fn from(err: uuid::Error) -> Self {
        InternalError::Other(format!("UUID error: {}", err))
    }
}

impl From<chrono::ParseError> for InternalError {
    fn from(err: chrono::ParseError) -> Self {
        InternalError::Metadata(format!("Date/time parse error: {}", err))
    }
}

impl From<notify::Error> for InternalError {
    fn from(err: notify::Error) -> Self {
        InternalError::File(format!("File system watch error: {}", err))
    }
}

impl From<regex::Error> for InternalError {
    fn from(err: regex::Error) -> Self {
        InternalError::Other(format!("Regex error: {}", err))
    }
}

/// エラーメッセージの標準化
pub fn standardize_error(e: InternalError) -> String {
    match e {
        InternalError::S3(e) => format!("AWS S3 error: {}", e),
        InternalError::Sts(e) => format!("AWS STS error: {}", e),
        InternalError::AwsConfig(msg) => format!("AWS configuration error: {}", msg),
        InternalError::Config(msg) => format!("Configuration error: {}", msg),
        InternalError::File(msg) => format!("File operation error: {}", msg),
        InternalError::Database(msg) => format!("Database error: {}", msg),
        InternalError::Auth(msg) => format!("Authentication error: {}", msg),
        InternalError::Encryption(msg) => format!("Encryption error: {}", msg),
        InternalError::Metadata(msg) => format!("Metadata error: {}", msg),
        InternalError::Other(msg) => format!("Unexpected error: {}", msg),
    }
}

/// エラーコードの取得
pub fn get_error_code(e: &InternalError) -> &'static str {
    match e {
        InternalError::S3(_) => "AWS_S3_ERROR",
        InternalError::Sts(_) => "AWS_STS_ERROR",
        InternalError::AwsConfig(_) => "AWS_CONFIG_ERROR",
        InternalError::Config(_) => "CONFIG_ERROR",
        InternalError::File(_) => "FILE_ERROR",
        InternalError::Database(_) => "DATABASE_ERROR",
        InternalError::Auth(_) => "AUTH_ERROR",
        InternalError::Encryption(_) => "ENCRYPTION_ERROR",
        InternalError::Metadata(_) => "METADATA_ERROR",
        InternalError::Other(_) => "UNKNOWN_ERROR",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_conversion() {
        let internal_error = InternalError::Config("test configuration error".to_string());
        let result = standardize_error(internal_error);
        assert!(result.contains("Configuration error"));
        assert!(result.contains("test configuration error"));
    }

    #[test]
    fn test_error_code() {
        let internal_error = InternalError::File("test file error".to_string());
        let code = get_error_code(&internal_error);
        assert_eq!(code, "FILE_ERROR");
    }

    #[test]
    fn test_from_io_error() {
        let io_error = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let internal_error: InternalError = io_error.into();
        match internal_error {
            InternalError::File(msg) => assert!(msg.contains("file not found")),
            _ => panic!("Expected File error"),
        }
    }
} 