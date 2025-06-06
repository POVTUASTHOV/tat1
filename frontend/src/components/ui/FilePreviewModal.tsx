import React, { useState, useEffect, useRef } from 'react';
import { X, Download, ZoomIn, ZoomOut, RotateCw, Maximize2, Volume2, Play, Pause, VolumeX, Loader2 } from 'lucide-react';

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  contentType: string;
}

interface VideoManifest {
  file_id: string;
  file_name: string;
  file_size: number;
  chunk_size: number;
  total_chunks: number;
  content_type: string;
  stream_url: string;
  requires_chunked_loading: boolean;
  recommended_quality: string;
}

function EnhancedVideoPlayer({ fileId, fileName, fileSize }: { fileId: string; fileName: string; fileSize: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manifest, setManifest] = useState<VideoManifest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedRanges, setBufferedRanges] = useState<Array<{start: number; end: number}>>([]);
  const [quality, setQuality] = useState<'360p' | '720p' | '1080p' | 'original'>('720p');
  const [error, setError] = useState<string>('');
  const [bufferProgress, setBufferProgress] = useState(0);
  const [useDirectStream, setUseDirectStream] = useState(false);

  useEffect(() => {
    loadVideoManifest();
    return () => {
      if (videoRef.current) {
        videoRef.current.src = '';
      }
    };
  }, [fileId]);

  useEffect(() => {
    if (videoRef.current) {
      const video = videoRef.current;
      const handleTimeUpdate = () => setCurrentTime(video.currentTime);
      const handleProgress = () => {
        const buffered = video.buffered;
        const ranges: Array<{start: number; end: number}> = [];
        
        for (let i = 0; i < buffered.length; i++) {
          ranges.push({
            start: buffered.start(i),
            end: buffered.end(i)
          });
        }
        
        setBufferedRanges(ranges);
        
        if (duration > 0) {
          const totalBuffered = ranges.reduce((sum, range) => sum + (range.end - range.start), 0);
          setBufferProgress((totalBuffered / duration) * 100);
        }
      };
      const handleLoadedMetadata = () => setDuration(video.duration);
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleVolumeChange = () => {
        setVolume(video.volume);
        setIsMuted(video.muted);
      };
      
      video.addEventListener('timeupdate', handleTimeUpdate);
      video.addEventListener('progress', handleProgress);
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);
      video.addEventListener('volumechange', handleVolumeChange);
      
      return () => {
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.removeEventListener('progress', handleProgress);
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('volumechange', handleVolumeChange);
      };
    }
  }, [duration]);

  const loadVideoManifest = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8000/media-preview/video/${fileId}/manifest/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        setUseDirectStream(true);
        setupDirectStreaming();
        return;
      }
      
      const manifestData = await response.json();
      setManifest(manifestData);
      setupVideoStreaming(manifestData);
    } catch (error) {
      setUseDirectStream(true);
      setupDirectStreaming();
    }
  };

  const setupDirectStreaming = () => {
    if (videoRef.current) {
      videoRef.current.src = `http://localhost:8000/media-preview/video/${fileId}/stream/`;
      videoRef.current.load();
      setIsLoading(false);
    }
  };

  const setupVideoStreaming = (manifestData: VideoManifest) => {
    if (videoRef.current) {
      videoRef.current.src = `http://localhost:8000${manifestData.stream_url}`;
      videoRef.current.load();
      setIsLoading(false);
    }
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {
        setError('Playback failed. Please try again.');
      });
    }
  };

  const handleVolumeSliderChange = (newVolume: number) => {
    if (!videoRef.current) return;
    
    setVolume(newVolume);
    videoRef.current.volume = newVolume;
    setIsMuted(newVolume === 0);
  };

  const handleMuteToggle = () => {
    if (!videoRef.current) return;
    
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    videoRef.current.muted = newMuted;
  };

  const handleSeek = (seekTime: number) => {
    if (!videoRef.current) return;
    
    videoRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const formatTime = (time: number) => {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getBufferVisualization = () => {
    if (!duration || bufferedRanges.length === 0) return null;
    
    return bufferedRanges.map((range, index) => (
      <div
        key={index}
        className="absolute bg-white/30 h-full"
        style={{
          left: `${(range.start / duration) * 100}%`,
          width: `${((range.end - range.start) / duration) * 100}%`
        }}
      />
    ));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96 bg-black rounded-lg">
        <div className="text-center text-white">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p>Preparing video...</p>
          <p className="text-sm text-gray-400 mt-2">{formatFileSize(fileSize)}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96 bg-black rounded-lg">
        <div className="text-center text-white">
          <p className="text-red-400 mb-4">{error}</p>
          <button 
            onClick={() => {
              setError('');
              setIsLoading(true);
              loadVideoManifest();
            }}
            className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-black rounded-lg overflow-hidden">
      <div className="relative group">
        <video
          ref={videoRef}
          className="w-full h-auto max-h-[70vh]"
          preload="metadata"
          playsInline
        />
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="absolute bottom-4 left-4 right-4">
            <div className="mb-3">
              <div className="relative bg-white/20 h-1 rounded-full">
                {getBufferVisualization()}
                <div 
                  className="absolute bg-blue-500 h-full rounded-full"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />
                <input
                  type="range"
                  min="0"
                  max={duration}
                  value={currentTime}
                  onChange={(e) => handleSeek(Number(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <button
                  onClick={handlePlayPause}
                  className="text-white hover:text-blue-400 transition-colors"
                >
                  {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                </button>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleMuteToggle}
                    className="text-white hover:text-blue-400 transition-colors"
                  >
                    {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                  
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={volume}
                    onChange={(e) => handleVolumeSliderChange(Number(e.target.value))}
                    className="w-20 h-1 bg-white/20 rounded-full"
                  />
                </div>
                
                <div className="text-white text-sm">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value as any)}
                  className="bg-black/50 text-white rounded px-2 py-1 text-sm border border-white/20"
                >
                  <option value="360p">360p</option>
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                  <option value="original">Original</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="p-4 bg-gray-900 text-white">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium truncate">{fileName}</span>
          <span className="text-xs text-gray-400">
            {formatFileSize(fileSize)}
          </span>
        </div>
        
        {manifest && (
          <div className="text-xs text-gray-400 space-y-1">
            <div className="flex justify-between">
              <span>Buffer: {bufferProgress.toFixed(1)}%</span>
              <span>Chunks: {manifest.total_chunks}</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-1">
              <div 
                className="bg-blue-600 h-1 rounded-full transition-all duration-300"
                style={{ width: `${bufferProgress}%` }}
              />
            </div>
          </div>
        )}
        
        {useDirectStream && (
          <div className="text-xs text-yellow-400 mt-2">
            Direct streaming mode
          </div>
        )}
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

interface PreviewContentProps {
  data: any;
  contentType: string;
  fileId: string;
  fileName: string;
  zoom?: number;
  rotation?: number;
}

function PreviewContent({ data, contentType, fileId, fileName, zoom = 1, rotation = 0 }: PreviewContentProps) {
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
        preload="metadata"
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
              src={`http://localhost:8000/media-preview/video/${fileId}/stream/`}
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