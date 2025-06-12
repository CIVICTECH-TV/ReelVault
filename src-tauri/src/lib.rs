// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
use std::sync::{Arc, Mutex};

// モジュール定義
mod commands {
    pub mod file_operations;
    pub mod aws_operations; 
    pub mod config;
    pub mod state_management;
    pub mod aws_auth;
    pub mod metadata;
    pub mod upload_system;
    pub mod lifecycle;
}

// コマンドをインポート
use commands::file_operations::*;
use commands::aws_operations::*;
use commands::config::*;
use commands::state_management::*;
use commands::aws_auth::*;
use commands::metadata::*;
use commands::upload_system::*;
use commands::lifecycle::*;



#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // アプリケーション状態の初期化
  let app_state = Arc::new(Mutex::new(commands::state_management::AppState::default()));
  let upload_queue = Arc::new(Mutex::new(commands::upload_system::UploadQueue::new()));

  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_dialog::init())
    .manage(app_state)
    .manage(upload_queue)
    .invoke_handler(tauri::generate_handler![

        // ファイル操作API
        list_files,
        get_file_info,
        select_directory,
        watch_directory,
        test_watch_system,
        get_sample_watch_configs,
        // AWS操作API
        test_aws_connection,
        upload_file,
        list_s3_objects,
        restore_file,
        check_restore_status,
        get_restore_notifications,
        download_s3_file,
    download_restored_file,
        list_restore_jobs,
        cancel_restore_job,
        clear_restore_history,
        // AWS認証API
        authenticate_aws,
        test_s3_bucket_access,
        save_aws_credentials_secure,
        load_aws_credentials_secure,
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
        update_system_stats,
        reset_app_state,
        // メタデータ管理API
        initialize_metadata_db,
        create_file_metadata,
        save_file_metadata,
        search_file_metadata,
        update_file_metadata,
        delete_file_metadata,
        get_all_tags,
        // アップロードシステムAPI
        initialize_upload_queue,
        open_file_dialog,
        add_files_to_upload_queue,
        remove_upload_item,
        start_upload_processing,
        stop_upload_processing,
        get_upload_queue_status,
        get_upload_queue_items,
        retry_upload_item,
        clear_upload_queue,
        test_upload_config,
        // ライフサイクル管理API
        enable_reelvault_lifecycle,
        get_lifecycle_status,
        disable_lifecycle_policy,
        list_lifecycle_rules,
        validate_lifecycle_config,
        check_upload_readiness
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
