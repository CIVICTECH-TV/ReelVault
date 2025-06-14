/**
 * デバッグ用ヘルパー関数
 * 開発環境でのみconsole出力を行う
 */

const isDevelopment = (import.meta as any).env.DEV;

export const debugLog = (...args: any[]) => {
  if (isDevelopment) {
    console.log(...args);
  }
};

export const debugError = (...args: any[]) => {
  if (isDevelopment) {
    console.error(...args);
  }
};

export const debugWarn = (...args: any[]) => {
  if (isDevelopment) {
    console.warn(...args);
  }
};

export const debugInfo = (...args: any[]) => {
  if (isDevelopment) {
    console.info(...args);
  }
};

// 開発環境かどうかを判定する関数
export const isDev = () => isDevelopment; 