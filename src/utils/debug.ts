/**
 * デバッグ用ヘルパー関数
 * 開発環境でのみconsole出力を行う
 */

// シンプルな環境判定
const isDevelopment = (import.meta as any).env?.DEV === true;

// 開発環境判定（開発者向け機能の表示制御用）
export const isDev = (): boolean => {
  return (import.meta as any).env?.DEV === true;
};

// ログレベル定義（シンプルな2段階）
type LogLevel = 'info' | 'debug';

// 前回のログレベルを記憶（変更検知用）
let lastLogLevel: LogLevel | null = null;

// 現在のログレベル設定を取得
const getCurrentLogLevel = (): LogLevel => {
  try {
    // localStorage から設定を取得
    const configStr = localStorage.getItem('reelvault_config');
    if (configStr) {
      const config = JSON.parse(configStr);
      const logLevel = config.app_settings?.log_level;
      if (logLevel === 'debug') {
        return 'debug';
      }
    }
  } catch (error) {
    console.error('Failed to get log level from config:', error);
  }
  
  // デフォルトは info レベル
  return 'info';
};

// ログレベル変更を検知してログ出力
const checkLogLevelChange = (): LogLevel => {
  const currentLevel = getCurrentLogLevel();
  
  if (lastLogLevel !== null && lastLogLevel !== currentLevel) {
    console.log(`🔄 ログレベル変更検知: ${lastLogLevel} → ${currentLevel}`);
    if (currentLevel === 'debug') {
      console.log('📊 詳細なデバッグ情報が表示されるようになりました');
    } else {
      console.log('📋 標準的な動作ログのみ表示されます');
    }
  }
  
  lastLogLevel = currentLevel;
  return currentLevel;
};

// ログ出力制御関数
export const logInfo = (message: any, ...args: any[]) => {
  // Info レベルは常に出力（標準的な動作ログ）
  console.log(message, ...args);
};

export const logError = (message: any, ...args: any[]) => {
  // エラーは常に出力
  console.error(message, ...args);
};

export const logWarn = (message: any, ...args: any[]) => {
  // 警告は常に出力
  console.warn(message, ...args);
};

export const logDebug = (message: any, ...args: any[]) => {
  // Debug レベルの場合のみ出力（詳細なデバッグ情報）
  const currentLevel = checkLogLevelChange(); // 変更検知も実行
  if (currentLevel === 'debug') {
    console.log('[DEBUG]', message, ...args);
  }
};

// 後方互換性のためのエイリアス
export const debugLog = logDebug;
export const debugError = logError;
export const debugWarn = logWarn;
export const debugInfo = logInfo;

// 現在のログレベルを取得する関数（外部から参照用）
export const getLogLevel = (): LogLevel => {
  return checkLogLevelChange(); // 変更検知も実行
};

// デバッグ用: 現在の環境情報を出力
export const logEnvironmentInfo = () => {
  if (typeof window !== 'undefined' && window.location) {
    console.log('🔍 Environment Info:', {
      hostname: window.location.hostname,
      protocol: window.location.protocol,
      href: window.location.href,
      'import.meta.env.DEV': (import.meta as any).env?.DEV,
      isDevelopment: isDevelopment
    });
  }
}; 