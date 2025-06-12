// ファイルメタデータの型定義

export interface VideoMetadata {
  duration?: number;
  width?: number;
  height?: number;
  frame_rate?: number;
  bit_rate?: number;
  codec?: string;
  format?: string;
}

export interface FileMetadata {
  id?: number;
  file_path: string;
  file_name: string;
  file_size: number;
  file_hash: string;
  mime_type: string;
  created_at: string;
  modified_at: string;
  video_metadata?: VideoMetadata;
  tags: string[];
  custom_fields: Record<string, string>;
}

export interface MetadataSearchQuery {
  file_name_pattern?: string;
  tags?: string[];
  size_min?: number;
  size_max?: number;
  date_from?: string;
  date_to?: string;
  mime_type?: string;
}

// メタデータ操作のレスポンス型
export interface MetadataResponse {
  success: boolean;
  message?: string;
  data?: any;
}

export interface CreateMetadataRequest {
  file_path: string;
  tags: string[];
  custom_fields: Record<string, string>;
}

export interface UpdateMetadataRequest {
  file_path: string;
  tags?: string[];
  custom_fields?: Record<string, string>;
  db_path: string;
} 