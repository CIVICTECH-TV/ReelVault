export interface AwsRegion {
  code: string;
  name: string;
  description: string;
}

export const AWS_REGIONS: AwsRegion[] = [
  // US East
  { code: 'us-east-1', name: 'US East (N. Virginia)', description: 'バージニア北部' },
  { code: 'us-east-2', name: 'US East (Ohio)', description: 'オハイオ' },
  
  // US West
  { code: 'us-west-1', name: 'US West (N. California)', description: 'カリフォルニア北部' },
  { code: 'us-west-2', name: 'US West (Oregon)', description: 'オレゴン' },
  
  // Asia Pacific
  { code: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)', description: '東京' },
  { code: 'ap-northeast-2', name: 'Asia Pacific (Seoul)', description: 'ソウル' },
  { code: 'ap-southeast-1', name: 'Asia Pacific (Singapore)', description: 'シンガポール' },
  { code: 'ap-southeast-2', name: 'Asia Pacific (Sydney)', description: 'シドニー' },
  
  // Europe
  { code: 'eu-west-1', name: 'Europe (Ireland)', description: 'アイルランド' },
  { code: 'eu-west-2', name: 'Europe (London)', description: 'ロンドン' },
  { code: 'eu-central-1', name: 'Europe (Frankfurt)', description: 'フランクフルト' }
];

export const DEFAULT_REGION = 'ap-northeast-1';

export const getRegionName = (code: string): string => {
  const region = AWS_REGIONS.find(r => r.code === code);
  return region ? region.name : code;
};

export const getRegionDescription = (code: string): string => {
  const region = AWS_REGIONS.find(r => r.code === code);
  return region ? region.description : '';
};

export const getRegionCodes = (): string[] => {
  return AWS_REGIONS.map(r => r.code);
}; 