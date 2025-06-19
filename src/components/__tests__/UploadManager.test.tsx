import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UploadManager } from '../UploadManager';

// Tauri APIのモック
const mockInvoke = vi.fn();
(global as any).__TAURI__ = {
  invoke: mockInvoke,
};

// UploadServiceのモック
vi.mock('../../services/uploadService', () => ({
  UploadService: vi.fn().mockImplementation(() => ({
    uploadFile: vi.fn().mockResolvedValue('success'),
    uploadDirectory: vi.fn().mockResolvedValue('success'),
    getUploadStatus: vi.fn().mockResolvedValue({ status: 'idle' }),
  })),
}));

describe('UploadManager', () => {
  beforeEach(() => {
    mockInvoke.mockClear();
  });

  it('should render upload manager component', () => {
    render(<UploadManager />);
    
    expect(screen.getByText(/アップロード管理/)).toBeInTheDocument();
    expect(screen.getByText(/ファイル選択/)).toBeInTheDocument();
    expect(screen.getByText(/フォルダ選択/)).toBeInTheDocument();
  });

  it('should show file selection dialog when file button is clicked', async () => {
    mockInvoke.mockResolvedValue(['/path/to/file1.txt', '/path/to/file2.txt']);
    
    render(<UploadManager />);
    
    const fileButton = screen.getByText(/ファイル選択/);
    fireEvent.click(fileButton);
    
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('open_file_dialog', {
        multiple: true,
        filters: [{
          name: 'All Files',
          extensions: ['*']
        }]
      });
    });
  });

  it('should show directory selection dialog when folder button is clicked', async () => {
    mockInvoke.mockResolvedValue(['/path/to/directory']);
    
    render(<UploadManager />);
    
    const folderButton = screen.getByText(/フォルダ選択/);
    fireEvent.click(folderButton);
    
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('open_directory_dialog');
    });
  });

  it('should display selected files', async () => {
    const mockFiles = ['/path/to/file1.txt', '/path/to/file2.txt'];
    mockInvoke.mockResolvedValue(mockFiles);
    
    render(<UploadManager />);
    
    const fileButton = screen.getByText(/ファイル選択/);
    fireEvent.click(fileButton);
    
    await waitFor(() => {
      expect(screen.getByText('file1.txt')).toBeInTheDocument();
      expect(screen.getByText('file2.txt')).toBeInTheDocument();
    });
  });

  it('should show upload progress when files are being uploaded', async () => {
    const mockFiles = ['/path/to/file1.txt'];
    mockInvoke.mockResolvedValue(mockFiles);
    
    render(<UploadManager />);
    
    const fileButton = screen.getByText(/ファイル選択/);
    fireEvent.click(fileButton);
    
    await waitFor(() => {
      const uploadButton = screen.getByText(/アップロード開始/);
      fireEvent.click(uploadButton);
    });
    
    // アップロード中の状態を確認
    await waitFor(() => {
      expect(screen.getByText(/アップロード中/)).toBeInTheDocument();
    });
  });
}); 