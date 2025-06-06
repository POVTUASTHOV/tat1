'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle, Download, Info, ExternalLink } from 'lucide-react';

interface VideoDebugPlayerProps {
  fileId: string;
  fileName: string;
  fileSize: number;
}

export default function VideoDebugPlayer({ fileId, fileName, fileSize }: VideoDebugPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [debug, setDebug] = useState<string[]>([]);
  const [videoInfo, setVideoInfo] = useState<any>(null);
  const [streamMethod, setStreamMethod] = useState<'token-url' | 'direct'>('token-url');

  const addDebug = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebug(prev => [...prev, `${timestamp}: ${message}`]);
    console.log(`Video Debug: ${message}`);
  };

  useEffect(() => {
    initializeVideo();
  }, [fileId, streamMethod]);

  const initializeVideo = async () => {
    setIsLoading(true);
    setError('');
    addDebug(`Starting initialization with method: ${streamMethod}`);

    try {
      await loadVideoPreview();
      await setupVideoStream();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      addDebug(`Initialization failed: ${errorMessage}`);
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  const loadVideoPreview = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No authentication token');
    }

    addDebug('Loading video preview data');
    const response = await fetch(`http://localhost:8000/media-preview/preview/${fileId}/preview/`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error(`Preview failed: ${response.status}`);
    }

    const data = await response.json();
    setVideoInfo(data);
    addDebug(`Preview loaded: ${JSON.stringify(data.video_info || {})}`);
  };

  const setupVideoStream = async () => {
    const token = localStorage.getItem('token');
    const video = videoRef.current;
    
    if (!video || !token) return;

    let streamUrl: string;
    
    switch (streamMethod) {
      case 'token-url':
        streamUrl = `http://localhost:8000/media-preview/video/${fileId}/stream/?token=${token}`;
        break;
      case 'direct':
        streamUrl = `http://localhost:8000/media-preview/video/${fileId}/stream/`;
        break;
      default:
        throw new Error('Invalid stream method');
    }

    addDebug(`Setting up stream: ${streamUrl}`);

    try {
      video.src = streamUrl;
      video.preload = 'none';
      video.load();
      addDebug('Video source set directly');
    } catch (err) {
      addDebug(`Stream setup failed: ${err}`);
      throw err;
    }
  };

  const handleVideoEvents = () => {
    const video = videoRef.current;
    if (!video) return;

    const events = {
      loadstart: () => addDebug('Video load started'),
      loadedmetadata: () => addDebug(`Metadata loaded - Duration: ${video.duration}s`),
      loadeddata: () => addDebug('Video data loaded'),
      canplay: () => {
        addDebug('Video can play');
        setIsLoading(false);
      },
      canplaythrough: () => addDebug('Video can play through'),
      progress: () => {
        const buffered = video.buffered;
        if (buffered.length > 0) {
          const bufferedEnd = buffered.end(buffered.length - 1);
          const bufferedPercent = (bufferedEnd / video.duration) * 100;
          addDebug(`Buffer progress: ${bufferedPercent.toFixed(1)}%`);
        }
      },
      error: () => {
        const errorCode = video.error?.code;
        const errorMessages = {
          1: 'MEDIA_ERR_ABORTED',
          2: 'MEDIA_ERR_NETWORK', 
          3: 'MEDIA_ERR_DECODE',
          4: 'MEDIA_ERR_SRC_NOT_SUPPORTED'
        };
        const errorMessage = errorMessages[errorCode as keyof typeof errorMessages] || 'Unknown error';
        addDebug(`Video error: ${errorMessage} (code: ${errorCode})`);
        setError(`Video error: ${errorMessage}`);
        setIsLoading(false);
      },
      stalled: () => addDebug('Video stalled'),
      waiting: () => addDebug('Video waiting for data'),
      seeking: () => addDebug('Video seeking'),
      seeked: () => addDebug('Video seek completed')
    };

    Object.entries(events).forEach(([event, handler]) => {
      video.addEventListener(event, handler);
    });

    return () => {
      Object.entries(events).forEach(([event, handler]) => {
        video.removeEventListener(event, handler);
      });
    };
  };

  useEffect(() => {
    if (videoRef.current) {
      return handleVideoEvents();
    }
  }, []);

  const handleDownload = async () => {
    addDebug('Starting download');
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8000/file-management/files/${fileId}/download/`, {
        headers: { 'Authorization': `Bearer ${token}` }
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
      addDebug('Download completed');
    } catch (err) {
      addDebug(`Download failed: ${err}`);
    }
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getRecommendation = () => {
    if (!videoInfo) return 'Loading...';
    
    const recommendation = videoInfo.recommended_action;
    const videoData = videoInfo.video_info;
    
    if (recommendation === 'download_recommended') {
      return 'File is very large (>2GB). Download recommended for better experience.';
    }
    
    if (recommendation === 'conversion_needed') {
      return `Codec ${videoData?.codec || 'unknown'} may not be web compatible. Consider conversion.`;
    }
    
    return 'Video should stream normally.';
  };

  const tryDirectVideoElement = () => {
    const video = videoRef.current;
    if (!video) return;

    const token = localStorage.getItem('token');
    const directUrl = `http://localhost:8000/media-preview/video/${fileId}/stream/?token=${token}`;
    
    addDebug('Trying direct video element approach');
    
    video.removeAttribute('src');
    video.innerHTML = `
      <source src="${directUrl}" type="video/mp4">
      <source src="${directUrl}" type="video/quicktime">
      <source src="${directUrl}" type="video/*">
    `;
    video.load();
  };

  return (
    <div className="bg-black rounded-lg overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-10">
          <div className="text-center text-white">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
            <p>Loading video...</p>
            <p className="text-sm text-gray-400 mt-2">{formatFileSize(fileSize)}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-8 text-center text-white">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Video Load Error</h3>
          <p className="text-red-400 mb-4">{error}</p>
          
          <div className="space-y-2 mb-6">
            <button
              onClick={() => setStreamMethod('token-url')}
              className={`px-4 py-2 rounded mr-2 ${streamMethod === 'token-url' ? 'bg-blue-600' : 'bg-gray-600'} text-white`}
            >
              Token URL
            </button>
            <button
              onClick={() => setStreamMethod('direct')}
              className={`px-4 py-2 rounded mr-2 ${streamMethod === 'direct' ? 'bg-blue-600' : 'bg-gray-600'} text-white`}
            >
              Direct Stream
            </button>
            <button
              onClick={tryDirectVideoElement}
              className="px-4 py-2 bg-purple-600 rounded hover:bg-purple-700 text-white"
            >
              Try Source Tags
            </button>
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-green-600 rounded hover:bg-green-700 text-white"
            >
              <Download className="w-4 h-4 inline mr-2" />
              Download
            </button>
          </div>
        </div>
      )}

      <video
        ref={videoRef}
        className="w-full h-auto"
        controls
        preload="none"
        playsInline
        muted
      />

      <div className="p-4 bg-gray-900 text-white">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="font-medium">{fileName}</h3>
            <p className="text-sm text-gray-400">{formatFileSize(fileSize)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm">Method: {streamMethod}</p>
          </div>
        </div>

        {videoInfo && (
          <div className="mb-4 p-3 bg-gray-800 rounded">
            <div className="flex items-center mb-2">
              <Info className="w-4 h-4 mr-2 text-blue-400" />
              <span className="text-sm font-medium">Video Information</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>Codec: {videoInfo.video_info?.codec || 'Unknown'}</div>
              <div>Compatible: {videoInfo.video_info?.compatible ? 'Yes' : 'No'}</div>
              <div>Resolution: {videoInfo.video_info?.width}x{videoInfo.video_info?.height}</div>
              <div>Duration: {videoInfo.video_info?.duration ? `${Math.round(videoInfo.video_info.duration)}s` : 'Unknown'}</div>
            </div>
            <div className="mt-2 text-xs text-yellow-400">
              {getRecommendation()}
            </div>
          </div>
        )}

        <details className="text-xs">
          <summary className="cursor-pointer text-gray-400 mb-2">Debug Log ({debug.length} entries)</summary>
          <div className="bg-gray-800 p-3 rounded max-h-40 overflow-y-auto">
            {debug.map((line, index) => (
              <div key={index} className="text-gray-300 font-mono text-xs mb-1">
                {line}
              </div>
            ))}
          </div>
        </details>

        <div className="mt-4 flex justify-between items-center">
          <div className="flex space-x-2">
            {(['token-url', 'direct'] as const).map((method) => (
              <button
                key={method}
                onClick={() => setStreamMethod(method)}
                className={`px-3 py-1 text-xs rounded ${
                  streamMethod === method ? 'bg-blue-600' : 'bg-gray-700'
                } text-white`}
              >
                {method === 'token-url' ? 'Token URL' : 'Direct'}
              </button>
            ))}
            <button
              onClick={tryDirectVideoElement}
              className="px-3 py-1 text-xs bg-purple-600 rounded hover:bg-purple-700 text-white"
            >
              Source Tags
            </button>
          </div>
          <button
            onClick={handleDownload}
            className="px-3 py-1 text-xs bg-green-600 rounded hover:bg-green-700 text-white"
          >
            <Download className="w-3 h-3 inline mr-1" />
            Download
          </button>
        </div>
      </div>
    </div>
  );
}