'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle, Play } from 'lucide-react';

interface SimpleVideoPlayerProps {
  fileId: string;
  fileName: string;
  fileSize: number;
}

export default function SimpleVideoPlayer({ fileId, fileName, fileSize }: SimpleVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [debug, setDebug] = useState<string[]>([]);

  const addDebug = (message: string) => {
    setDebug(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
    console.log(`Video Debug: ${message}`);
  };

  useEffect(() => {
    if (fileId) {
      initializeVideo();
    }
    return () => {
      if (videoRef.current) {
        videoRef.current.src = '';
        videoRef.current.load();
      }
    };
  }, [fileId]);

  const initializeVideo = async () => {
    setIsLoading(true);
    setError('');
    addDebug(`Initializing video for file ${fileId}`);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token');
      }

      addDebug('Token found, testing stream URL');
      
      const streamUrl = `http://localhost:8000/media-preview/video/${fileId}/stream/?token=${token}`;
      setVideoUrl(streamUrl);
      addDebug(`Stream URL: ${streamUrl}`);

      const testResponse = await fetch(streamUrl, {
        method: 'HEAD',
      });

      addDebug(`Test response status: ${testResponse.status}`);
      
      if (testResponse.ok) {
        addDebug('Stream URL accessible, setting video source');
        if (videoRef.current) {
          videoRef.current.src = streamUrl;
          videoRef.current.load();
        }
      } else {
        throw new Error(`Stream not accessible: ${testResponse.status}`);
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      addDebug(`Error: ${errorMessage}`);
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  const handleVideoLoad = () => {
    addDebug('Video loaded successfully');
    setIsLoading(false);
  };

  const handleVideoError = (e: any) => {
    const video = videoRef.current;
    const errorCode = video?.error?.code;
    const errorMessages = {
      1: 'Video loading aborted',
      2: 'Network error',
      3: 'Decode error', 
      4: 'Video not supported'
    };
    
    const errorMessage = errorMessages[errorCode as keyof typeof errorMessages] || 'Unknown video error';
    addDebug(`Video error: ${errorMessage} (code: ${errorCode})`);
    setError(errorMessage);
    setIsLoading(false);
  };

  const handleCanPlay = () => {
    addDebug('Video can play');
    setIsLoading(false);
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const testDirectAccess = async () => {
    addDebug('Testing direct file access');
    try {
      const token = localStorage.getItem('token');
      const testUrl = `http://localhost:8000/media-preview/video/${fileId}/stream/`;
      
      const response = await fetch(testUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Range': 'bytes=0-1023'
        }
      });
      
      addDebug(`Direct access test: ${response.status}`);
      
      if (response.ok) {
        addDebug('Direct access successful, trying with Authorization header');
        if (videoRef.current) {
          videoRef.current.src = testUrl;
          videoRef.current.load();
        }
      }
    } catch (err) {
      addDebug(`Direct access failed: ${err}`);
    }
  };

  if (error && !isLoading) {
    return (
      <div className="bg-black rounded-lg p-8">
        <div className="text-center text-white">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Video Load Error</h3>
          <p className="text-red-400 mb-4">{error}</p>
          <div className="text-sm text-gray-400 mb-6">
            <p>File: {fileName}</p>
            <p>Size: {formatFileSize(fileSize)}</p>
            <p>URL: {videoUrl}</p>
          </div>
          
          <div className="space-y-2 mb-6">
            <button
              onClick={initializeVideo}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 mr-2"
            >
              Retry with Token
            </button>
            <button
              onClick={testDirectAccess}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Try Direct Access
            </button>
          </div>

          <div className="text-left bg-gray-900 p-4 rounded max-h-40 overflow-y-auto">
            <h4 className="text-sm font-medium mb-2">Debug Log:</h4>
            {debug.map((line, index) => (
              <div key={index} className="text-xs text-gray-300 font-mono">
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

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
      
      <video
        ref={videoRef}
        className="w-full h-auto"
        controls
        preload="metadata"
        onLoadedData={handleVideoLoad}
        onCanPlay={handleCanPlay}
        onError={handleVideoError}
        onLoadStart={() => addDebug('Video load started')}
        onLoadedMetadata={() => addDebug('Video metadata loaded')}
        playsInline
      />
      
      <div className="p-4 bg-gray-900 text-white">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium truncate">{fileName}</span>
          <span className="text-xs text-gray-400">{formatFileSize(fileSize)}</span>
        </div>
        
        <div className="text-xs text-gray-500 mb-2">
          Stream URL: {videoUrl}
        </div>
        
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-400">Debug Info</summary>
          <div className="mt-2 bg-gray-800 p-2 rounded max-h-32 overflow-y-auto">
            {debug.map((line, index) => (
              <div key={index} className="text-gray-300 font-mono text-xs">
                {line}
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}