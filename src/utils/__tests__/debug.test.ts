import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logDebug, logInfo, logError, logWarn, getLogLevel } from '../debug';

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