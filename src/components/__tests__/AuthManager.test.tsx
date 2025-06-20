import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AuthManager } from '../AuthManager';
import * as TauriCommands from '../../services/tauriCommands';

// TauriCommandsのモック
vi.mock('../../services/tauriCommands');

// @tauri-apps/plugin-shellのモック
vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn(),
}));

describe('AuthManager', () => {
  const mockProps = {
    onAuthSuccess: vi.fn(),
    onAuthError: vi.fn(),
    onLifecycleStatusChange: vi.fn(),
    onHealthStatusChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // デフォルトのモック実装
    vi.mocked(TauriCommands.TauriCommands.loadAwsCredentialsSecure).mockResolvedValue({
      access_key_id: '',
      secret_access_key: '',
      region: 'ap-northeast-1',
      session_token: undefined,
    });
    
    vi.mocked(TauriCommands.TauriCommands.authenticateAws).mockResolvedValue({
      success: true,
      message: '認証成功',
      user_identity: {
        user_id: 'test-user',
        arn: 'arn:aws:iam::123456789012:user/test-user',
        account: '123456789012',
      },
      permissions: ['s3:GetObject', 's3:PutObject'],
    });
    
    vi.mocked(TauriCommands.TauriCommands.testS3BucketAccess).mockResolvedValue({
      success: true,
      message: 'バケットアクセス成功',
      bucket_accessible: true,
    });
    
    vi.mocked(TauriCommands.TauriCommands.getLifecycleStatus).mockResolvedValue({
      enabled: true,
      rule_id: 'test-rule',
      transition_days: 30,
      storage_class: 'STANDARD_IA',
    });
    
    vi.mocked(TauriCommands.TauriCommands.saveAwsCredentialsSecure).mockResolvedValue();
  });

  describe('初期表示', () => {
    it('認証フォームが正しく表示される', () => {
      render(<AuthManager {...mockProps} />);
      
      expect(screen.getByText('設定')).toBeInTheDocument();
      expect(screen.getByText('初期設定')).toBeInTheDocument();
      expect(screen.getByText('手動設定')).toBeInTheDocument();
      expect(screen.getByLabelText('アクセスキーID:')).toBeInTheDocument();
      expect(screen.getByLabelText('シークレットアクセスキー:')).toBeInTheDocument();
      expect(screen.getByLabelText('AWSリージョン:')).toBeInTheDocument();
      expect(screen.getByText('🧪 AWS認証をテストする')).toBeInTheDocument();
    });

    it('初期認証情報が設定される', () => {
      const initialCredentials = {
        access_key_id: 'test-key',
        secret_access_key: 'test-secret',
        region: 'us-east-1',
        session_token: undefined,
      };
      
      render(<AuthManager {...mockProps} initialCredentials={initialCredentials} />);
      
      expect(screen.getByDisplayValue('test-key')).toBeInTheDocument();
      expect(screen.getByDisplayValue('test-secret')).toBeInTheDocument();
      expect(screen.getByDisplayValue('us-east-1')).toBeInTheDocument();
    });

    it('初期バケット名が設定される', () => {
      render(<AuthManager {...mockProps} initialBucketName="test-bucket" />);
      
      // 認証成功後にバケット名入力フィールドが表示される
      // このテストでは認証を成功させる必要がある
      fireEvent.change(screen.getByLabelText('アクセスキーID:'), {
        target: { value: 'test-key' },
      });
      fireEvent.change(screen.getByLabelText('シークレットアクセスキー:'), {
        target: { value: 'test-secret' },
      });
      fireEvent.click(screen.getByText('🧪 AWS認証をテストする'));
      
      waitFor(() => {
        expect(screen.getByDisplayValue('test-bucket')).toBeInTheDocument();
      });
    });
  });

  describe('認証機能', () => {
    it('認証が成功する', async () => {
      render(<AuthManager {...mockProps} />);
      
      // 認証情報を入力
      fireEvent.change(screen.getByLabelText('アクセスキーID:'), {
        target: { value: 'test-key' },
      });
      fireEvent.change(screen.getByLabelText('シークレットアクセスキー:'), {
        target: { value: 'test-secret' },
      });
      
      // 認証ボタンをクリック
      fireEvent.click(screen.getByText('🧪 AWS認証をテストする'));
      
      await waitFor(() => {
        expect(TauriCommands.TauriCommands.authenticateAws).toHaveBeenCalledWith({
          access_key_id: 'test-key',
          secret_access_key: 'test-secret',
          region: 'ap-northeast-1',
          session_token: undefined,
        });
      });
      
      await waitFor(() => {
        expect(mockProps.onAuthSuccess).toHaveBeenCalledWith(
          {
            access_key_id: 'test-key',
            secret_access_key: 'test-secret',
            region: 'ap-northeast-1',
            session_token: undefined,
          },
          ''
        );
      });
    });

    it('認証が失敗する', async () => {
      vi.mocked(TauriCommands.TauriCommands.authenticateAws).mockRejectedValue(new Error('認証失敗'));
      
      render(<AuthManager {...mockProps} />);
      
      // 認証情報を入力
      fireEvent.change(screen.getByLabelText('アクセスキーID:'), {
        target: { value: 'invalid-key' },
      });
      fireEvent.change(screen.getByLabelText('シークレットアクセスキー:'), {
        target: { value: 'invalid-secret' },
      });
      
      // 認証ボタンをクリック
      fireEvent.click(screen.getByText('🧪 AWS認証をテストする'));
      
      await waitFor(() => {
        expect(screen.getByText('認証エラー')).toBeInTheDocument();
        expect(screen.getByText('❌ 認証失敗')).toBeInTheDocument();
      });
      
      expect(mockProps.onAuthError).toHaveBeenCalledWith('認証失敗');
    });

    it('認証情報が不足している場合、ボタンが無効化される', () => {
      render(<AuthManager {...mockProps} />);
      
      const authButton = screen.getByText('🧪 AWS認証をテストする');
      expect(authButton).toBeDisabled();
      
      // アクセスキーのみ入力
      fireEvent.change(screen.getByLabelText('アクセスキーID:'), {
        target: { value: 'test-key' },
      });
      expect(authButton).toBeDisabled();
      
      // シークレットキーも入力
      fireEvent.change(screen.getByLabelText('シークレットアクセスキー:'), {
        target: { value: 'test-secret' },
      });
      expect(authButton).not.toBeDisabled();
    });
  });

  describe('バケットアクセステスト', () => {
    it('バケットアクセステスト機能はAuthManagerから削除されました', () => {
      expect(true).toBe(true);
    });
  });

  describe('ライフサイクル管理', () => {
    beforeEach(async () => {
      // 認証とバケットテストを成功させる
      render(<AuthManager {...mockProps} initialBucketName="test-bucket" />);
      
      fireEvent.change(screen.getByLabelText('アクセスキーID:'), {
        target: { value: 'test-key' },
      });
      fireEvent.change(screen.getByLabelText('シークレットアクセスキー:'), {
        target: { value: 'test-secret' },
      });
      fireEvent.click(screen.getByText('🧪 AWS認証をテストする'));
      
      await waitFor(() => {
        expect(screen.getByText('AWS認証結果')).toBeInTheDocument();
      });
      
      const bucketInput = screen.getByLabelText('S3バケット名:');
      fireEvent.change(bucketInput, { target: { value: 'test-bucket' } });
      const testButton = screen.getByText('アクセスをテスト');
      fireEvent.click(testButton);
      
      await waitFor(() => {
        expect(screen.getByText('バケットアクセステスト結果')).toBeInTheDocument();
      });
    });

    it('ライフサイクル状況が正常に取得される', async () => {
      await waitFor(() => {
        expect(TauriCommands.TauriCommands.getLifecycleStatus).toHaveBeenCalled();
      });
      
      expect(mockProps.onLifecycleStatusChange).toHaveBeenCalledWith({
        enabled: true,
        rule_id: 'test-rule',
        transition_days: 30,
        storage_class: 'STANDARD_IA',
      });
    });

    it('ライフサイクル状況の取得に失敗する', async () => {
      vi.mocked(TauriCommands.TauriCommands.getLifecycleStatus).mockRejectedValue(new Error('ライフサイクル取得失敗'));
      
      // コンポーネントを再レンダリングしてライフサイクルチェックを実行
      render(<AuthManager {...mockProps} initialBucketName="test-bucket" />);
      
      await waitFor(() => {
        expect(screen.getByText('認証エラー')).toBeInTheDocument();
        expect(screen.getByText('❌ ライフサイクル状況の取得に失敗しました')).toBeInTheDocument();
      });
    });
  });

  describe('CloudFormation設定', () => {
    it('CloudFormation設定リンクが正しく動作する', async () => {
      const { open } = await import('@tauri-apps/plugin-shell');
      
      render(<AuthManager {...mockProps} />);
      
      const cfLink = screen.getByText('ここをクリックしてください');
      fireEvent.click(cfLink);
      
      expect(open).toHaveBeenCalledWith(
        'https://console.aws.amazon.com/cloudformation/home?region=ap-northeast-1#/stacks/create/review?templateURL=https%3A%2F%2Freelvault-template.s3.ap-northeast-1.amazonaws.com%2Freelvault-setup-auto.yaml&stackName=ReelVaultSetup'
      );
    });

    it('CloudFormation設定でエラーが発生する', async () => {
      const { open } = await import('@tauri-apps/plugin-shell');
      vi.mocked(open).mockRejectedValue(new Error('ブラウザ起動失敗'));
      
      render(<AuthManager {...mockProps} />);
      
      const cfLink = screen.getByText('ここをクリックしてください');
      fireEvent.click(cfLink);
      
      await waitFor(() => {
        expect(screen.getByText('認証エラー')).toBeInTheDocument();
        expect(screen.getByText(/ブラウザでURLを開けませんでした/)).toBeInTheDocument();
      });
    });
  });

  describe('エラーハンドリング', () => {
    it('エラーメッセージを閉じることができる', () => {
      render(<AuthManager {...mockProps} />);
      
      // 認証を失敗させる
      vi.mocked(TauriCommands.TauriCommands.authenticateAws).mockRejectedValue(new Error('テストエラー'));
      
      fireEvent.change(screen.getByLabelText('アクセスキーID:'), {
        target: { value: 'test-key' },
      });
      fireEvent.change(screen.getByLabelText('シークレットアクセスキー:'), {
        target: { value: 'test-secret' },
      });
      fireEvent.click(screen.getByText('🧪 AWS認証をテストする'));
      
      waitFor(() => {
        const closeButton = screen.getByText('×');
        fireEvent.click(closeButton);
        
        expect(screen.queryByText('認証エラー')).not.toBeInTheDocument();
      });
    });
  });
}); 