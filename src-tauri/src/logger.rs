use tauri::{AppHandle, Manager};
use tracing_subscriber::{fmt, prelude::*, EnvFilter, Layer};
use anyhow::{Context, Result};

const LOG_FILE_NAME: &str = "ReelVault.log";

pub fn init_logger(app: &AppHandle) -> Result<()> {
    let log_dir = app
        .path()
        .app_log_dir()
        .context("Failed to get app log directory")?;
    std::fs::create_dir_all(&log_dir)?;
    let log_path = log_dir.join(LOG_FILE_NAME);

    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,reel_vault=debug,tauri=info,aws=warn"));

    let file_appender = tracing_appender::rolling::daily(&log_dir, LOG_FILE_NAME);
    let file_layer = fmt::layer()
        .with_thread_ids(true)
        .with_thread_names(true)
        .with_target(true)
        .with_ansi(false)
        .with_timer(fmt::time::ChronoUtc::new(
            "%Y-%m-%dT%H:%M:%S%.3f%z".to_string(),
        ))
        .with_writer(file_appender)
        .with_filter(EnvFilter::new("info,reel_vault=trace"));

    let stdout_layer = fmt::layer()
        .with_thread_ids(true)
        .with_thread_names(true)
        .with_target(true)
        .with_ansi(true)
        .with_timer(fmt::time::ChronoUtc::new("%H:%M:%S%.3f".to_string()))
        .with_writer(std::io::stdout);

    let subscriber = tracing_subscriber::registry()
        .with(env_filter)
        .with(file_layer);

    if cfg!(debug_assertions) {
        subscriber
            .with(stdout_layer.with_filter(EnvFilter::new("debug")))
            .init();
    } else {
        subscriber.init();
    }

    tracing::info!("==================================================");
    tracing::info!(
        "Logger initialized. Log file at: {}",
        log_path.display()
    );
    tracing::info!("Log level: RUST_LOG or default (info, reel_vault=debug)");
    tracing::info!("==================================================");

    Ok(())
}