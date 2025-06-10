'use client';

import { useState, useEffect } from 'react';
import { Wifi, WifiOff, Zap, Clock, Shield, ChevronDown, ChevronUp, Info } from 'lucide-react';
import NetworkOptimizer, { NetworkCondition, ChunkSizeOption, UploadConfig } from '@/lib/networkOptimizer';

interface UploadOptimizerProps {
  fileSize: number;
  onConfigChange: (config: UploadConfig) => void;
  className?: string;
}

export default function UploadOptimizer({ fileSize, onConfigChange, className = '' }: UploadOptimizerProps) {
  const [networkCondition, setNetworkCondition] = useState<NetworkCondition | null>(null);
  const [uploadConfig, setUploadConfig] = useState<UploadConfig | null>(null);
  const [chunkSizeOptions, setChunkSizeOptions] = useState<Record<string, ChunkSizeOption>>({});
  const [isTestingNetwork, setIsTestingNetwork] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedChunkSize, setSelectedChunkSize] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const networkOptimizer = NetworkOptimizer.getInstance();

  useEffect(() => {
    loadInitialConfig();
  }, [fileSize]);

  const loadInitialConfig = async () => {
    setLoading(true);
    try {
      // Load chunk size options
      const options = await networkOptimizer.getChunkSizeOptions();
      setChunkSizeOptions(options.options);

      // Test network and get config
      await testNetworkAndGetConfig();
    } catch (error) {
      console.error('Failed to load upload configuration:', error);
    } finally {
      setLoading(false);
    }
  };

  const testNetworkAndGetConfig = async () => {
    setIsTestingNetwork(true);
    try {
      const condition = await networkOptimizer.testNetworkSpeed();
      setNetworkCondition(condition);

      const config = await networkOptimizer.getUploadConfig(fileSize);
      setUploadConfig(config);
      setSelectedChunkSize(config.chunkSizeName);
      onConfigChange(config);
    } catch (error) {
      console.error('Network test failed:', error);
    } finally {
      setIsTestingNetwork(false);
    }
  };

  const handleChunkSizeChange = async (chunkSizeName: string) => {
    setSelectedChunkSize(chunkSizeName);
    
    if (networkCondition) {
      try {
        const config = await networkOptimizer.getUploadConfig(fileSize);
        // Override with selected chunk size
        const selectedOption = chunkSizeOptions[chunkSizeName];
        if (selectedOption) {
          const updatedConfig = {
            ...config,
            chunkSizeName,
            chunkSizeBytes: selectedOption.sizeBytes,
            chunkSizeMB: selectedOption.sizeMB,
            totalChunks: Math.ceil(fileSize / selectedOption.sizeBytes)
          };
          setUploadConfig(updatedConfig);
          onConfigChange(updatedConfig);
        }
      } catch (error) {
        console.error('Failed to update config:', error);
      }
    }
  };

  const getNetworkIcon = (condition: string) => {
    switch (condition) {
      case 'excellent': return <Zap className="w-5 h-5 text-green-500" />;
      case 'strong': return <Wifi className="w-5 h-5 text-blue-500" />;
      case 'medium': return <Wifi className="w-5 h-5 text-yellow-500" />;
      case 'weak': return <WifiOff className="w-5 h-5 text-red-500" />;
      default: return <Wifi className="w-5 h-5 text-gray-500" />;
    }
  };

  const getResumabilityColor = (level: string) => {
    switch (level) {
      case 'excellent': return 'text-green-600 bg-green-100';
      case 'good': return 'text-blue-600 bg-blue-100';
      case 'limited': return 'text-orange-600 bg-orange-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getResumabilityLevel = (config: UploadConfig) => {
    if (config.resumability.excellent) return 'excellent';
    if (config.resumability.good) return 'good';
    if (config.resumability.limited) return 'limited';
    return 'unknown';
  };

  if (loading) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Optimizing upload settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Zap className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">Upload Optimization</h3>
        </div>
        <button
          onClick={testNetworkAndGetConfig}
          disabled={isTestingNetwork}
          className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
        >
          {isTestingNetwork ? 'Testing...' : 'Retest Network'}
        </button>
      </div>

      {/* Network Status */}
      {networkCondition && (
        <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-3">
            {getNetworkIcon(networkCondition.condition)}
            <div>
              <p className="font-medium text-gray-900 capitalize">{networkCondition.condition} Network</p>
              <p className="text-sm text-gray-600">
                {networkCondition.downloadSpeed.toFixed(1)} Mbps ↓ • {networkCondition.uploadSpeed.toFixed(1)} Mbps ↑ • {networkCondition.latency.toFixed(0)}ms
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Upload Configuration */}
      {uploadConfig && (
        <div className="space-y-4">
          {/* Recommended Settings */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-blue-900">Chunk Size</span>
                <Shield className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-lg font-bold text-blue-900">{uploadConfig.chunkSizeMB} MB</p>
              <p className="text-xs text-blue-700">{uploadConfig.totalChunks} chunks</p>
            </div>

            <div className="bg-green-50 p-3 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-green-900">Parallel Uploads</span>
                <Zap className="w-4 h-4 text-green-600" />
              </div>
              <p className="text-lg font-bold text-green-900">{uploadConfig.concurrentChunks}</p>
              <p className="text-xs text-green-700">simultaneous chunks</p>
            </div>

            <div className="bg-orange-50 p-3 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-orange-900">Est. Time</span>
                <Clock className="w-4 h-4 text-orange-600" />
              </div>
              <p className="text-lg font-bold text-orange-900">
                {uploadConfig.estimatedUploadTimeMinutes < 1 
                  ? '<1 min' 
                  : `${Math.ceil(uploadConfig.estimatedUploadTimeMinutes)} min`
                }
              </p>
              <p className="text-xs text-orange-700">estimated</p>
            </div>
          </div>

          {/* Resumability Indicator */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-sm font-medium text-gray-700">Resumability</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getResumabilityColor(getResumabilityLevel(uploadConfig))}`}>
              {getResumabilityLevel(uploadConfig)}
            </span>
          </div>

          {/* Advanced Options Toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between w-full text-left text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            <span>Advanced Options</span>
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {/* Advanced Options */}
          {showAdvanced && (
            <div className="space-y-4 border-t border-gray-200 pt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Chunk Size Override
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(chunkSizeOptions).map(([key, option]) => (
                    <label key={key} className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="radio"
                        name="chunkSize"
                        value={key}
                        checked={selectedChunkSize === key}
                        onChange={(e) => handleChunkSizeChange(e.target.value)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900">{option.sizeMB} MB</span>
                          {key === uploadConfig.chunkSizeName && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                              Recommended
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{option.description}</p>
                        <div className="mt-1">
                          <div className="flex flex-wrap gap-1">
                            {option.pros.slice(0, 2).map((pro, index) => (
                              <span key={index} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                ✓ {pro}
                              </span>
                            ))}
                          </div>
                          {option.cons.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {option.cons.slice(0, 1).map((con, index) => (
                                <span key={index} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                                  ⚠ {con}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="flex items-start space-x-2">
                  <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">Optimization Tips:</p>
                    <ul className="space-y-1 text-xs">
                      <li>• Larger chunks = faster uploads but harder to resume</li>
                      <li>• Smaller chunks = better for unstable connections</li>
                      <li>• The system automatically recommends optimal settings</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}