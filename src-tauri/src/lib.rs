// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
use std::sync::{Arc, Mutex};

// モジュール定義
mod commands {
    pub mod file_operations;
    pub mod aws_operations; 
    pub mod config;
    pub mod state_management;
    pub mod aws_auth;
}

// コマンドをインポート
use commands::file_operations::*;
use commands::aws_operations::*;
use commands::config::*;
use commands::state_management::*;
use commands::aws_auth::*;



#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // アプリケーション状態の初期化
  let app_state = Arc::new(Mutex::new(commands::state_management::AppState::default()));

  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .manage(app_state)
    .invoke_handler(tauri::generate_handler![

        // ファイル操作API
        list_files,
        get_file_info,
        watch_directory,
        // AWS操作API
        test_aws_connection,
        upload_file,
        list_s3_objects,
        restore_file,
        // AWS認証API
        authenticate_aws,
        test_s3_bucket_access,
        save_aws_credentials_secure,
        load_aws_credentials_secure,
        delete_aws_credentials_secure,
        // 設定管理API
        get_config,
        set_config,
        update_config,
        reset_config,
        validate_config_file,
        validate_config_data,
        backup_config,
        export_config,
        import_config,
        restore_config,
        add_recent_file,
        clear_recent_files,
        // 状態管理API
        get_app_state,
        set_app_state,
        update_app_state,
        add_to_upload_queue,
        remove_from_upload_queue,
        update_system_stats,
        reset_app_state
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
