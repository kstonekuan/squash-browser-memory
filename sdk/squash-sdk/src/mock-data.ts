/**
 * Mock data generator for development mode
 */

import { Context, ContextResult } from './types';

const mockPatterns = [
  {
    name: 'Code Development Workflow',
    description: 'Frequently switches between IDE, documentation, and Stack Overflow',
    frequency: 0.85,
    lastSeen: Date.now() - 3600000
  },
  {
    name: 'Project Management',
    description: 'Regular use of GitHub issues, Jira, and team communication tools',
    frequency: 0.65,
    lastSeen: Date.now() - 7200000
  },
  {
    name: 'Research & Learning',
    description: 'Deep dives into technical documentation and tutorials',
    frequency: 0.45,
    lastSeen: Date.now() - 86400000
  }
];

const mockTopics = [
  {
    topic: 'React Development',
    relevance: 0.9,
    keywords: ['react', 'hooks', 'components', 'state management']
  },
  {
    topic: 'TypeScript',
    relevance: 0.85,
    keywords: ['typescript', 'types', 'interfaces', 'generics']
  },
  {
    topic: 'API Development',
    relevance: 0.7,
    keywords: ['rest', 'graphql', 'authentication', 'endpoints']
  },
  {
    topic: 'DevOps',
    relevance: 0.6,
    keywords: ['docker', 'kubernetes', 'ci/cd', 'deployment']
  }
];

const mockActivities = [
  {
    activity: 'Debugging React component rendering issue',
    timestamp: Date.now() - 1800000,
    relevance: 0.95
  },
  {
    activity: 'Researching TypeScript generic constraints',
    timestamp: Date.now() - 3600000,
    relevance: 0.8
  },
  {
    activity: 'Reviewing pull requests on GitHub',
    timestamp: Date.now() - 5400000,
    relevance: 0.75
  }
];

export function generateMockContext(options?: { relevanceQuery?: string }): Context {
  let patterns = [...mockPatterns];
  let topics = [...mockTopics];
  let activities = [...mockActivities];

  // Filter based on relevance query if provided
  if (options?.relevanceQuery) {
    const queryTerms = options.relevanceQuery.toLowerCase().split(',').map(t => t.trim());
    
    patterns = patterns.filter(p => 
      queryTerms.some(term => 
        p.name.toLowerCase().includes(term) || 
        p.description?.toLowerCase().includes(term)
      )
    );
    
    topics = topics.filter(t =>
      queryTerms.some(term =>
        t.topic.toLowerCase().includes(term) ||
        t.keywords.some(k => k.includes(term))
      )
    );
    
    activities = activities.filter(a =>
      queryTerms.some(term => a.activity.toLowerCase().includes(term))
    );
  }

  const summary = `You are a ${topics[0]?.topic || 'software development'} focused developer who ${patterns[0]?.description?.toLowerCase() || 'works on various projects'}. Your recent activity shows ${activities[0]?.activity || 'active development work'}.`;

  return {
    summary,
    patterns: patterns.slice(0, 3),
    topics: topics.slice(0, 4),
    recentActivities: activities.slice(0, 5)
  };
}

export function generateMockResult(options?: { relevanceQuery?: string }): ContextResult {
  return {
    status: 'success',
    context: generateMockContext(options),
    metadata: {
      generatedAt: Date.now(),
      version: '1.0.0',
      tokenCount: 450,
      isMockData: true
    }
  };
}