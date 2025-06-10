interface NetworkCondition {
  condition: 'weak' | 'medium' | 'strong' | 'excellent';
  downloadSpeed: number; // Mbps
  uploadSpeed: number; // Mbps
  latency: number; // ms
  packetLoss: number; // percentage
}

interface ChunkSizeOption {
  name: 'small' | 'medium' | 'large' | 'xlarge';
  sizeBytes: number;
  sizeMB: number;
  description: string;
  pros: string[];
  cons: string[];
}

interface UploadConfig {
  chunkSizeName: string;
  chunkSizeBytes: number;
  chunkSizeMB: number;
  concurrentChunks: number;
  retryAttempts: number;
  timeoutSeconds: number;
  totalChunks: number;
  networkCondition: string;
  fileSizeMB: number;
  estimatedUploadTimeMinutes: number;
  resumability: {
    excellent: boolean;
    good: boolean;
    limited: boolean;
  };
}

class NetworkOptimizer {
  private static instance: NetworkOptimizer;
  private networkCondition: NetworkCondition | null = null;
  private lastSpeedTest: number = 0;
  private readonly SPEED_TEST_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  static getInstance(): NetworkOptimizer {
    if (!NetworkOptimizer.instance) {
      NetworkOptimizer.instance = new NetworkOptimizer();
    }
    return NetworkOptimizer.instance;
  }

  /**
   * Test network speed using a small download/upload test
   */
  async testNetworkSpeed(): Promise<NetworkCondition> {
    const now = Date.now();
    
    // Use cached result if recent
    if (this.networkCondition && (now - this.lastSpeedTest) < this.SPEED_TEST_CACHE_DURATION) {
      return this.networkCondition;
    }

    try {
      const downloadSpeed = await this.measureDownloadSpeed();
      const uploadSpeed = await this.measureUploadSpeed();
      const latency = await this.measureLatency();
      
      const condition = this.classifyNetworkCondition(downloadSpeed, uploadSpeed, latency);
      
      this.networkCondition = {
        condition,
        downloadSpeed,
        uploadSpeed,
        latency,
        packetLoss: 0 // Simplified for now
      };
      
      this.lastSpeedTest = now;
      return this.networkCondition;
      
    } catch (error) {
      console.warn('Network speed test failed, using default condition:', error);
      
      // Fallback to connection type estimation
      const connection = this.getConnectionType();
      return {
        condition: connection.condition,
        downloadSpeed: connection.estimatedSpeed,
        uploadSpeed: connection.estimatedSpeed * 0.8, // Upload usually slower
        latency: connection.estimatedLatency,
        packetLoss: 0
      };
    }
  }

  /**
   * Measure download speed using a test endpoint
   */
  private async measureDownloadSpeed(): Promise<number> {
    const testSizeKB = 1024; // 1MB test
    const testUrl = '/api/network/test'; // Our backend endpoint
    
    const startTime = performance.now();
    
    try {
      const response = await fetch(testUrl);
      const data = await response.json();
      
      const endTime = performance.now();
      const durationSeconds = (endTime - startTime) / 1000;
      const speedMbps = (testSizeKB * 8) / (durationSeconds * 1000); // Convert to Mbps
      
      return Math.max(speedMbps, 0.1); // Minimum 0.1 Mbps
    } catch (error) {
      return 10; // Default assumption
    }
  }

  /**
   * Measure upload speed with a small test
   */
  private async measureUploadSpeed(): Promise<number> {
    const testData = new Blob(['0'.repeat(100 * 1024)]); // 100KB test
    const formData = new FormData();
    formData.append('test', testData);
    
    const startTime = performance.now();
    
    try {
      const response = await fetch('/api/network/test', {
        method: 'POST',
        body: formData
      });
      
      const endTime = performance.now();
      const durationSeconds = (endTime - startTime) / 1000;
      const speedMbps = (100 * 8) / (durationSeconds * 1000); // Convert to Mbps
      
      return Math.max(speedMbps, 0.1);
    } catch (error) {
      return 5; // Conservative default
    }
  }

  /**
   * Measure network latency
   */
  private async measureLatency(): Promise<number> {
    const startTime = performance.now();
    
    try {
      await fetch('/api/network/test', { method: 'HEAD' });
      const endTime = performance.now();
      return endTime - startTime;
    } catch (error) {
      return 100; // Default 100ms
    }
  }

  /**
   * Classify network condition based on measurements
   */
  private classifyNetworkCondition(
    downloadSpeed: number, 
    uploadSpeed: number, 
    latency: number
  ): 'weak' | 'medium' | 'strong' | 'excellent' {
    const avgSpeed = (downloadSpeed + uploadSpeed) / 2;
    
    if (avgSpeed >= 100 && latency < 20) return 'excellent'; // Fiber/Enterprise
    if (avgSpeed >= 25 && latency < 50) return 'strong';     // Good broadband
    if (avgSpeed >= 5 && latency < 100) return 'medium';     // Average connection
    return 'weak';                                           // Slow/mobile connection
  }

  /**
   * Get connection type from browser API
   */
  private getConnectionType(): { condition: 'weak' | 'medium' | 'strong' | 'excellent'; estimatedSpeed: number; estimatedLatency: number } {
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      
      switch (connection.effectiveType) {
        case '4g':
          return { condition: 'strong', estimatedSpeed: 20, estimatedLatency: 30 };
        case '3g':
          return { condition: 'medium', estimatedSpeed: 5, estimatedLatency: 80 };
        case '2g':
          return { condition: 'weak', estimatedSpeed: 1, estimatedLatency: 200 };
        case 'slow-2g':
          return { condition: 'weak', estimatedSpeed: 0.5, estimatedLatency: 500 };
        default:
          return { condition: 'medium', estimatedSpeed: 10, estimatedLatency: 50 };
      }
    }
    
