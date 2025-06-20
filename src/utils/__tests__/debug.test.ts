import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logDebug, logInfo, logError, logWarn, getLogLevel, logEnvironmentInfo, isDev, debugLog, debugError, debugWarn, debugInfo } from '../debug';

// console.logのモック
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('debug utility', () => {
  beforeEach(() => {
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockConsoleWarn.mockClear();
    // localStorageをモック
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      writable: true,
    });
  });

  it('should log debug message when debug level is set', () => {
    // localStorageでdebugレベルを設定
    (window.localStorage.getItem as any).mockReturnValue(
      JSON.stringify({ app_settings: { log_level: 'debug' } })
    );

    const testMessage = 'Test debug message';
    const testData = { key: 'value' };

    logDebug(testMessage, testData);

    expect(mockConsoleLog).toHaveBeenCalledWith(
      '[DEBUG]',
      testMessage,
      testData
    );
  });

  it('should not log debug message when log level is info', () => {
    // localStorageでinfoレベルを設定
    (window.localStorage.getItem as any).mockReturnValue(
      JSON.stringify({ app_settings: { log_level: 'info' } })
    );
    
    // 一度実行してログレベルを設定（通知ログを出力）
    getLogLevel();
    
    // ログをクリアしてからテスト
    mockConsoleLog.mockClear();
    
    const testMessage = 'Test debug message';
    logDebug(testMessage);

    // debugログは出力されない（通知ログは別途テスト）
    expect(mockConsoleLog).not.toHaveBeenCalledWith('[DEBUG]', testMessage);
  });

  it('should log level change notification when level changes', () => {
    // 最初にdebugレベルを設定
    (window.localStorage.getItem as any).mockReturnValue(
      JSON.stringify({ app_settings: { log_level: 'debug' } })
    );
    getLogLevel(); // debugレベルを設定
    mockConsoleLog.mockClear();
    
    // infoレベルに変更
    (window.localStorage.getItem as any).mockReturnValue(
      JSON.stringify({ app_settings: { log_level: 'info' } })
    );
    getLogLevel(); // 変更通知が出力される
    
    expect(mockConsoleLog).toHaveBeenCalledWith('🔄 ログレベル変更検知: debug → info');
    expect(mockConsoleLog).toHaveBeenCalledWith('📋 標準的な動作ログのみ表示されます');
  });

  it('should always log info messages', () => {
    const testMessage = 'Test info message';

    logInfo(testMessage);

    expect(mockConsoleLog).toHaveBeenCalledWith(testMessage);
  });

  it('should always log error messages', () => {
    const testMessage = 'Test error message';

    logError(testMessage);

    expect(mockConsoleError).toHaveBeenCalledWith(testMessage);
  });

  it('should always log warning messages', () => {
    const testMessage = 'Test warning message';

    logWarn(testMessage);

    expect(mockConsoleWarn).toHaveBeenCalledWith(testMessage);
  });

  it('should return current log level', () => {
    (window.localStorage.getItem as any).mockReturnValue(
      JSON.stringify({ app_settings: { log_level: 'debug' } })
    );

    const level = getLogLevel();

    expect(level).toBe('debug');
  });
});

describe('logEnvironmentInfo', () => {
  beforeEach(() => {
    mockConsoleLog.mockClear();
  });

  it('should log environment info when window.location exists', () => {
    // window.locationをモック
    const originalWindow = global.window;
    // @ts-ignore
    (globalThis as any).window = Object.create(window);
    Object.defineProperty((globalThis as any).window, 'location', {
      value: {
        hostname: 'localhost',
        protocol: 'http:',
        href: 'http://localhost/',
      },
      writable: true,
    });
    // import.meta.env.DEVをモック
    const originalImportMeta = (globalThis as any).import?.meta;
    (globalThis as any).import = { meta: { env: { DEV: true } } };

    logEnvironmentInfo();
    expect(mockConsoleLog).toHaveBeenCalledWith(
      '🔍 Environment Info:',
      expect.objectContaining({
        hostname: 'localhost',
        protocol: 'http:',
        href: 'http://localhost/',
        'import.meta.env.DEV': true,
        isDevelopment: true
      })
    );

    // 後始末
    (globalThis as any).window = originalWindow;
    if (originalImportMeta) (globalThis as any).import = { meta: originalImportMeta };
  });

  it('should not log when window.location does not exist', () => {
    // window.locationをundefinedに
    const originalWindow = global.window;
    (globalThis as any).window = {};
    logEnvironmentInfo();
    expect(mockConsoleLog).not.toHaveBeenCalled();
    (globalThis as any).window = originalWindow;
  });
});

describe('isDev', () => {
  it('should return true when import.meta.env.DEV is true', () => {
    vi.stubEnv('DEV', 'true');
    const result = isDev();
    expect(result).toBe(true);
    vi.unstubAllEnvs();
  });

  it.skip('should return false when import.meta.env.DEV is false', () => {
    vi.stubEnv('DEV', 'false');
    const result = isDev();
    expect(result).toBe(false);
    vi.unstubAllEnvs();
  });

  it.skip('should return false when import.meta.env.DEV is undefined', () => {
    vi.stubEnv('DEV', '');
    const result = isDev();
    expect(result).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('getCurrentLogLevel (exception path)', () => {
  it('should log error and return info when localStorage value is broken', () => {
    // localStorage.getItemが壊れた値を返す
    (window.localStorage.getItem as any).mockReturnValue('not-json');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const level = getLogLevel();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to get log level from config:'),
      expect.any(Error)
    );
    expect(level).toBe('info');
    errorSpy.mockRestore();
  });
});

describe('alias functions', () => {
  it('debugLog should behave as logDebug', () => {
    (window.localStorage.getItem as any).mockReturnValue(
      JSON.stringify({ app_settings: { log_level: 'debug' } })
    );
    const testMessage = 'alias debug';
    debugLog(testMessage);
    expect(mockConsoleLog).toHaveBeenCalledWith('[DEBUG]', testMessage);
  });

  it('debugError should behave as logError', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const testMessage = 'alias error';
    debugError(testMessage);
    expect(errorSpy).toHaveBeenCalledWith(testMessage);
    errorSpy.mockRestore();
  });

  it('debugWarn should behave as logWarn', () => {
    const testMessage = 'alias warn';
    debugWarn(testMessage);
    expect(mockConsoleWarn).toHaveBeenCalledWith(testMessage);
  });

  it('debugInfo should behave as logInfo', () => {
    const testMessage = 'alias info';
    debugInfo(testMessage);
    expect(mockConsoleLog).toHaveBeenCalledWith(testMessage);
  });
}); 