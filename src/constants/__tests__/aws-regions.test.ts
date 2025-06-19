import { describe, it, expect } from 'vitest';
import { 
  AWS_REGIONS, 
  DEFAULT_REGION, 
  getRegionName, 
  getRegionDescription, 
  getRegionCodes,
  type AwsRegion 
} from '../aws-regions';

describe('aws-regions', () => {
  describe('AWS_REGIONS', () => {
    it('should contain expected regions', () => {
      expect(AWS_REGIONS).toBeInstanceOf(Array);
      expect(AWS_REGIONS.length).toBeGreaterThan(0);
      
      // 主要なリージョンが含まれていることを確認
      const regionCodes = AWS_REGIONS.map(r => r.code);
      expect(regionCodes).toContain('us-east-1');
      expect(regionCodes).toContain('us-west-2');
      expect(regionCodes).toContain('ap-northeast-1');
      expect(regionCodes).toContain('eu-west-1');
    });

    it('should have correct structure for each region', () => {
      AWS_REGIONS.forEach(region => {
        expect(region).toHaveProperty('code');
        expect(region).toHaveProperty('name');
        expect(region).toHaveProperty('description');
        expect(typeof region.code).toBe('string');
        expect(typeof region.name).toBe('string');
        expect(typeof region.description).toBe('string');
        expect(region.code.length).toBeGreaterThan(0);
        expect(region.name.length).toBeGreaterThan(0);
        expect(region.description.length).toBeGreaterThan(0);
      });
    });

    it('should have unique region codes', () => {
      const codes = AWS_REGIONS.map(r => r.code);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });
  });

  describe('DEFAULT_REGION', () => {
    it('should be ap-northeast-1', () => {
      expect(DEFAULT_REGION).toBe('ap-northeast-1');
    });

    it('should exist in AWS_REGIONS', () => {
      const regionCodes = AWS_REGIONS.map(r => r.code);
      expect(regionCodes).toContain(DEFAULT_REGION);
    });
  });

  describe('getRegionName', () => {
    it('should return correct region name for valid code', () => {
      expect(getRegionName('us-east-1')).toBe('US East (N. Virginia)');
      expect(getRegionName('ap-northeast-1')).toBe('Asia Pacific (Tokyo)');
      expect(getRegionName('eu-west-1')).toBe('Europe (Ireland)');
    });

    it('should return code for invalid region code', () => {
      expect(getRegionName('invalid-region')).toBe('invalid-region');
      expect(getRegionName('')).toBe('');
    });

    it('should be case sensitive', () => {
      expect(getRegionName('US-EAST-1')).toBe('US-EAST-1');
      expect(getRegionName('Ap-Northeast-1')).toBe('Ap-Northeast-1');
    });
  });

  describe('getRegionDescription', () => {
    it('should return correct region description for valid code', () => {
      expect(getRegionDescription('us-east-1')).toBe('バージニア北部');
      expect(getRegionDescription('ap-northeast-1')).toBe('東京');
      expect(getRegionDescription('eu-west-1')).toBe('アイルランド');
    });

    it('should return empty string for invalid region code', () => {
      expect(getRegionDescription('invalid-region')).toBe('');
      expect(getRegionDescription('')).toBe('');
    });

    it('should be case sensitive', () => {
      expect(getRegionDescription('US-EAST-1')).toBe('');
      expect(getRegionDescription('Ap-Northeast-1')).toBe('');
    });
  });

  describe('getRegionCodes', () => {
    it('should return array of all region codes', () => {
      const codes = getRegionCodes();
      expect(codes).toBeInstanceOf(Array);
      expect(codes.length).toBe(AWS_REGIONS.length);
      
      // 全てのリージョンコードが含まれていることを確認
      AWS_REGIONS.forEach(region => {
        expect(codes).toContain(region.code);
      });
    });

    it('should return unique codes', () => {
      const codes = getRegionCodes();
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });

    it('should return codes in same order as AWS_REGIONS', () => {
      const codes = getRegionCodes();
      const expectedCodes = AWS_REGIONS.map(r => r.code);
      expect(codes).toEqual(expectedCodes);
    });
  });

  describe('AwsRegion interface', () => {
    it('should match the structure of actual regions', () => {
      const testRegion: AwsRegion = {
        code: 'test-region',
        name: 'Test Region',
        description: 'テストリージョン'
      };

      expect(testRegion).toHaveProperty('code');
      expect(testRegion).toHaveProperty('name');
      expect(testRegion).toHaveProperty('description');
      expect(typeof testRegion.code).toBe('string');
      expect(typeof testRegion.name).toBe('string');
      expect(typeof testRegion.description).toBe('string');
    });
  });

  describe('region data integrity', () => {
    it('should have consistent data across all regions', () => {
      AWS_REGIONS.forEach(region => {
        // コードが有効な形式であることを確認
        expect(region.code).toMatch(/^[a-z]+-[a-z]+-\d+$/);
        
        // 名前が適切な形式であることを確認
        expect(region.name).toContain('(');
        expect(region.name).toContain(')');
        
        // 説明が日本語で記述されていることを確認
        expect(region.description).toMatch(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/);
      });
    });

    it('should have no duplicate names', () => {
      const names = AWS_REGIONS.map(r => r.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('should have no duplicate descriptions', () => {
      const descriptions = AWS_REGIONS.map(r => r.description);
      const uniqueDescriptions = new Set(descriptions);
      expect(uniqueDescriptions.size).toBe(descriptions.length);
    });
  });
}); 