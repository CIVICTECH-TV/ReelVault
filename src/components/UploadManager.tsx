import React, { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { listen } from '@tauri-apps/api/event';
import { TauriCommands, UploadItem, UploadStatus, UploadStatistics, FileSelection, S3KeyConfig, UploadConfig, AwsCredentials, UploadProgressInfo } from '../types/tauri-commands';
import './UploadManager.css';

interface UploadManagerProps {
  awsCredentials?: AwsCredentials;
  bucketName?: string;
  onUploadComplete?: (items: UploadItem[]) => void;
  onError?: (error: string) => void;
}

// 無料版制限
const FREE_TIER_LIMITS = {
  MAX_FILE_SIZE_GB: 160, // AWS S3コンソール相当
  MAX_TOTAL_SIZE_GB: 160,
  MAX_CONCURRENT_UPLOADS: 1, // 単発処理
  MAX_CONCURRENT_PARTS: 1, // チャンク順次処理
  SUPPORTED_FORMATS: ['*'], // 全形式対応
};

// プレミアム版制限
const PREMIUM_TIER_LIMITS = {
  MAX_FILE_SIZE_GB: 5000, // 5TB
  MAX_TOTAL_SIZE_GB: 50000, // 50TB
  MAX_CONCURRENT_UPLOADS: 8, // 8ファイル同時
  MAX_CONCURRENT_PARTS: 8, // 8チャンク並列
  SUPPORTED_FORMATS: ['*'], // 全形式対応
};

export const UploadManager: React.FC<UploadManagerProps> = ({
  awsCredentials,
  bucketName,
  onUploadComplete,
  onError
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [uploadStats, setUploadStats] = useState<UploadStatistics | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileSelection | null>(null);
  const [uploadConfig, setUploadConfig] = useState<UploadConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // 🎯 設定変更用のstate
  const [showSettings, setShowSettings] = useState(false);
  const [tempConfig, setTempConfig] = useState<Partial<UploadConfig>>({});
  const [currentTier, setCurrentTier] = useState<'Free' | 'Premium'>('Free');
  
  // デバッグ用: propsの状態をログ出力
  useEffect(() => {
    console.log('🔍 UploadManager props状態:', {
      awsCredentials: awsCredentials ? 'あり' : 'なし',
      bucketName: bucketName || 'なし',
      uploadConfig: uploadConfig ? 'あり' : 'なし'
    });
  }, [awsCredentials, bucketName, uploadConfig]);
  
  // ネイティブファイルダイアログを使用するため、refは不要
  const [forceUpdate, setForceUpdate] = useState(0);
  const progressRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // 初期化
  useEffect(() => {
    const initializeUpload = async () => {
      if (!awsCredentials || !bucketName) {
        console.log('AWS credentials or bucket name not available');
        return;
      }

      try {
        // 🎯 デフォルトはプレミアム版設定
        const defaultConfig = createConfig(awsCredentials, bucketName, 'Premium');
        
        // 🔍 設定内容をデバッグ出力
        console.log('🔧 生成された設定:', {
          tier: defaultConfig.tier,
          chunk_size_mb: defaultConfig.chunk_size_mb,
          max_concurrent_uploads: defaultConfig.max_concurrent_uploads,
          max_concurrent_parts: defaultConfig.max_concurrent_parts,
          adaptive_chunk_size: defaultConfig.adaptive_chunk_size,
          min_chunk_size_mb: defaultConfig.min_chunk_size_mb,
          max_chunk_size_mb: defaultConfig.max_chunk_size_mb
        });
        
        // 🗑️ 古い設定をクリアして新しい設定で確実に初期化
        console.log('🗑️ 古いキューをクリア中...');
        await TauriCommands.clearUploadQueue();
        
        console.log('🔄 新しい設定で初期化中...');
        await TauriCommands.initializeUploadQueue(defaultConfig);
        
        setUploadConfig(defaultConfig);
        setTempConfig(defaultConfig);
        setCurrentTier('Premium');
        
        console.log('✅ Upload system initialized with premium tier config');
      } catch (error) {
        console.error('Failed to initialize upload system:', error);
        setError(`アップロードシステムの初期化に失敗しました: ${error}`);
      }
    };

    initializeUpload();
  }, [awsCredentials, bucketName]);

  // uploadQueueの変更を監視して強制的に再レンダリング
  useEffect(() => {
    console.log(`🎨 uploadQueue変更検知: ${uploadQueue.length}個のファイル`);
    uploadQueue.forEach((item, index) => {
      console.log(`  [${index}] ${item.file_name}: ${item.uploaded_bytes}/${item.file_size} bytes (${((item.uploaded_bytes / item.file_size) * 100).toFixed(1)}%)`);
    });
    
    // 強制的に再レンダリング
    setForceUpdate(prev => prev + 1);
  }, [uploadQueue]);

  // 進捗更新のリスナー
  useEffect(() => {
    if (!uploadConfig) return;
    
    console.log('🎧 進捗リスナーを設定中...');
    console.log('🎧 リスナー設定時のuploadConfig:', uploadConfig);
    
    // テスト用のイベントリスナーも追加
    const testUnlisten = listen('test-event', (event) => {
      console.log('🧪 テストイベント受信:', event);
    });
    
    const unlisten = listen<UploadProgressInfo>('upload-progress', (event) => {
      const progress = event.payload;
      
      // 全ての進捗イベントをログ出力（デバッグ用）
      console.log('📊 進捗イベント受信:', {
        item_id: progress.item_id,
        percentage: progress.percentage.toFixed(1),
        uploaded: `${(progress.uploaded_bytes / (1024 * 1024)).toFixed(1)}MB`,
        total: `${(progress.total_bytes / (1024 * 1024)).toFixed(1)}MB`,
        speed: progress.speed_mbps.toFixed(1),
        status: progress.status
      });
      
      // 直接DOM操作で進捗バーを即時に更新
      const progressBarElement = document.querySelector(`[data-item-id="${progress.item_id}"] .progress-fill`);
      const progressTextElement = document.querySelector(`[data-item-id="${progress.item_id}"] .progress-text`);
      const progressBytesElement = document.querySelector(`[data-item-id="${progress.item_id}"] .progress-bytes`);
      const speedElement = document.querySelector(`[data-item-id="${progress.item_id}"] .upload-speed`);
      
      if (progressBarElement) {
        (progressBarElement as HTMLElement).style.width = `${Math.max(0, Math.min(100, progress.percentage))}%`;
        (progressBarElement as HTMLElement).style.backgroundColor = progress.status === UploadStatus.Completed ? '#22c55e' : '#3b82f6';
        console.log(`🎨 直接DOM更新: 進捗バー ${progress.percentage.toFixed(1)}%`);
      }
      
      if (progressTextElement) {
        progressTextElement.textContent = `${progress.percentage.toFixed(1)}%`;
        console.log(`🎨 直接DOM更新: 進捗テキスト ${progress.percentage.toFixed(1)}%`);
      }
      
      if (progressBytesElement) {
        const formatBytes = (bytes: number) => {
          if (bytes === 0) return '0 B';
          const k = 1024;
          const sizes = ['B', 'KB', 'MB', 'GB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };
        progressBytesElement.textContent = `${formatBytes(progress.uploaded_bytes)} / ${formatBytes(progress.total_bytes)}`;
      }
      
      if (speedElement) {
        speedElement.textContent = `⚡ ${progress.speed_mbps.toFixed(2)} MB/s`;
      }
      
      // DOM直接操作は削除 - React状態更新に一本化

      // React状態更新を強制的に即時実行（flushSyncで自動バッチングを無効化）
      flushSync(() => {
        setUploadQueue(prev => {
          const updated = prev.map(item => {
            if (item.id === progress.item_id) {
              console.log(`🔄 ファイル進捗更新: ${item.file_name} -> ${progress.percentage.toFixed(1)}%`);
              const updatedItem = { 
                ...item, 
                progress: progress.percentage,
                uploaded_bytes: progress.uploaded_bytes,
                speed_mbps: progress.speed_mbps,
                eta_seconds: progress.eta_seconds,
                status: progress.status,
                // 完了時の処理
                ...(progress.status === UploadStatus.Completed && {
                  completed_at: new Date().toISOString()
                })
              };
              
              // 即時にUI更新確認
              console.log(`✅ UI更新確認: ${updatedItem.file_name} = ${updatedItem.progress.toFixed(1)}% (${updatedItem.status})`);
              return updatedItem;
            }
            return item;
          });
          
          console.log(`🎨 状態更新実行: キュー内${updated.length}個のファイル`);
          return updated;
        });
      });
      
      // 統計情報も即時に更新（flushSyncで強制反映）
      flushSync(() => {
        setUploadStats(prev => {
          if (!prev) return prev;
          
          const newStats = {
            ...prev,
            uploaded_bytes: prev.uploaded_bytes + (progress.uploaded_bytes - (prev.uploaded_bytes || 0)),
            average_speed_mbps: progress.speed_mbps
          };
          
          console.log(`📊 統計情報更新: ${newStats.uploaded_bytes}/${newStats.total_bytes} bytes`);
          return newStats;
        });
      });
      
      // 強制的にReactの再描画をトリガー
      setTimeout(() => {
        console.log(`🎨 強制再描画トリガー: ${progress.item_id} ${progress.percentage.toFixed(1)}%`);
        setForceUpdate(prev => prev + 1);
      }, 0);
      
      // 完了時の統計情報表示と状態管理
      if (progress.status === UploadStatus.Completed) {
        const fileSizeMB = (progress.total_bytes / (1024 * 1024)).toFixed(2);
        const avgSpeedMBps = progress.speed_mbps || 0;
        const totalTimeSec = progress.total_bytes > 0 ? progress.total_bytes / (1024 * 1024) / Math.max(avgSpeedMBps, 0.1) : 0;
        
        console.log(`✅ アップロード完了: ${progress.item_id}`);
        console.log(`📊 統計情報:
          - ファイルサイズ: ${fileSizeMB} MB
          - 平均速度: ${avgSpeedMBps.toFixed(1)} MB/s
          - 総時間: ${totalTimeSec.toFixed(0)}秒
          - 進捗: ${progress.percentage.toFixed(1)}%`);
        
        // 完了時に統計情報を更新
        setTimeout(async () => {
          try {
            const stats = await TauriCommands.getUploadQueueStatus();
            setUploadStats(stats);
            console.log('📊 統計情報更新完了:', stats);
            
            // 全ファイル完了チェック
            const queueItems = await TauriCommands.getUploadQueueItems();
            const allCompleted = queueItems.every(item => 
              item.status === UploadStatus.Completed || 
              item.status === UploadStatus.Failed || 
              item.status === UploadStatus.Cancelled
            );
            
            if (allCompleted) {
              console.log('🎉 全てのアップロードが完了しました（リアルタイム検知）');
              // 完了状態も即時に反映
              flushSync(() => {
                setIsUploading(false);
              });
              TauriCommands.stopUploadProcessing().catch(err => 
                console.warn('アップロード停止コマンドの実行に失敗:', err)
              );
            }
          } catch (err) {
            console.error('完了時の統計更新に失敗:', err);
          }
        }, 100);
      }
    });

    return () => {
      console.log('🎧 進捗リスナーを解除中...');
      unlisten.then(f => f());
      testUnlisten.then(f => f());
    };
  }, [uploadConfig]); // uploadConfigに依存

  // アップロードキューの状態を定期的に更新（リアルタイム進捗テスト中は無効化）
  useEffect(() => {
    if (!uploadConfig || isUploading) return; // アップロード中は定期ポーリングを停止

    console.log('📊 定期ポーリング開始（アップロード停止中のみ）');
    
    const interval = setInterval(async () => {
      try {
        const [queueItems, stats] = await Promise.all([
          TauriCommands.getUploadQueueItems(),
          TauriCommands.getUploadQueueStatus()
        ]);
        
        console.log('📊 定期ポーリング実行:', queueItems.map(item => ({
          name: item.file_name,
          status: item.status,
          progress: item.progress.toFixed(1)
        })));
        
        // アップロード中でない場合のみ更新
        setUploadQueue(queueItems);
        setUploadStats(stats);
        
        // アップロード完了チェック
        const inProgress = queueItems.some(item => 
          item.status === UploadStatus.InProgress || item.status === UploadStatus.Pending
        );
        
        const allCompleted = queueItems.length > 0 && queueItems.every(item => 
          item.status === UploadStatus.Completed || 
          item.status === UploadStatus.Failed || 
          item.status === UploadStatus.Cancelled
        );
        
        if (allCompleted && !inProgress) {
          console.log('🎉 全てのアップロードが完了しました（定期チェック）');
          const completedItems = queueItems.filter(item => item.status === UploadStatus.Completed);
          onUploadComplete?.(completedItems);
        }
      } catch (err) {
        console.error('アップロード状態の更新に失敗:', err);
      }
    }, 10000); // 10秒間隔に延長

    return () => {
      console.log('📊 定期ポーリング停止');
      clearInterval(interval);
    };
  }, [uploadConfig, isUploading, onUploadComplete]);

  // ファイルサイズの検証
  const validateFileSize = (files: File[]): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    let totalSizeGB = 0;

    for (const file of files) {
      const fileSizeGB = file.size / (1024 * 1024 * 1024);
      totalSizeGB += fileSizeGB;

      if (fileSizeGB > FREE_TIER_LIMITS.MAX_FILE_SIZE_GB) {
        errors.push(`${file.name}: ファイルサイズが制限を超えています (${fileSizeGB.toFixed(2)}GB > ${FREE_TIER_LIMITS.MAX_FILE_SIZE_GB}GB)`);
      }
    }

    if (totalSizeGB > FREE_TIER_LIMITS.MAX_TOTAL_SIZE_GB) {
      errors.push(`合計ファイルサイズが制限を超えています (${totalSizeGB.toFixed(2)}GB > ${FREE_TIER_LIMITS.MAX_TOTAL_SIZE_GB}GB)`);
    }

    return { valid: errors.length === 0, errors };
  };

  // ファイルダイアログを開く（Tauriネイティブダイアログを使用）
  const handleFileDialogOpen = useCallback(async () => {
    if (!uploadConfig) {
      setError('アップロード設定が初期化されていません');
      return;
    }

    try {
      console.log('🗂️ ネイティブファイルダイアログを開いています...');
      const fileSelection = await TauriCommands.openFileDialog(true, undefined);
      
      console.log('📁 ファイル選択結果:', fileSelection);
      
      if (fileSelection.file_count === 0) {
        console.log('ファイルが選択されませんでした');
        return;
      }

      // 無料版制限チェック
      const totalSizeGB = fileSelection.total_size / (1024 * 1024 * 1024);
      if (totalSizeGB > FREE_TIER_LIMITS.MAX_TOTAL_SIZE_GB) {
        setError(`選択されたファイルの合計サイズ（${totalSizeGB.toFixed(2)}GB）が制限（${FREE_TIER_LIMITS.MAX_TOTAL_SIZE_GB}GB）を超えています`);
        return;
      }

      setSelectedFiles(fileSelection);
      setError(null);
      console.log('✅ ファイル選択完了:', fileSelection);
    } catch (err) {
      console.error('ファイル選択エラー:', err);
      setError(`ファイル選択エラー: ${err}`);
    }
  }, [uploadConfig]);

  // ドラッグ&ドロップ処理（一旦無効化 - ネイティブファイルダイアログを使用するため）
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // ドラッグ&ドロップは無効化
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // ドラッグ&ドロップは無効化
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // ドラッグ&ドロップは無効化
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // ドラッグ&ドロップは無効化 - ネイティブファイルダイアログを使用
    console.log('ドラッグ&ドロップは現在無効です。ファイル選択ボタンを使用してください。');
  }, []);

  // アップロード開始
  const handleStartUpload = useCallback(async () => {
    if (!uploadConfig) {
      setError('アップロード設定が初期化されていません');
      return;
    }

    // selectedFilesがある場合は、まずキューに追加
    if (selectedFiles && selectedFiles.file_count > 0) {
      try {
        console.log('📋 選択されたファイルをキューに追加中...');
        
        // S3キー設定
        const s3KeyConfig = {
          prefix: uploadConfig.s3_key_prefix,
          use_date_folder: true,
          preserve_directory_structure: false,
          custom_naming_pattern: undefined,
        };

        // ネイティブファイルダイアログで取得した実際のファイルパスを使用
        await TauriCommands.addFilesToUploadQueue(selectedFiles.selected_files, s3KeyConfig);
        console.log(`✅ ${selectedFiles.file_count}個のファイルをキューに追加しました`);

        // キューの状態を更新
        const [queueItems, stats] = await Promise.all([
          TauriCommands.getUploadQueueItems(),
          TauriCommands.getUploadQueueStatus()
        ]);
        
        setUploadQueue(queueItems);
        setUploadStats(stats);
        console.log('📊 キュー状態更新完了:', { items: queueItems.length });
        
        // 更新されたキューが空の場合はエラー
        if (queueItems.length === 0) {
          setError('ファイルをキューに追加できませんでした。ファイルが存在しないか、アクセスできません。');
          return;
        }
        
      } catch (err) {
        console.error('キューへの追加に失敗:', err);
        setError(`ファイルをキューに追加できませんでした: ${err}`);
        return;
      }
    } else {
      // selectedFilesがない場合は、既存のキューをチェック
      if (uploadQueue.length === 0) {
        setError('アップロードするファイルがありません。まずファイルを選択してください。');
        return;
      }
    }

    try {
      setIsUploading(true);
      setError(null);
      
      console.log('アップロード処理を開始します');
      await TauriCommands.startUploadProcessing();
      
      console.log('アップロード処理が開始されました');
    } catch (err) {
      const errorMsg = `アップロード開始に失敗しました: ${err}`;
      setError(errorMsg);
      onError?.(errorMsg);
      setIsUploading(false);
    }
  }, [uploadConfig, selectedFiles, uploadQueue.length, onError]);

  // アップロード停止
  const handleStopUpload = useCallback(async () => {
    try {
      await TauriCommands.stopUploadProcessing();
      setIsUploading(false);
    } catch (err) {
      console.error('アップロード停止に失敗:', err);
    }
  }, []);

  // キューのクリア
  const handleClearQueue = useCallback(async () => {
    try {
      await TauriCommands.clearUploadQueue();
      setUploadQueue([]);
      setSelectedFiles(null);
      setError(null);
    } catch (err) {
      console.error('キューのクリアに失敗:', err);
    }
  }, []);

  // アイテムの再試行
  const handleRetryItem = useCallback(async (itemId: string) => {
    try {
      await TauriCommands.retryUploadItem(itemId);
    } catch (err) {
      console.error('再試行に失敗:', err);
    }
  }, []);

  // ファイルサイズのフォーマット
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 全体進捗の計算（改善版：数値型チェックと安全な計算）
  const getOverallProgress = (): number => {
    console.log(`🔍 getOverallProgress呼び出し: uploadQueue.length=${uploadQueue.length}`);
    
    if (uploadQueue.length === 0) {
      console.log(`⚠️ uploadQueueが空のため、全体進捗は0%`);
      return 0;
    }
    
    // 安全な数値計算
    let totalBytes = 0;
    let uploadedBytes = 0;
    
    console.log(`🔍 各ファイルの送信済み容量（安全計算）:`);
    uploadQueue.forEach((item, index) => {
      // 数値型チェックと安全な変換
      const fileSize = Number(item.file_size) || 0;
      const uploaded = Number(item.uploaded_bytes) || 0;
      
      totalBytes += fileSize;
      uploadedBytes += uploaded;
      
      console.log(`  [${index}] ${item.file_name}:`);
      console.log(`    - uploaded_bytes: ${uploaded} (元: ${item.uploaded_bytes}, 型: ${typeof item.uploaded_bytes})`);
      console.log(`    - file_size: ${fileSize} (元: ${item.file_size}, 型: ${typeof item.file_size})`);
      console.log(`    - progress: ${item.progress}%`);
      console.log(`    - status: ${item.status}`);
      
      // 個別ファイルの進捗も確認
      if (fileSize > 0) {
        const individualProgress = (uploaded / fileSize) * 100;
        console.log(`    - 個別進捗計算: ${individualProgress.toFixed(1)}%`);
      }
    });
    
    console.log(`🔍 合計（安全計算）: ${uploadedBytes}/${totalBytes} bytes`);
    
    if (totalBytes === 0) {
      console.log(`⚠️ totalBytesが0のため、全体進捗は0%`);
      return 0;
    }
    
    // 安全な割り算
    const progress = (uploadedBytes / totalBytes) * 100;
    
    // NaN や Infinity のチェック
    if (!isFinite(progress)) {
      console.error(`❌ 無効な進捗値: ${progress}, uploadedBytes=${uploadedBytes}, totalBytes=${totalBytes}`);
      return 0;
    }
    
    const finalProgress = Math.round(Math.min(100, Math.max(0, progress)));
    
    console.log(`🔍 計算結果（安全）: ${progress.toFixed(2)}% -> ${finalProgress}%`);
    
    // 異常値の詳細チェック
    if (finalProgress === 0 && uploadedBytes > 0) {
      console.error(`❌ 0%表示問題検出!`);
      console.error(`  - uploadedBytes: ${uploadedBytes}`);
      console.error(`  - totalBytes: ${totalBytes}`);
      console.error(`  - progress計算: ${progress.toFixed(2)}%`);
      console.error(`  - uploadQueue詳細:`, uploadQueue.map(item => ({
        name: item.file_name,
        uploaded_bytes: item.uploaded_bytes,
        uploaded_bytes_type: typeof item.uploaded_bytes,
        file_size: item.file_size,
        file_size_type: typeof item.file_size,
        progress: item.progress,
        status: item.status
      })));
    }
    
    return finalProgress;
  };

  // ファイル数ベースの進捗（リアルタイム - uploadQueueベース）
  const getFileProgress = (): { completed: number; total: number } => {
    if (uploadQueue.length === 0) return { completed: 0, total: 0 };
    
    const completed = uploadQueue.filter(item => 
      item.status === UploadStatus.Completed
    ).length;
    
    return { 
      completed, 
      total: uploadQueue.length 
    };
  };

  // リアルタイム統計情報の計算（シンプルに：送信済み容量を直接合計）
  const getRealTimeStats = () => {
    if (uploadQueue.length === 0) return null;
    
    let totalBytes = 0;
    let uploadedBytes = 0;
    let totalSpeed = 0;
    let activeUploads = 0;
    
    uploadQueue.forEach(item => {
      totalBytes += item.file_size;
      uploadedBytes += item.uploaded_bytes; // 直接使用！
      
      if (item.status === UploadStatus.InProgress) {
        totalSpeed += item.speed_mbps; // 合計速度（平均ではない）
        activeUploads++;
      }
    });
    
    return {
      totalBytes,
      uploadedBytes,
      totalSpeed, // 合計速度に変更
      activeUploads
    };
  };

  // 🎯 統一された設定生成関数
  const createConfig = (credentials: AwsCredentials, bucket: string, tier: 'Free' | 'Premium'): UploadConfig => {
    // 基本設定（共通）
    const baseConfig = {
      aws_credentials: credentials,
      bucket_name: bucket,
      auto_create_metadata: true,
      s3_key_prefix: 'uploads',
    };

    if (tier === 'Free') {
      return {
        ...baseConfig,
        // 無料版制限
        max_concurrent_uploads: 1,      // 1ファイルずつ
        chunk_size_mb: 5,               // 5MB固定
        retry_attempts: 3,              // 3回まで
        timeout_seconds: 600,           // 10分
        max_concurrent_parts: 1,        // チャンクも1つずつ（順次処理）
        adaptive_chunk_size: false,     // 固定サイズ
        min_chunk_size_mb: 5,          // 5MB固定
        max_chunk_size_mb: 5,          // 5MB固定
        bandwidth_limit_mbps: undefined, // 制限なし
        enable_resume: false,           // 再開機能なし
        tier: 'Free',
      };
    } else {
      return {
        ...baseConfig,
        // プレミアム版機能
        max_concurrent_uploads: 8,      // 8ファイル同時
        chunk_size_mb: 10,              // デフォルト10MB
        retry_attempts: 10,             // 10回まで
        timeout_seconds: 1800,          // 30分
        max_concurrent_parts: 8,        // 8チャンク並列
        adaptive_chunk_size: true,      // 動的最適化
        min_chunk_size_mb: 5,          // 最小5MB（S3制限準拠）
        max_chunk_size_mb: 100,        // 最大100MB
        bandwidth_limit_mbps: undefined, // 制限なし（設定可能）
        enable_resume: true,            // 再開機能あり
        tier: 'Premium',
      };
    }
  };

  const handleTierChange = (tier: 'Free' | 'Premium') => {
    if (!awsCredentials || !bucketName) return;
    
    const newConfig = createConfig(awsCredentials, bucketName, tier);
    setTempConfig(newConfig);
    setCurrentTier(tier);
  };

  const applySettings = async () => {
    if (!tempConfig || !awsCredentials || !bucketName) return;
    
    try {
      const newConfig = { ...tempConfig } as UploadConfig;
      setUploadConfig(newConfig);
      
      // 新しい設定でキューを再初期化
      await TauriCommands.initializeUploadQueue(newConfig);
      setShowSettings(false);
      setError(null);
    } catch (err) {
      setError(`設定の適用に失敗しました: ${err}`);
    }
  };

  const resetSettings = () => {
    if (uploadConfig) {
      setTempConfig(uploadConfig);
      setCurrentTier(uploadConfig.tier);
    }
    setShowSettings(false);
  };

  return (
    <div className="upload-manager">
      <div className="upload-header">
        <h3>💾 ファイルバックアップ</h3>
        <div className="upload-controls">
          <button 
            className="btn-primary" 
            onClick={handleFileDialogOpen}
            disabled={isUploading}
          >
            📁 ファイル選択
          </button>
          <button 
            className="btn-secondary" 
            onClick={() => setShowSettings(!showSettings)}
          >
            ⚙️ 設定
          </button>
        </div>
      </div>

      {/* 🧪 デバッグ情報 */}
      <div style={{ 
        padding: '10px', 
        backgroundColor: '#f0f8ff', 
        border: '1px solid #0066cc',
        margin: '10px 0',
        fontSize: '12px'
      }}>
        <strong>🔍 デバッグ情報:</strong><br/>
        uploadConfig: {uploadConfig ? '✅ 設定済み' : '❌ 未設定'}<br/>
        {uploadConfig && (
          <>
            ├─ tier: {uploadConfig.tier}<br/>
            ├─ max_concurrent_uploads: {uploadConfig.max_concurrent_uploads}<br/>
            ├─ max_concurrent_parts: {uploadConfig.max_concurrent_parts}<br/>
            ├─ chunk_size_mb: {uploadConfig.chunk_size_mb}<br/>
            ├─ adaptive_chunk_size: {uploadConfig.adaptive_chunk_size ? '✅' : '❌'}<br/>
            ├─ retry_attempts: {uploadConfig.retry_attempts}<br/>
            └─ enable_resume: {uploadConfig.enable_resume ? '✅' : '❌'}<br/>
          </>
        )}
        uploadQueue: {uploadQueue.length}個のファイル<br/>
        isUploading: {isUploading ? '✅ アップロード中' : '❌ 停止中'}<br/>
        awsCredentials: {awsCredentials ? '✅ あり' : '❌ なし'}<br/>
        bucketName: {bucketName || '❌ 未設定'}
      </div>

      {error && (
        <div className="upload-error">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="error-close">×</button>
        </div>
      )}

      {/* ファイル選択エリア */}
      <div 
        className={`upload-drop-zone ${isDragOver ? 'drag-over' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleFileDialogOpen}
      >
        <div className="drop-zone-content">
          <div className="upload-icon">📁</div>
          <div className="drop-zone-text">
            <p>ファイルをドラッグ&ドロップ または クリックして選択</p>
            <p className="drop-zone-subtext">
              対応形式: 全ファイル形式 | 最大: {FREE_TIER_LIMITS.MAX_FILE_SIZE_GB}GB/ファイル
            </p>
          </div>
        </div>
      </div>

      {/* 選択されたファイル情報 */}
      {selectedFiles && (
        <div className="selected-files-info">
          <h3>選択されたファイル</h3>
          <div className="file-stats">
            <span>📊 {selectedFiles.file_count}個のファイル</span>
            <span>💾 合計サイズ: {formatFileSize(selectedFiles.total_size)}</span>
          </div>
        </div>
      )}

      {/* アップロードコントロール */}
      {(uploadQueue.length > 0 || (selectedFiles && selectedFiles.file_count > 0)) && (
        <div className="upload-controls">
          <div className="control-buttons">
            {!isUploading ? (
              <button 
                onClick={() => {
                  console.log('🚀 アップロード開始ボタンがクリックされました');
                  console.log('📋 現在の状態:', {
                    uploadConfig: uploadConfig ? 'あり' : 'なし',
                    uploadQueue: uploadQueue.length,
                    selectedFiles: selectedFiles ? selectedFiles.file_count : 0,
                    awsCredentials: awsCredentials ? 'あり' : 'なし',
                    bucketName: bucketName || 'なし'
                  });
                  handleStartUpload();
                }}
                className="btn-primary"
                disabled={!uploadConfig}
                title={!uploadConfig ? 'AWS設定が完了していません' : 'アップロードを開始'}
              >
                🚀 アップロード開始 {!uploadConfig && '(設定待ち)'}
              </button>
            ) : (
              <button 
                onClick={handleStopUpload}
                className="btn-secondary"
              >
                ⏸️ 停止
              </button>
            )}
            <button 
              onClick={handleClearQueue}
              className="btn-danger"
              disabled={isUploading}
            >
              🗑️ キューをクリア
            </button>
          </div>

          {/* 全体進捗 */}
          {uploadQueue.length > 0 && (() => {
            const realTimeStats = getRealTimeStats();
            const overallProgress = getOverallProgress(); // 一度だけ計算して両方で使用
            
            console.log(`🎨 レンダリング時の全体進捗: ${overallProgress}%`);
            console.log(`🎨 uploadQueue.length: ${uploadQueue.length}`);
            console.log(`🎨 realTimeStats:`, realTimeStats);
            
            return (
              <div className="overall-progress">
                <div className="progress-header">
                  <span>全体進捗: {overallProgress}%</span>
                  <div className="progress-details">
                    <span>📊 {formatFileSize(realTimeStats?.uploadedBytes || 0)} / {formatFileSize(realTimeStats?.totalBytes || 0)}</span>
                    <span>📁 {getFileProgress().completed}/{getFileProgress().total} ファイル完了</span>
                  </div>
                </div>
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>
                {realTimeStats && realTimeStats.totalSpeed > 0 && (
                  <div className="upload-speed">
                    ⚡ {realTimeStats.totalSpeed.toFixed(2)} MB/s (合計)
                    <span> | アクティブ: {realTimeStats.activeUploads}ファイル</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* アップロードキュー */}
      {uploadQueue.length > 0 && (
        <div className="upload-queue">
          <h3>アップロードキュー</h3>
          <div className="queue-items">
            {uploadQueue.map((item) => (
              <div key={item.id} data-item-id={item.id} className={`queue-item status-${item.status.toLowerCase()}`}>
                <div className="item-info">
                  <div className="item-name">{item.file_name}</div>
                  <div className="item-details">
                    <span>{formatFileSize(item.file_size)}</span>
                    <span className={`status-badge status-${item.status.toLowerCase()}`}>
                      {item.status === UploadStatus.Pending && '⏳ 待機中'}
                      {item.status === UploadStatus.InProgress && '🔄 アップロード中'}
                      {item.status === UploadStatus.Completed && '✅ 完了'}
                      {item.status === UploadStatus.Failed && '❌ 失敗'}
                      {item.status === UploadStatus.Paused && '⏸️ 一時停止'}
                      {item.status === UploadStatus.Cancelled && '🚫 キャンセル'}
                    </span>
                  </div>
                </div>

                {(item.status === UploadStatus.InProgress || item.status === UploadStatus.Completed) && (
                  <div className="item-progress">
                    <div className="progress-header-compact">
                      <span className="progress-text">{item.progress.toFixed(1)}%</span>
                      <span className="progress-bytes">
                        {formatFileSize(item.uploaded_bytes)} / {formatFileSize(item.file_size)}
                      </span>
                      <span className="upload-speed">⚡ {item.speed_mbps.toFixed(2)} MB/s</span>
                      {item.status === UploadStatus.InProgress && item.eta_seconds && item.eta_seconds > 0 && (
                        <span className="eta-time">⏱️ 残り {Math.round(item.eta_seconds)}秒</span>
                      )}
                      {item.status === UploadStatus.Completed && (
                        <span className="completed-status">🎉 完了!</span>
                      )}
                    </div>
                    <div className="progress-bar">
                      <div 
                        className="progress-fill"
                        style={{ 
                          width: `${Math.max(0, Math.min(100, item.progress))}%`,
                          backgroundColor: item.status === UploadStatus.Completed ? '#22c55e' : '#3b82f6'
                        }}
                      />
                    </div>
                  </div>
                )}

                {item.status === UploadStatus.Failed && (
                  <div className="item-error">
                    <div className="error-message">{item.error_message}</div>
                    <button 
                      onClick={() => handleRetryItem(item.id)}
                      className="btn-retry"
                    >
                      🔄 再試行
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 無料版制限の説明 */}
      <div className="free-tier-limits">
        <h4>🆓 無料版の制限</h4>
        <ul>
          <li>最大ファイルサイズ: {FREE_TIER_LIMITS.MAX_FILE_SIZE_GB}GB/ファイル</li>
          <li>同時アップロード: {FREE_TIER_LIMITS.MAX_CONCURRENT_UPLOADS}ファイル（単発処理）</li>
          <li>チャンクサイズ: 5MB（固定、変更不可）</li>
          <li>マルチパート設定: 標準設定（固定、カスタマイズ不可）</li>
          <li>対応形式: 全ファイル形式</li>
          <li>高速化機能: 無し（有料版で利用可能）</li>
          {uploadQueue.length > 1 && (
            <li className="queue-status">
              📋 キュー内: {uploadQueue.length}個のファイル - 1つずつ順次処理
              {uploadQueue.filter(item => item.status === UploadStatus.InProgress).length > 0 && (
                <span className="processing-indicator"> （現在処理中）</span>
              )}
            </li>
          )}
        </ul>
        <div className="upgrade-hint">
          <span>💡 より高速なアップロードや設定カスタマイズをお求めの場合は、</span>
          <button className="btn-upgrade">プレミアム版にアップグレード</button>
        </div>
      </div>

      {/* 🎯 設定パネル（モーダル） */}
      {showSettings && (
        <>
          <div className="settings-overlay" onClick={() => setShowSettings(false)} />
          <div className="settings-panel">
            <div className="settings-header">
              <h4>⚙️ アップロード設定</h4>
              <button className="btn-close" onClick={() => setShowSettings(false)}>×</button>
            </div>
          
          <div className="settings-content">
            {/* ティア選択 */}
            <div className="setting-group">
              <label>機能ティア</label>
              <div className="tier-selector">
                <button 
                  className={`tier-btn ${currentTier === 'Free' ? 'active' : ''}`}
                  onClick={() => handleTierChange('Free')}
                >
                  🆓 無料版
                </button>
                <button 
                  className={`tier-btn ${currentTier === 'Premium' ? 'active' : ''}`}
                  onClick={() => handleTierChange('Premium')}
                >
                  💎 プレミアム版
                </button>
              </div>
            </div>

            {/* 設定詳細 */}
            {tempConfig && (
              <div className="settings-details">
                <div className="settings-table">
                  <div className="settings-table-header">
                    <div className="settings-table-header-row">
                      <div className="settings-table-header-cell">設定項目</div>
                      <div className="settings-table-header-cell">設定値</div>
                      <div className="settings-table-header-cell">説明</div>
                    </div>
                  </div>
                  
                  <div className="settings-table-body">
                    <div className="setting-row">
                      <div className="setting-cell" data-label="設定項目">
                        <span className="setting-label">同時アップロード数</span>
                      </div>
                      <div className="setting-cell" data-label="設定値">
                        <div className="setting-input-container">
                          <input 
                            type="number" 
                            min="1" 
                            max={currentTier === 'Free' ? 1 : 8}
                            value={tempConfig.max_concurrent_uploads || 1}
                            onChange={(e) => setTempConfig({
                              ...tempConfig, 
                              max_concurrent_uploads: parseInt(e.target.value)
                            })}
                            disabled={currentTier === 'Free'}
                          />
                        </div>
                      </div>
                      <div className="setting-cell" data-label="説明">
                        <span className="setting-description">
                          {currentTier === 'Free' ? '無料版: 1固定' : 'プレミアム版: 1-8ファイル同時処理'}
                        </span>
                      </div>
                    </div>

                    <div className="setting-row">
                      <div className="setting-cell" data-label="設定項目">
                        <span className="setting-label">チャンク並列数</span>
                      </div>
                      <div className="setting-cell" data-label="設定値">
                        <div className="setting-input-container">
                          <input 
                            type="number" 
                            min={currentTier === 'Free' ? 1 : 4} 
                            max={currentTier === 'Free' ? 1 : 16}
                            value={tempConfig.max_concurrent_parts || 1}
                            onChange={(e) => setTempConfig({
                              ...tempConfig, 
                              max_concurrent_parts: parseInt(e.target.value)
                            })}
                            disabled={currentTier === 'Free'}
                          />
                        </div>
                      </div>
                      <div className="setting-cell" data-label="説明">
                        <span className="setting-description">
                          {currentTier === 'Free' ? '無料版: 1固定（順次処理）' : 'プレミアム版: 4-16チャンク並列処理'}
                        </span>
                      </div>
                    </div>

                    {/* チャンクサイズ設定 - 動的チャンクサイズが無効の場合のみ表示 */}
                    {(!tempConfig.adaptive_chunk_size || currentTier === 'Free') && (
                      <div className="setting-row">
                        <div className="setting-cell" data-label="設定項目">
                          <span className="setting-label">チャンクサイズ (MB)</span>
                        </div>
                        <div className="setting-cell" data-label="設定値">
                          <div className="setting-input-container">
                            <input 
                              type="number" 
                              min={tempConfig.min_chunk_size_mb || 5} 
                              max={tempConfig.max_chunk_size_mb || 1024}
                              value={tempConfig.chunk_size_mb || 5}
                              onChange={(e) => setTempConfig({
                                ...tempConfig, 
                                chunk_size_mb: parseInt(e.target.value)
                              })}
                              disabled={currentTier === 'Free'}
                            />
                          </div>
                        </div>
                        <div className="setting-cell" data-label="説明">
                          <span className="setting-description">
                            {currentTier === 'Free' ? '無料版: 5MB固定' : `プレミアム版: 5-1024MB可変`}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="setting-row">
                      <div className="setting-cell" data-label="設定項目">
                        <span className="setting-label">動的チャンクサイズ</span>
                      </div>
                      <div className="setting-cell" data-label="設定値">
                        <div className="setting-input-container">
                          <label className="toggle-switch">
                            <input 
                              type="checkbox" 
                              checked={tempConfig.adaptive_chunk_size || false}
                              onChange={(e) => setTempConfig({
                                ...tempConfig, 
                                adaptive_chunk_size: e.target.checked
                              })}
                              disabled={currentTier === 'Free'}
                            />
                            <span className="toggle-slider"></span>
                          </label>
                          <span className="toggle-label">{tempConfig.adaptive_chunk_size ? '有効' : '無効'}</span>
                        </div>
                      </div>
                      <div className="setting-cell" data-label="説明">
                        <span className="setting-description">
                          {currentTier === 'Free' ? '無料版: 無効' : 'プレミアム版: ファイルサイズに応じて自動調整'}
                        </span>
                      </div>
                    </div>

                    <div className="setting-row">
                      <div className="setting-cell" data-label="設定項目">
                        <span className="setting-label">再開機能</span>
                      </div>
                      <div className="setting-cell" data-label="設定値">
                        <div className="setting-input-container">
                          <label className="toggle-switch">
                            <input 
                              type="checkbox" 
                              checked={false}
                              onChange={() => {}} // 操作無効
                              disabled={true} // 常に無効
                            />
                            <span className="toggle-slider"></span>
                          </label>
                          <span className="toggle-label">無効</span>
                        </div>
                      </div>
                      <div className="setting-cell" data-label="説明">
                        <span className="setting-description">
                          🚧 未実装機能（将来のアップデートで対応予定）
                        </span>
                      </div>
                    </div>

                    <div className="setting-row">
                      <div className="setting-cell" data-label="設定項目">
                        <span className="setting-label">リトライ回数</span>
                      </div>
                      <div className="setting-cell" data-label="設定値">
                        <div className="setting-input-container">
                          <input 
                            type="number" 
                            min="1" 
                            max="20"
                            value={tempConfig.retry_attempts || 3}
                            onChange={(e) => setTempConfig({
                              ...tempConfig, 
                              retry_attempts: parseInt(e.target.value)
                            })}
                          />
                        </div>
                      </div>
                      <div className="setting-cell" data-label="説明">
                        <span className="setting-description">
                          失敗時の再試行回数（全ティア共通）
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 制限情報 */}
            <div className="tier-limits">
              <h5>{currentTier === 'Free' ? '🆓 無料版制限' : '💎 プレミアム版制限'}</h5>
              <ul>
                <li>最大ファイルサイズ: {currentTier === 'Free' ? FREE_TIER_LIMITS.MAX_FILE_SIZE_GB : PREMIUM_TIER_LIMITS.MAX_FILE_SIZE_GB}GB</li>
                <li>同時アップロード: {currentTier === 'Free' ? FREE_TIER_LIMITS.MAX_CONCURRENT_UPLOADS : PREMIUM_TIER_LIMITS.MAX_CONCURRENT_UPLOADS}ファイル</li>
                <li>チャンク並列度: {currentTier === 'Free' ? FREE_TIER_LIMITS.MAX_CONCURRENT_PARTS : PREMIUM_TIER_LIMITS.MAX_CONCURRENT_PARTS}</li>
                <li>高速化機能: {currentTier === 'Free' ? '無し' : '有り（動的最適化、並列処理）'}</li>
              </ul>
            </div>

            {/* 設定ボタン */}
            <div className="settings-actions">
              <button className="btn-primary" onClick={applySettings}>
                ✅ 設定を適用
              </button>
              <button className="btn-secondary" onClick={resetSettings}>
                🔄 リセット
              </button>
            </div>
          </div>
        </div>
        </>
      )}

      {/* ネイティブファイルダイアログを使用するため、HTML input要素は不要 */}
    </div>
  );
}; 