// Example: Using Squash SDK in Next.js app
// npm install squash-sdk

'use client';

import { squashSDK } from 'squash-sdk';
import { useEffect, useState } from 'react';

// Custom hook for Squash SDK
function useSquashContext() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Only initialize in the browser
    if (typeof window === 'undefined') return;

    const initSDK = async () => {
      try {
        const result = await squashSDK.init({
          appName: 'My Next.js App',
          appId: 'nextjs-app-example',
          installPrompt: true,
          theme: 'auto'
        });

        setIsInitialized(result.permissionGranted);
      } catch (error) {
        console.error('Squash SDK init error:', error);
      }
    };

    initSDK();
  }, []);

  const fetchContext = async (query?: string) => {
    if (!isInitialized) return;

    setLoading(true);
    try {
      const result = await squashSDK.getContext({
        relevanceQuery: query || 'web development, nextjs, react',
        timeRange: '7d',
        maxTokens: 1500,
        format: 'structured'
      });

      if (result.status === 'success') {
        setContext(result.context);
      }
    } catch (error) {
      console.error('Failed to fetch context:', error);
    } finally {
      setLoading(false);
    }
  };

  return { isInitialized, context, loading, fetchContext };
}

// Example component using the SDK
export default function PersonalizedDashboard() {
  const { isInitialized, context, loading, fetchContext } = useSquashContext();
  const [showPersonalized, setShowPersonalized] = useState(false);

  const handlePersonalize = async () => {
    await fetchContext();
    setShowPersonalized(true);
  };

  return (
    <div className="dashboard">
      <h1>Welcome to Your Dashboard</h1>
      
      {!showPersonalized ? (
        <button 
          onClick={handlePersonalize}
          disabled={!isInitialized || loading}
          className="personalize-btn"
        >
          {loading ? 'Loading...' : 'Show Personalized Content'}
        </button>
      ) : (
        <div className="personalized-content">
          {context?.summary && (
            <div className="user-summary">
              <h2>About You</h2>
              <p>{context.summary}</p>
            </div>
          )}
          
          {context?.topics && context.topics.length > 0 && (
            <div className="interests">
              <h3>Your Interests</h3>
              <div className="topic-tags">
                {context.topics.map((topic, idx) => (
                  <span key={idx} className="tag">
                    {topic.topic}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {context?.patterns && context.patterns.length > 0 && (
            <div className="patterns">
              <h3>Your Work Patterns</h3>
              <ul>
                {context.patterns.map((pattern, idx) => (
                  <li key={idx}>{pattern.description || pattern.name}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}