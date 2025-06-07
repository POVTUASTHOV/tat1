import React, { useState, useEffect } from 'react';
import { X, Download, ZoomIn, ZoomOut, RotateCw, Maximize2, Volume2, Video, Check, AlertCircle, Loader2 } from 'lucide-react';

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  contentType: string;
}

interface VideoProcessingStatus {
  file_id: string;
  processing: boolean;
  content_type: string;
  size: number;
  name: string;
  video_processing_available: boolean;
}

interface PreviewContentProps {
  data: any;
  contentType: string;
  fileId: string;
  fileName: string;
  zoom?: number;
  rotation?: number;
}

function BasicVideoPlayer({ previewData, fileName, fileSize }: { previewData: any; fileName: string; fileSize: number }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleVideoLoad = () => {
    setIsLoading(false);
    setError('');
  };

  const handleVideoError = () => {
    setError('Failed to load video');
    setIsLoading(false);
  };

  return (
    <div className="bg-black rounded-lg overflow-hidden w-full max-w-4xl relative">
      {isLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-10">
          <div className="text-center text-white">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
            <p>Loading video...</p>
            <p className="text-sm text-gray-400 mt-2">{formatFileSize(fileSize)}</p>
          </div>
        </div>
      )}
      
      {error ? (
        <div className="p-8 text-center text-white">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Video Load Error</h3>
          <p className="text-red-400 mb-4">{error}</p>
          <div className="text-sm text-gray-400 mb-6">
            <p>File: {fileName}</p>
            <p>Size: {formatFileSize(fileSize)}</p>
            <p>URL: {previewData.stream_url}</p>
          </div>
        </div>
      ) : (
        <video
          className="w-full h-auto"
          controls
          preload="metadata"
          onLoadedData={handleVideoLoad}
          onError={handleVideoError}
          playsInline
          src={previewData.stream_url}
        />
      )}
      
      <div className="p-4 bg-gray-900 text-white">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium truncate">{fileName}</span>
          <span className="text-xs text-gray-400">{formatFileSize(fileSize)}</span>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Stream: {previewData.stream_url}
        </div>
      </div>
    </div>
  );
}

function PreviewContent({ data, contentType, fileId, fileName, zoom = 1, rotation = 0 }: PreviewContentProps) {
  const [processingStatus, setProcessingStatus] = useState<VideoProcessingStatus | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  const checkVideoProcessingStatus = async () => {
    if (!contentType.startsWith('video/')) return;
    
    setIsCheckingStatus(true);
    try {
      const response = await fetch(`http://localhost:8001/api/video/processing-status/${fileId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const status = await response.json();
        setProcessingStatus(status);
        
        if (status.processing) {
          setTimeout(checkVideoProcessingStatus, 3000);
        }
      }
    } catch (error) {
      console.error('Failed to check processing status:', error);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  useEffect(() => {
    checkVideoProcessingStatus();
  }, [fileId, contentType]);

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
    const fileSize = data.size || 0;
    
    return (
      <div className="h-full flex flex-col">
        {processingStatus && (
          <div className={`p-3 border-b flex items-center space-x-2 ${
            processingStatus.processing 
              ? 'bg-yellow-50 border-yellow-200' 
              : 'bg-green-50 border-green-200'
          }`}>
            {processingStatus.processing ? (
              <>
                <Video className="w-4 h-4 text-yellow-600 animate-pulse" />
                <span className="text-sm text-yellow-800">
                  Converting to H.264 for optimal playback...
                </span>
                {isCheckingStatus && (
                  <div className="animate-spin rounded-full h-3 w-3 border-b border-yellow-600"></div>
                )}
              </>
            ) : (
              <>
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-800">
                  Video optimized for web playback
                </span>
              </>
            )}
          </div>
        )}
        
        {processingStatus && !processingStatus.video_processing_available && (
          <div className="p-3 border-b bg-orange-50 border-orange-200 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-orange-600" />
            <span className="text-sm text-orange-800">
              Video processing unavailable. Original format will be used.
            </span>
          </div>
        )}

        <div className="flex-1 flex items-center justify-center bg-black p-4">
          {processingStatus?.processing ? (
            <div className="text-center text-white">
              <Video className="w-16 h-16 mx-auto mb-4 text-yellow-400 animate-pulse" />
              <h3 className="text-lg font-medium mb-2">Converting Video</h3>
              <p className="text-gray-300 mb-4">
                Converting to H.264 for optimal web playback...
              </p>
              <div className="w-64 bg-gray-700 rounded-full h-2 mx-auto">
                <div className="bg-yellow-400 h-2 rounded-full animate-pulse w-full"></div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                This may take a few minutes depending on file size
              </p>
            </div>
          ) : (
            <BasicVideoPlayer 
              previewData={data}
              fileName={fileName} 
              fileSize={fileSize} 
            />
          )}
        </div>
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
              src={data.stream_url}
              preload="metadata"
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
          <button 
            onClick={() => window.open(data.download_url, '_blank')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center mx-auto"
          >
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </button>
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
        throw new Error(`Preview failed with status: ${response.status}`);
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
                <button
                  onClick={() => setImageZoom(Math.max(0.1, imageZoom - 0.1))}
                  className="p-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-600 min-w-[50px] text-center">
                  {Math.round(imageZoom * 100)}%
                </span>
                <button
                  onClick={() => setImageZoom(Math.min(5, imageZoom + 0.1))}
                  className="p-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setImageRotation((imageRotation + 90) % 360)}
                  className="p-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </>
            )}
            <button 
              onClick={toggleFullscreen}
              className="p-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button 
              onClick={handleDownload}
              className="p-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded"
            >
              <Download className="w-4 h-4" />
            </button>
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
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p>Loading preview...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-red-600 mb-4">{error}</p>
                <button 
                  onClick={loadPreview}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {previewData && !isLoading && !error && (
            <PreviewContent 
              data={previewData} 
              contentType={contentType}
              fileId={fileId}
              fileName={fileName}
              zoom={imageZoom}
              rotation={imageRotation}
            />
          )}
        </div>
      </div>
    </div>
  );
}