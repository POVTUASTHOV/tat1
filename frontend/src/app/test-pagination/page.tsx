'use client';

import { useState, useEffect } from 'react';
import { apiService } from '../../lib/api';

export default function TestPaginationPage() {
  const [folderData, setFolderData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testFolderId = '94b21631-1db8-48c8-b3d5-7dda6693b23b'; // Folder with 999 files

  const loadFolderContents = async (page: number = 1) => {
    setLoading(true);
    setError(null);
    try {
      console.log(`Loading folder contents for page ${page}...`);
      const result = await apiService.getFolderContents(testFolderId, page, 5);
      console.log('Folder contents result:', result);
      setFolderData(result);
    } catch (err) {
      console.error('Error loading folder contents:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFolderContents(1);
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">🧪 Test Pagination API</h1>
      
      <div className="bg-blue-50 p-4 rounded-lg mb-6">
        <h2 className="font-semibold">Testing Folder:</h2>
        <p>Folder ID: {testFolderId}</p>
        <p>Expected: 999 files, 200 pages (5 files per page)</p>
      </div>

      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2">Loading...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-red-800">Error:</h3>
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {folderData && (
        <div className="space-y-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="font-semibold text-green-800 mb-2">✅ API Response Success!</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Total Files:</strong> {folderData.total}
              </div>
              <div>
                <strong>Current Page:</strong> {folderData.page}
              </div>
              <div>
                <strong>Page Size:</strong> {folderData.page_size}
              </div>
              <div>
                <strong>Total Pages:</strong> {folderData.total_pages}
              </div>
              <div>
                <strong>Files in Response:</strong> {folderData.files?.length || 0}
              </div>
              <div>
                <strong>Folders in Response:</strong> {folderData.folders?.length || 0}
              </div>
            </div>
          </div>

          <div className="bg-white border rounded-lg p-4">
            <h3 className="font-semibold mb-4">Pagination Test</h3>
            <div className="flex gap-2 mb-4">
              <button 
                onClick={() => loadFolderContents(1)}
                disabled={loading}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              >
                Page 1
              </button>
              <button 
                onClick={() => loadFolderContents(2)}
                disabled={loading}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              >
                Page 2
              </button>
              <button 
                onClick={() => loadFolderContents(10)}
                disabled={loading}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              >
                Page 10
              </button>
              <button 
                onClick={() => loadFolderContents(200)}
                disabled={loading}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              >
                Last Page (200)
              </button>
            </div>
          </div>

          {folderData.files && folderData.files.length > 0 && (
            <div className="bg-white border rounded-lg p-4">
              <h3 className="font-semibold mb-4">Files (Page {folderData.page})</h3>
              <div className="space-y-2">
                {folderData.files.slice(0, 5).map((file: any, index: number) => (
                  <div key={file.id || index} className="flex justify-between text-sm">
                    <span>{file.name}</span>
                    <span className="text-gray-500">{file.size_formatted || 'Unknown size'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Raw API Response (first 500 chars):</h3>
            <pre className="text-xs overflow-auto bg-white p-2 rounded border">
              {JSON.stringify(folderData, null, 2).substring(0, 500)}...
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}