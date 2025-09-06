'use client';

import { useEffect, useState } from 'react';

const TOKEN_KEY = 'API_AUTH_TOKEN';

interface Citation {
  id: string;
  text: string;
}

interface UploadResponse {
  success: boolean;
  namespace: string;
  chunks: number;
  vectorCount: number;
  metadata: {
    filename?: string;
    numPages?: number;
  };
}

interface AskResponse {
  answer: string;
  citations: Citation[];
  metadata: {
    chunksFound: number;
    citationsUsed: number;
  };
}

export default function HomeClient() {
  const [token, setToken] = useState<string>('');
  const [ready, setReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState('');

  // Read token only after mount
  useEffect(() => {
    try {
      const t = typeof window !== 'undefined'
        ? window.sessionStorage.getItem(TOKEN_KEY) ?? ''
        : '';
      setToken(t);
      setIsAuthenticated(!!t);
    } catch { 
      /* ignore quota/sessionStorage errors */ 
    }
    setReady(true);
  }, []);

  const saveToken = (t: string) => {
    setToken(t);
    setIsAuthenticated(!!t);
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(TOKEN_KEY, t);
      }
    } catch {
      /* ignore quota/sessionStorage errors */
    }
  };

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (token.trim()) {
      saveToken(token.trim());
      setError('');
    }
  };

  const handleFileUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsUploading(true);

    const formData = new FormData(e.currentTarget);
    const file = formData.get('file') as File;

    if (!file) {
      setError('Please select a PDF file');
      setIsUploading(false);
      return;
    }

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      setUploadResult(result);
      setAnswer(null); // Clear previous answers
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const ask = async (namespace: string, question: string) => {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ namespace, question, topK: 5 }),
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || 'Question failed');
    }

    return result;
  };

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadResult || !question.trim()) return;

    setError('');
    setIsAsking(true);

    try {
      const result = await ask(uploadResult.namespace, question.trim());
      setAnswer(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get answer');
    } finally {
      setIsAsking(false);
    }
  };

  // Render nothing until client mounted
  if (!ready) return null;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">PDF Q&A Assistant</h1>
          
          {/* Authentication Section */}
          {!isAuthenticated && (
            <div className="border-b pb-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Authentication</h2>
              <form onSubmit={handleAuthSubmit} className="flex gap-4">
                <input
                  type="password"
                  placeholder="Enter API auth token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Connect
                </button>
              </form>
              <p className="mt-2 text-sm text-gray-600">
                Enter your API authentication token to access the PDF Q&A service.
              </p>
            </div>
          )}

          {/* Upload Section */}
          {isAuthenticated && (
            <>
              <div className="border-b pb-6 mb-6">
                <h2 className="text-xl font-semibold mb-4">Upload PDF</h2>
                <form onSubmit={handleFileUpload}>
                  <div className="flex gap-4 items-end">
                    <div className="flex-1">
                      <input
                        type="file"
                        name="file"
                        accept=".pdf"
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isUploading}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isUploading ? 'Processing...' : 'Upload & Process'}
                    </button>
                  </div>
                </form>

                {uploadResult && (
                  <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
                    <h3 className="font-semibold text-green-800">Upload Successful!</h3>
                    <p className="text-sm text-green-700">
                      Processed {uploadResult.chunks} chunks from {uploadResult.metadata.filename} 
                      ({uploadResult.metadata.numPages} pages)
                    </p>
                  </div>
                )}
              </div>

              {/* Question Section */}
              {uploadResult && (
                <div className="border-b pb-6 mb-6">
                  <h2 className="text-xl font-semibold mb-4">Ask a Question</h2>
                  <form onSubmit={handleAskQuestion}>
                    <div className="flex gap-4">
                      <input
                        type="text"
                        placeholder="What would you like to know about the PDF?"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                      <button
                        type="submit"
                        disabled={isAsking || !question.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isAsking ? 'Thinking...' : 'Ask'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Answer Section */}
              {answer && (
                <div>
                  <h2 className="text-xl font-semibold mb-4">Answer</h2>
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
                    <p className="text-gray-800 whitespace-pre-wrap">{answer.answer}</p>
                  </div>

                  {answer.citations.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3">Sources</h3>
                      <div className="space-y-3">
                        {answer.citations.map((citation) => (
                          <div key={citation.id} className="bg-gray-50 border border-gray-200 rounded-md p-3">
                            <div className="font-mono text-sm text-blue-600 mb-1">[{citation.id}]</div>
                            <p className="text-sm text-gray-700">{citation.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 text-xs text-gray-500">
                    Found {answer.metadata.chunksFound} relevant chunks, used {answer.metadata.citationsUsed} citations
                  </div>
                </div>
              )}
            </>
          )}

          {/* Error Display */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-800">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
