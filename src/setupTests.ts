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

// @tauri-apps/apiのモック
vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
  emit: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn(),
}));

// モックのリセット
beforeEach(() => {
  vi.clearAllMocks();
}); 