    return { condition: 'medium', estimatedSpeed: 10, estimatedLatency: 50 };
  }

  /**
   * Get recommended upload configuration for a file
   */
  async getUploadConfig(fileSize: number): Promise<UploadConfig> {
    const networkCondition = await this.testNetworkSpeed();
    
    try {
      const response = await fetch(
        `/api/upload/config?file_size=${fileSize}&network_condition=${networkCondition.condition}`
      );
      
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn('Failed to get upload config from backend, using fallback');
    }
    
    // Fallback configuration
    return this.getFallbackConfig(fileSize, networkCondition.condition);
  }

  /**
   * Get all available chunk size options
   */
  async getChunkSizeOptions(): Promise<{ options: Record<string, ChunkSizeOption>; default: string; recommendations: Record<string, string> }> {
    try {
      const response = await fetch('/api/upload/chunk-sizes');
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn('Failed to get chunk size options from backend');
    }
    
    // Fallback options
    return {
      options: {
        small: {
          name: 'small',
          sizeBytes: 1024 * 1024,
          sizeMB: 1,
          description: '1MB - Good resumability, suitable for weak/unstable networks',
          pros: ['Excellent resumability', 'Low memory usage', 'Works on slow connections'],
          cons: ['Slower upload', 'Many small requests', 'Higher overhead']
        },
        medium: {
          name: 'medium',
          sizeBytes: 10 * 1024 * 1024,
          sizeMB: 10,
          description: '10MB - Well-balanced choice, recommended for most cases',
          pros: ['Good balance of speed and reliability', 'Reasonable memory usage', 'Good resumability'],
          cons: ['May be slow for very large files']
        },
        large: {
          name: 'large',
          sizeBytes: 20 * 1024 * 1024,
          sizeMB: 20,
          description: '20MB - Faster uploads, suitable for strong networks',
          pros: ['Fast upload speeds', 'Fewer requests', 'Good for large files'],
          cons: ['Higher memory usage', 'Less resumable on connection issues']
        },
        xlarge: {
          name: 'xlarge',
          sizeBytes: 50 * 1024 * 1024,
          sizeMB: 50,
          description: '50MB - Very fast, best for very large files (>2GB) on stable networks',
          pros: ['Very fast uploads', 'Minimal overhead', 'Excellent for huge files'],
          cons: ['High memory usage', 'Difficult to resume', 'Requires stable connection']
        }
      },
      default: 'large',
      recommendations: {
        weak_network: 'small',
        mobile_data: 'small',
        home_wifi: 'medium',
        office_ethernet: 'large',
        datacenter: 'xlarge'
      }
    };
  }

  /**
   * Fallback configuration if backend is unavailable
   */
  private getFallbackConfig(fileSize: number, networkCondition: string): UploadConfig {
    let chunkSizeName = 'medium';
    let concurrentChunks = 3;
    
    switch (networkCondition) {
      case 'weak':
        chunkSizeName = 'small';
        concurrentChunks = 2;
        break;
      case 'medium':
        chunkSizeName = 'medium';
        concurrentChunks = 3;
        break;
      case 'strong':
        chunkSizeName = 'large';
        concurrentChunks = 4;
        break;
      case 'excellent':
        chunkSizeName = fileSize > 2 * 1024 * 1024 * 1024 ? 'xlarge' : 'large';
        concurrentChunks = 6;
        break;
    }
    
    const chunkSizeMap = {
      small: 1 * 1024 * 1024,
      medium: 10 * 1024 * 1024,
      large: 20 * 1024 * 1024,
      xlarge: 50 * 1024 * 1024
    };
    
    const chunkSizeBytes = chunkSizeMap[chunkSizeName as keyof typeof chunkSizeMap];
    const totalChunks = Math.ceil(fileSize / chunkSizeBytes);
    
    return {
      chunkSizeName,
      chunkSizeBytes,
      chunkSizeMB: chunkSizeBytes / (1024 * 1024),
      concurrentChunks,
      retryAttempts: networkCondition === 'weak' ? 5 : 3,
      timeoutSeconds: networkCondition === 'weak' ? 60 : 30,
      totalChunks,
      networkCondition,
      fileSizeMB: fileSize / (1024 * 1024),
      estimatedUploadTimeMinutes: (totalChunks * chunkSizeBytes) / (10 * 1024 * 1024) / 60,
      resumability: {
        excellent: chunkSizeName === 'small' || chunkSizeName === 'medium',
        good: chunkSizeName === 'large',
        limited: chunkSizeName === 'xlarge'
      }
    };
  }

  /**
   * Get current network condition (cached)
   */
  getCurrentNetworkCondition(): NetworkCondition | null {
    return this.networkCondition;
  }

  /**
   * Format network condition for display
   */
  formatNetworkCondition(condition: NetworkCondition): string {
    const conditionLabels = {
      weak: 'Weak Network',
      medium: 'Medium Network', 
      strong: 'Strong Network',
      excellent: 'Excellent Network'
    };
    
    return `${conditionLabels[condition.condition]} (${condition.downloadSpeed.toFixed(1)} Mbps ↓, ${condition.uploadSpeed.toFixed(1)} Mbps ↑, ${condition.latency.toFixed(0)}ms ping)`;
  }
}

export default NetworkOptimizer;
export type { NetworkCondition, ChunkSizeOption, UploadConfig };