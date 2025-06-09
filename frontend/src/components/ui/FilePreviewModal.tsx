import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Download, ZoomIn, ZoomOut, RotateCw, Maximize2, Volume2, Video, Check, AlertCircle, Loader2, Play, Pause, Info, FileText, Image as ImageIcon } from 'lucide-react';

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

function VideoPlayer({ previewData, fileName, fileSize, onFullscreen }: { previewData: any; fileName: string; fileSize: number; onFullscreen: () => void }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isProgressDragging, setIsProgressDragging] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const handleVideoLoad = () => {
    setIsLoading(false);
    setError('');
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleVideoError = () => {
    setError('Không thể tải video');
    setIsLoading(false);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current && !isProgressDragging) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleProgressClick = (e: React.MouseEvent) => {
    if (progressRef.current && videoRef.current) {
      const rect = progressRef.current.getBoundingClientRect();
      const clickPosition = (e.clientX - rect.left) / rect.width;
      const newTime = clickPosition * duration;
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleProgressMouseDown = (e: React.MouseEvent) => {
    setIsProgressDragging(true);
    handleProgressClick(e);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (progressRef.current && videoRef.current) {
        const rect = progressRef.current.getBoundingClientRect();
        const dragPosition = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width));
        const newTime = dragPosition * duration;
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      }
    };

    const handleMouseUp = () => {
      setIsProgressDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  };

  const enterFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      } else if ((videoRef.current as any).webkitRequestFullscreen) {
        (videoRef.current as any).webkitRequestFullscreen();
      } else if ((videoRef.current as any).mozRequestFullScreen) {
        (videoRef.current as any).mozRequestFullScreen();
      } else if ((videoRef.current as any).msRequestFullscreen) {
        (videoRef.current as any).msRequestFullscreen();
      }
    }
  };

  return (
    <div 
      className="relative w-full h-full bg-black rounded-xl overflow-hidden cursor-pointer"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setShowControls(true)}
    >
      {isLoading && (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black flex items-center justify-center z-10">
          <div className="text-center text-white">
            <div className="relative mb-6">
              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <Video className="w-8 h-8 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-blue-400" />
            </div>
            <h3 className="text-lg font-medium mb-2">Đang tải video...</h3>
            <p className="text-gray-400 text-sm">{formatFileSize(fileSize)}</p>
          </div>
        </div>
      )}
      
      {error ? (
        <div className="p-8 text-center text-white h-full flex items-center justify-center">
          <div className="max-w-md">
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-10 h-10 text-red-400" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Lỗi tải video</h3>
            <p className="text-red-400 mb-6">{error}</p>
            <div className="bg-gray-800/50 backdrop-blur rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Tệp:</span>
                <span className="text-white">{fileName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Kích thước:</span>
                <span className="text-white">{formatFileSize(fileSize)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            preload="metadata"
            onLoadedData={handleVideoLoad}
            onError={handleVideoError}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                setDuration(videoRef.current.duration);
              }
            }}
            onClick={togglePlay}
            playsInline
            src={previewData.stream_url}
          />
          
          <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
            <div className="p-4">
              <div className="mb-3">
                <div 
                  ref={progressRef}
                  className="relative w-full h-2 bg-white/20 rounded-full cursor-pointer hover:h-3 transition-all duration-200"
                  onClick={handleProgressClick}
                  onMouseDown={handleProgressMouseDown}
                >
                  <div 
                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-100"
                    style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                  />
                  <div 
                    className="absolute top-1/2 transform -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg opacity-0 hover:opacity-100 transition-opacity duration-200"
                    style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`, marginLeft: '-8px' }}
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <button 
                    onClick={togglePlay}
                    className="w-12 h-12 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-all duration-200"
                  >
                    {isPlaying ? (
                      <Pause className="w-6 h-6 text-white" />
                    ) : (
                      <Play className="w-6 h-6 text-white ml-1" />
                    )}
                  </button>
                  
                  <div className="text-white text-sm font-medium">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </div>
                  
                  <button 
                    onClick={enterFullscreen}
                    className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-all duration-200"
                    title="Toàn màn hình"
                  >
                    <Maximize2 className="w-5 h-5 text-white" />
                  </button>
                </div>
                
                <div className="text-white">
                  <h4 className="font-semibold text-lg mb-1 truncate max-w-md">{fileName}</h4>
                  <p className="text-gray-300 text-sm">{formatFileSize(fileSize)}</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ImageViewer({ data, fileName, zoom, rotation, fileId }: { data: any; fileName: string; zoom: number; rotation: number; fileId: string }) {
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const loadOriginalImage = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`http://localhost:8000/file-management/files/${fileId}/download/`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setImageUrl(url);
        } else if (data.direct_url) {
          setImageUrl(data.direct_url);
        } else {
          setError(true);
        }
      } catch {
        if (data.direct_url) {
          setImageUrl(data.direct_url);
        } else {
          setError(true);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadOriginalImage();
    return () => {
      if (imageUrl && imageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [fileId, data]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Đang tải hình ảnh...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-gray-50 to-gray-100">
      {data.width && (
        <div className="px-6 py-4 bg-white/80 backdrop-blur border-b border-gray-200">
          <div className="flex items-center space-x-6 text-sm">
            <div className="flex items-center space-x-2">
              <ImageIcon className="w-4 h-4 text-blue-500" />
              <span className="font-medium text-gray-900">{data.width}×{data.height}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-gray-500">Định dạng:</span>
              <span className="font-medium text-gray-900">{data.format}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-gray-500">Chế độ:</span>
              <span className="font-medium text-gray-900">{data.mode}</span>
            </div>
          </div>
        </div>
      )}
      
      <div className="flex-1 overflow-hidden flex items-center justify-center p-6">
        <div className="relative max-w-full max-h-full">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Preview"
              className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transition: 'transform 0.3s ease-out'
              }}
              onError={() => setError(true)}
            />
          ) : (
            <div className="w-64 h-64 bg-gray-200 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500">Không thể tải hình ảnh</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AudioPlayer({ data, fileName }: { data: any; fileName: string }) {
  return (
    <div className="h-full flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
      <div className="text-center max-w-md w-full p-8">
        <div className="relative mb-8">
          <div className="w-32 h-32 bg-gradient-to-br from-purple-500 via-blue-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto shadow-2xl">
            <Volume2 className="w-16 h-16 text-white" />
          </div>
          <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
            <Play className="w-4 h-4 text-white ml-0.5" />
          </div>
        </div>
        
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Trình phát âm thanh</h3>
        <p className="text-gray-600 mb-6 truncate">{fileName}</p>
        
        <div className="bg-white/80 backdrop-blur rounded-xl shadow-lg p-6">
          <audio
            controls
            className="w-full"
            src={data.stream_url}
            preload="metadata"
          />
        </div>
      </div>
    </div>
  );
}

function TextViewer({ data }: { data: any }) {
  return (
    <div className="h-full flex flex-col bg-white">
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center space-x-4 text-sm">
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-blue-500" />
            <span className="font-medium text-gray-900">{data.lines.toLocaleString()} dòng</span>
          </div>
          {data.truncated && (
            <div className="flex items-center space-x-2">
              <Info className="w-4 h-4 text-amber-500" />
              <span className="text-amber-600">Đã cắt bớt</span>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex-1 overflow-auto">
        <pre className="p-6 text-sm font-mono leading-relaxed text-gray-800 whitespace-pre-wrap bg-gradient-to-br from-gray-50 to-white">
          {data.content}
        </pre>
      </div>
    </div>
  );
}

function PDFViewer({ data, fileName }: { data: any; fileName: string }) {
  return (
    <div className="h-full flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50">
      <div className="text-center max-w-md">
        <div className="w-24 h-24 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
          <span className="text-white text-2xl font-bold">PDF</span>
        </div>
        
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Tài liệu PDF</h3>
        <p className="text-gray-600 mb-2 truncate">{fileName}</p>
        <p className="text-sm text-gray-500 mb-6">
          Kích thước: {(data.size / (1024 * 1024)).toFixed(2)} MB
        </p>
        
        <button 
          onClick={() => window.open(data.download_url, '_blank')}
          className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
        >
          <Download className="w-5 h-5 mr-2" />
          Tải xuống PDF
        </button>
      </div>
    </div>
  );
}

function PreviewContent({ data, contentType, fileId, fileName, zoom = 1, rotation = 0 }: PreviewContentProps) {

  if (contentType.startsWith('image/')) {
    return <ImageViewer data={data} fileName={fileName} zoom={zoom} rotation={rotation} fileId={fileId} />;
  }

  if (contentType.startsWith('video/')) {
    const fileSize = data.size || 0;
    
    return (
      <div className="h-full bg-black">
        <VideoPlayer previewData={data} fileName={fileName} fileSize={fileSize} />
      </div>
    );
  }

  if (contentType.startsWith('audio/')) {
    return <AudioPlayer data={data} fileName={fileName} />;
  }

  if (data.type === 'text') {
    return <TextViewer data={data} />;
  }

  if (data.type === 'pdf') {
    return <PDFViewer data={data} fileName={fileName} />;
  }

  return (
    <div className="h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-gradient-to-br from-gray-400 to-gray-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
          <span className="text-white text-sm font-semibold">
            {contentType.split('/')[1]?.toUpperCase().slice(0, 4) || 'FILE'}
          </span>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Không hỗ trợ xem trước</h3>
        <p className="text-gray-600 mb-2">Loại tệp này không thể xem trước</p>
        <p className="text-sm text-gray-500">{contentType}</p>
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

  const loadPreview = useCallback(async () => {
    if (!fileId) return;
    
    setIsLoading(true);
    setError('');
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8000/media-preview/preview/${fileId}/preview/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Lỗi xem trước: ${response.status}`);
      }

      const data = await response.json();
      setPreviewData(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Lỗi xem trước');
    } finally {
      setIsLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    if (isOpen && fileId) {
      loadPreview();
      document.body.style.overflow = 'hidden';
      
      const header = document.querySelector('header');
      if (header) {
        header.style.display = 'none';
      }
    }
    
    return () => {
      setImageZoom(1);
      setImageRotation(0);
      setIsFullscreen(false);
      document.body.style.overflow = 'unset';
      
      const header = document.querySelector('header');
      if (header) {
        header.style.display = '';
      }
    };
  }, [isOpen, fileId, loadPreview]);

  const handleDownload = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8000/file-management/files/${fileId}/download/`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Tải xuống thất bại');

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

  const resetImageControls = () => {
    setImageZoom(1);
    setImageRotation(0);
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center ${
      isFullscreen ? 'p-0 z-[9999]' : 'p-4 z-[9999]'
    }`}>
      <div className={`bg-white flex flex-col ${
        isFullscreen 
          ? 'w-full h-full' 
          : 'w-full max-w-7xl h-full max-h-[95vh] rounded-2xl shadow-2xl'
      }`}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white/80 backdrop-blur rounded-t-2xl">
          <div className="flex items-center space-x-4 flex-1 min-w-0">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">
                {fileName.split('.').pop()?.toUpperCase().slice(0, 3) || 'F'}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold text-gray-900 truncate">{fileName}</h3>
              <p className="text-sm text-gray-500">{contentType}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {contentType.startsWith('image/') && (
              <>
                <div className="flex items-center bg-gray-100 rounded-lg">
                  <button
                    onClick={() => setImageZoom(Math.max(0.1, imageZoom - 0.2))}
                    className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-l-lg transition-colors"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="px-3 py-2 text-sm font-medium text-gray-700 min-w-[60px] text-center">
                    {Math.round(imageZoom * 100)}%
                  </span>
                  <button
                    onClick={() => setImageZoom(Math.min(5, imageZoom + 0.2))}
                    className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-r-lg transition-colors"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                </div>
                
                <button
                  onClick={() => setImageRotation((imageRotation + 90) % 360)}
                  className="p-2 text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                
                <button
                  onClick={resetImageControls}
                  className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Đặt lại
                </button>
              </>
            )}
            
            <button 
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            
            <button 
              onClick={handleDownload}
              className="p-2 text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-lg transition-all shadow-lg hover:shadow-xl"
            >
              <Download className="w-4 h-4" />
            </button>
            
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {isLoading && (
            <div className="flex items-center justify-center h-full bg-gradient-to-br from-gray-50 to-gray-100">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Đang tải xem trước...</h3>
                <p className="text-gray-600">Vui lòng đợi trong giây lát</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full bg-gradient-to-br from-red-50 to-red-100">
              <div className="text-center max-w-2xl mx-4">
                <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <AlertCircle className="w-10 h-10 text-red-500" />
                </div>
                <h3 className="text-xl font-semibold text-red-900 mb-4">Lỗi xem trước</h3>
                <div className="bg-red-100 border border-red-200 rounded-xl p-6 mb-6">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
                <div className="flex justify-center space-x-4">
                  <button 
                    onClick={loadPreview}
                    className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                  >
                    Thử lại
                  </button>
                  <button 
                    onClick={handleDownload}
                    className="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors"
                  >
                    Tải xuống
                  </button>
                </div>
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