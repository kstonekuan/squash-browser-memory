import { generateMockResult, generateMockContext } from '../mock-data';

describe('Mock Data Generator', () => {
  describe('generateMockContext()', () => {
    it('should generate context with default data', () => {
      const context = generateMockContext();
      
      expect(context).toBeDefined();
      expect(context.summary).toBeDefined();
      expect(typeof context.summary).toBe('string');
      expect(context.patterns).toBeInstanceOf(Array);
      expect(context.topics).toBeInstanceOf(Array);
      expect(context.recentActivities).toBeInstanceOf(Array);
    });

    it('should have valid pattern structure', () => {
      const context = generateMockContext();
      
      context.patterns.forEach(pattern => {
        expect(pattern).toHaveProperty('name');
        expect(pattern).toHaveProperty('frequency');
        expect(pattern).toHaveProperty('lastSeen');
        expect(typeof pattern.name).toBe('string');
        expect(typeof pattern.frequency).toBe('number');
        expect(typeof pattern.lastSeen).toBe('number');
        expect(pattern.frequency).toBeGreaterThanOrEqual(0);
        expect(pattern.frequency).toBeLessThanOrEqual(1);
      });
    });

    it('should have valid topic structure', () => {
      const context = generateMockContext();
      
      context.topics.forEach(topic => {
        expect(topic).toHaveProperty('topic');
        expect(topic).toHaveProperty('relevance');
        expect(topic).toHaveProperty('keywords');
        expect(typeof topic.topic).toBe('string');
        expect(typeof topic.relevance).toBe('number');
        expect(topic.keywords).toBeInstanceOf(Array);
        expect(topic.relevance).toBeGreaterThanOrEqual(0);
        expect(topic.relevance).toBeLessThanOrEqual(1);
      });
    });

    it('should have valid activity structure', () => {
      const context = generateMockContext();
      
      context.recentActivities.forEach(activity => {
        expect(activity).toHaveProperty('activity');
        expect(activity).toHaveProperty('timestamp');
        expect(activity).toHaveProperty('relevance');
        expect(typeof activity.activity).toBe('string');
        expect(typeof activity.timestamp).toBe('number');
        expect(typeof activity.relevance).toBe('number');
        expect(activity.relevance).toBeGreaterThanOrEqual(0);
        expect(activity.relevance).toBeLessThanOrEqual(1);
      });
    });

    it('should filter by relevance query', () => {
      const context = generateMockContext({ relevanceQuery: 'react' });
      
      // Should have filtered content related to React
      const hasReactContent = 
        context.topics.some(t => t.topic.toLowerCase().includes('react')) ||
        context.recentActivities.some(a => a.activity.toLowerCase().includes('react'));
      
      expect(hasReactContent).toBe(true);
    });

    it('should handle multiple relevance query terms', () => {
      const context = generateMockContext({ relevanceQuery: 'typescript, api' });
      
      // Should have content related to TypeScript or API
      const hasRelevantContent = 
        context.topics.some(t => 
          t.topic.toLowerCase().includes('typescript') || 
          t.topic.toLowerCase().includes('api')
        );
      
      expect(hasRelevantContent).toBe(true);
    });

    it('should generate appropriate summary', () => {
      const context = generateMockContext();
      
      expect(context.summary).toContain('developer');
      expect(context.summary.length).toBeGreaterThan(50);
    });
  });

  describe('generateMockResult()', () => {
    it('should generate successful mock result', () => {
      const result = generateMockResult();
      
      expect(result.status).toBe('success');
      expect(result.context).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it('should include proper metadata', () => {
      const result = generateMockResult();
      
      expect(result.metadata.generatedAt).toBeDefined();
      expect(result.metadata.version).toBe('1.0.0');
      expect(result.metadata.tokenCount).toBe(450);
      expect(result.metadata.isMockData).toBe(true);
    });

    it('should have valid timestamp in metadata', () => {
      const before = Date.now();
      const result = generateMockResult();
      const after = Date.now();
      
      expect(result.metadata.generatedAt).toBeGreaterThanOrEqual(before);
      expect(result.metadata.generatedAt).toBeLessThanOrEqual(after);
    });

    it('should pass relevance query to context generation', () => {
      const result = generateMockResult({ relevanceQuery: 'docker' });
      
      expect(result.context).toBeDefined();
      // The mock data includes DevOps topics which include docker
      const hasDockerContent = result.context?.topics.some(t => 
        t.keywords.some(k => k.includes('docker'))
      );
      
      expect(hasDockerContent).toBe(true);
    });

    it('should always return success status for mock data', () => {
      const result1 = generateMockResult();
      const result2 = generateMockResult({ relevanceQuery: 'testing' });
      const result3 = generateMockResult({ relevanceQuery: '' });
      
      expect(result1.status).toBe('success');
      expect(result2.status).toBe('success');
      expect(result3.status).toBe('success');
    });
  });
});