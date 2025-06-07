// frontend/src/components/ui/GpuStatusWidget.tsx

'use client';

import { useState, useEffect } from 'react';
import { Zap, Cpu, AlertCircle, RefreshCw } from 'lucide-react';
import Button from './Button';

interface GpuStatusWidgetProps {
  className?: string;
}

interface GpuInfo {
  name: string;
  gpu_utilization: number;
  memory_used_mb: number;
  memory_total_mb: number;
  memory_usage_percent: number;
}

interface GpuStatus {
  video_processing_available: boolean;
  gpu_available: boolean;
  should_use_gpu: boolean;
  reason: string;
  gpu_info?: {
    gpus: GpuInfo[];
  };
}

export default function GpuStatusWidget({ className = '' }: GpuStatusWidgetProps) {
  const [gpuStatus, setGpuStatus] = useState<GpuStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const checkGpuStatus = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:8001/api/gpu/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setGpuStatus(data);
      }
    } catch (error) {
      console.error('Failed to check GPU status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkGpuStatus();
    // Auto refresh every 30 seconds
    const interval = setInterval(checkGpuStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!gpuStatus) {
    return (
      <div className={`bg-white rounded-lg shadow p-4 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  const getStatusColor = () => {
    if (!gpuStatus.video_processing_available) return 'text-red-600';
    if (gpuStatus.should_use_gpu) return 'text-green-600';
    return 'text-orange-600';
  };

  const getStatusIcon = () => {
    if (!gpuStatus.video_processing_available) {
      return <AlertCircle className="w-5 h-5 text-red-600" />;
    }
    if (gpuStatus.should_use_gpu) {
      return <Zap className="w-5 h-5 text-green-600" />;
    }
    return <Cpu className="w-5 h-5 text-orange-600" />;
  };

  const getStatusText = () => {
    if (!gpuStatus.video_processing_available) {
      return 'Video Processing Unavailable';
    }
    if (gpuStatus.should_use_gpu) {
      return 'GPU Acceleration Ready';
    }
    return 'CPU Processing Mode';
  };

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {getStatusIcon()}
            <div>
              <h3 className={`text-sm font-medium ${getStatusColor()}`}>
                {getStatusText()}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                {gpuStatus.reason}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={checkGpuStatus}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            
            {gpuStatus.gpu_info && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? 'Less' : 'Details'}
              </Button>
            )}
          </div>
        </div>

        {isExpanded && gpuStatus.gpu_info && (
          <div className="mt-4 space-y-3">
            {gpuStatus.gpu_info.gpus.map((gpu, index) => (
              <div key={index} className="bg-gray-50 rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900">
                    GPU {index}: {gpu.name}
                  </span>
                  <span className="text-xs text-gray-500">
                    {gpu.memory_used_mb}MB / {gpu.memory_total_mb}MB
                  </span>
                </div>
                
                {/* GPU Utilization Bar */}
                <div className="mb-2">
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>GPU Usage</span>
                    <span>{gpu.gpu_utilization}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        gpu.gpu_utilization > 80 ? 'bg-red-500' : 
                        gpu.gpu_utilization > 60 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${gpu.gpu_utilization}%` }}
                    ></div>
                  </div>
                </div>

                {/* VRAM Usage Bar */}
                <div>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>VRAM Usage</span>
                    <span>{gpu.memory_usage_percent.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        gpu.memory_usage_percent > 85 ? 'bg-red-500' : 
                        gpu.memory_usage_percent > 70 ? 'bg-yellow-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${gpu.memory_usage_percent}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!gpuStatus.video_processing_available && (
          <div className="mt-3 p-3 bg-red-50 rounded border border-red-200">
            <p className="text-sm text-red-800">
              Video processing is unavailable. Install ffmpeg and configure the video processing module 
              to enable automatic H.264 conversion for uploaded videos.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}