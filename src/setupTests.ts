import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';

// import.metaのモック
(global as any).import = {
  meta: {
    env: {
      DEV: true,
    },
  },
};

// Tauri APIのモック
(global as any).__TAURI__ = {
  invoke: vi.fn(),
  event: {
    listen: vi.fn(),
    emit: vi.fn(),
  },
  window: {
    appWindow: {
      close: vi.fn(),
      minimize: vi.fn(),
      maximize: vi.fn(),
      unmaximize: vi.fn(),
    },
  },
};

// モックのリセット
beforeEach(() => {
  vi.clearAllMocks();
}); 