'use client';

import { useState, useEffect } from 'react';
import { X, Download, ZoomIn, ZoomOut, RotateCw, Maximize2, Volume2 } from 'lucide-react';
import Button from './Button';

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  contentType: string;
}

export default function FilePreviewModal({ isOpen, onClose, fileId, fileName, contentType }: FilePreviewModalProps) {
  const [previewData, setPreviewData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [imageZoom, setImageZoom] = useState(1);
  const [imageRotation, setImageRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (isOpen && fileId) {
      loadPreview();
    }
    return () => {
      setImageZoom(1);
      setImageRotation(0);
      setIsFullscreen(false);
    };
  }, [isOpen, fileId]);

  const loadPreview = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8000/media-preview/preview/${fileId}/preview/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load preview');
      }

      const data = await response.json();
      setPreviewData(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Preview failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8000/file-management/files/${fileId}/download/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 bg-black flex items-center justify-center z-50 ${
      isFullscreen ? 'bg-opacity-100' : 'bg-opacity-75'
    }`}>
      <div className={`bg-white rounded-lg flex flex-col ${
        isFullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-6xl h-full max-h-[95vh]'
      }`}>
        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white">
          <h3 className="text-lg font-semibold text-gray-900 truncate">{fileName}</h3>
          <div className="flex items-center space-x-2">
            {contentType.startsWith('image/') && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setImageZoom(Math.max(0.1, imageZoom - 0.1))}
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <span className="text-sm text-gray-600 min-w-[50px] text-center">
                  {Math.round(imageZoom * 100)}%
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setImageZoom(Math.min(5, imageZoom + 0.1))}
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setImageRotation((imageRotation + 90) % 360)}
                >
                  <RotateCw className="w-4 h-4" />
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={toggleFullscreen}>
              <Maximize2 className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="w-4 h-4" />
            </Button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {isLoading && (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-red-600 mb-4">{error}</p>
                <Button onClick={loadPreview}>Try Again</Button>
              </div>
            </div>
          )}

          {previewData && !isLoading && !error && (
            <PreviewContent 
              data={previewData} 
              contentType={contentType}
              fileId={fileId}
              zoom={imageZoom}
              rotation={imageRotation}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface PreviewContentProps {
  data: any;
  contentType: string;
  fileId: string;
  zoom?: number;
  rotation?: number;
}

function PreviewContent({ data, contentType, fileId, zoom = 1, rotation = 0 }: PreviewContentProps) {
  if (contentType.startsWith('image/')) {
    return (
      <div className="h-full flex flex-col">
        {data.width && (
          <div className="p-3 border-b border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-600">
              {data.width}×{data.height} • {data.format} • {data.mode}
            </div>
          </div>
        )}
        <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-100">
          <img
            src={`http://localhost:8000/media-preview/preview/${fileId}/preview/?size=800`}
            alt="Preview"
            className="max-w-full max-h-full object-contain"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transition: 'transform 0.2s ease'
            }}
          />
        </div>
      </div>
    );
  }

  if (contentType.startsWith('video/')) {
    return (
      <div className="h-full flex items-center justify-center bg-black">
        <video
          controls
          className="max-w-full max-h-full"
          src={`http://localhost:8000/media-preview/preview/${fileId}/stream/`}
        >
          Your browser does not support video playback.
        </video>
      </div>
    );
  }

  if (contentType.startsWith('audio/')) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md w-full p-8">
          <div className="bg-gradient-to-br from-blue-500 to-purple-600 w-32 h-32 rounded-full flex items-center justify-center mx-auto mb-6">
            <Volume2 className="w-16 h-16 text-white" />
          </div>
          <div className="bg-white rounded-lg shadow-lg p-6">
            <audio
              controls
              className="w-full"
              src={`http://localhost:8000/media-preview/preview/${fileId}/stream/`}
            >
              Your browser does not support audio playback.
            </audio>
          </div>
        </div>
      </div>
    );
  }

  if (data.type === 'text') {
    return (
      <div className="h-full flex flex-col">
        <div className="p-3 border-b border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            {data.lines.toLocaleString()} lines {data.truncated && '(truncated)'}
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <pre className="p-4 text-sm font-mono whitespace-pre-wrap leading-relaxed">{data.content}</pre>
        </div>
      </div>
    );
  }

  if (data.type === 'pdf') {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-100 w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-4">
            <span className="text-red-600 text-2xl font-bold">PDF</span>
          </div>
          <p className="text-gray-600 mb-4">{data.message}</p>
          <p className="text-sm text-gray-400 mb-4">File size: {(data.size / (1024 * 1024)).toFixed(2)} MB</p>
          <Button onClick={() => window.open(data.download_url, '_blank')}>
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <div className="bg-gray-100 w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-4">
          <span className="text-gray-500 text-xs font-medium">
            {contentType.split('/')[1]?.toUpperCase() || 'FILE'}
          </span>
        </div>
        <p className="text-gray-500 mb-2">Preview not available for this file type</p>
        <p className="text-sm text-gray-400">{contentType}</p>
      </div>
    </div>
  );
}