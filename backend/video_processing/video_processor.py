import os
import subprocess
import json
import tempfile
import logging
import psutil
import time
from typing import Optional, Dict, Tuple
from django.conf import settings

logger = logging.getLogger(__name__)

class GPUMonitor:
    @staticmethod
    def get_nvidia_gpu_usage() -> Optional[Dict]:
        try:
            cmd = [
                'nvidia-smi', 
                '--query-gpu=utilization.gpu,memory.used,memory.total,name', 
                '--format=csv,noheader,nounits'
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            
            if result.returncode == 0:
                lines = result.stdout.strip().split('\n')
                gpus = []
                
                for line in lines:
                    parts = line.split(', ')
                    if len(parts) >= 4:
                        gpu_util = int(parts[0])
                        mem_used = int(parts[1])
                        mem_total = int(parts[2])
                        gpu_name = parts[3]
                        
                        mem_usage_percent = (mem_used / mem_total) * 100
                        
                        gpus.append({
                            'name': gpu_name,
                            'gpu_utilization': gpu_util,
                            'memory_used_mb': mem_used,
                            'memory_total_mb': mem_total,
                            'memory_usage_percent': mem_usage_percent
                        })
                
                return {'gpus': gpus, 'available': True}
            
        except (subprocess.TimeoutExpired, FileNotFoundError, Exception) as e:
            logger.warning(f"Cannot get NVIDIA GPU info: {e}")
        
        return None
    
    @staticmethod
    def should_use_gpu(gpu_threshold_util=80, vram_threshold=85) -> Tuple[bool, str]:
        gpu_info = GPUMonitor.get_nvidia_gpu_usage()
        
        if not gpu_info:
            return False, "No NVIDIA GPU detected or nvidia-smi not available"
        
        for i, gpu in enumerate(gpu_info['gpus']):
            if gpu['gpu_utilization'] >= gpu_threshold_util:
                logger.info(f"GPU {i} utilization too high: {gpu['gpu_utilization']}%")
                continue
                
            if gpu['memory_usage_percent'] >= vram_threshold:
                logger.info(f"GPU {i} VRAM usage too high: {gpu['memory_usage_percent']:.1f}%")
                continue
            
            return True, f"Using GPU {i}: {gpu['name']} (GPU: {gpu['gpu_utilization']}%, VRAM: {gpu['memory_usage_percent']:.1f}%)"
        
        return False, "All GPUs are busy or overloaded"

class VideoProcessor:
    def __init__(self, input_path: str):
        self.input_path = input_path
        self.video_info = None
        
    def get_video_info(self) -> Optional[Dict]:
        if self.video_info:
            return self.video_info
            
        try:
            cmd = [
                'ffprobe', '-v', 'quiet', 
                '-print_format', 'json', 
                '-show_format', '-show_streams',
                self.input_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                self.video_info = json.loads(result.stdout)
                return self.video_info
            else:
                logger.error(f"ffprobe failed: {result.stderr}")
                return None
                
        except Exception as e:
            logger.error(f"ffprobe error: {e}")
            return None
    
    def is_h264_already(self) -> bool:
        info = self.get_video_info()
        if not info:
            return False
            
        video_streams = [s for s in info.get('streams', []) if s.get('codec_type') == 'video']
        if video_streams:
            codec = video_streams[0].get('codec_name', '').lower()
            return codec == 'h264'
        
        return False
    
    def get_video_resolution(self) -> Tuple[int, int]:
        info = self.get_video_info()
        if not info:
            return 1920, 1080
            
        video_streams = [s for s in info.get('streams', []) if s.get('codec_type') == 'video']
        if video_streams:
            width = video_streams[0].get('width', 1920)
            height = video_streams[0].get('height', 1080)
            return width, height
        
        return 1920, 1080
    
    def estimate_vram_usage(self) -> int:
        width, height = self.get_video_resolution()
        
        if width * height <= 1920 * 1080:
            return 200
        elif width * height <= 2560 * 1440:
            return 350
        elif width * height <= 3840 * 2160:
            return 500
        else:
            return 800
    
    def convert_to_h264_gpu(self, output_path: str, gpu_id: int = 0) -> bool:
        try:
            width, height = self.get_video_resolution()
            
            if width * height <= 1920 * 1080:
                video_bitrate = "2M"
                maxrate = "4M"
                bufsize = "4M"
            elif width * height <= 2560 * 1440:
                video_bitrate = "4M"
                maxrate = "6M"
                bufsize = "6M"
            elif width * height <= 3840 * 2160:
                video_bitrate = "8M"
                maxrate = "12M"
                bufsize = "12M"
            else:
                video_bitrate = "16M"
                maxrate = "24M"
                bufsize = "24M"
            
            cmd = [
                'ffmpeg',
                '-y',
                '-i', self.input_path,
                
                '-c:v', 'h264_nvenc',
                '-gpu', str(gpu_id),
                
                '-preset', 'medium',
                '-profile:v', 'high',
                '-level:v', '4.1',
                
                '-b:v', video_bitrate,
                '-maxrate', maxrate,
                '-bufsize', bufsize,
                
                '-c:a', 'aac',
                '-b:a', '128k',
                '-ac', '2',
                
                '-f', 'mp4',
                '-movflags', '+faststart',
                
                output_path
            ]
            
            logger.info(f"GPU encoding command: {' '.join(cmd)}")
            
            result = subprocess.run(
                cmd, 
                capture_output=True, 
                text=True, 
                timeout=3600
            )
            
            if result.returncode == 0:
                logger.info(f"GPU encoding successful: {output_path}")
                return True
            else:
                logger.error(f"GPU encoding failed: {result.stderr}")
                return False
                
        except subprocess.TimeoutExpired:
            logger.error("GPU encoding timeout")
            return False
        except Exception as e:
            logger.error(f"GPU encoding error: {e}")
            return False
    
    def convert_to_h264_cpu(self, output_path: str) -> bool:
        try:
            width, height = self.get_video_resolution()
            
            if width * height <= 1920 * 1080:
                preset = "medium"
                crf = "23"
            elif width * height <= 2560 * 1440:
                preset = "fast"
                crf = "24"
            else:
                preset = "faster"
                crf = "25"
            
            cmd = [
                'ffmpeg',
                '-y',
                '-i', self.input_path,
                
                '-c:v', 'libx264',
                '-preset', preset,
                '-crf', crf,
                '-profile:v', 'high',
                '-level:v', '4.1',
                
                '-threads', str(min(psutil.cpu_count(), 8)),
                
                '-c:a', 'aac',
                '-b:a', '128k',
                '-ac', '2',
                
                '-f', 'mp4',
                '-movflags', '+faststart',
                
                output_path
            ]
            
            logger.info(f"CPU encoding command: {' '.join(cmd)}")
            
            result = subprocess.run(
                cmd, 
                capture_output=True, 
                text=True, 
                timeout=7200
            )
            
            if result.returncode == 0:
                logger.info(f"CPU encoding successful: {output_path}")
                return True
            else:
                logger.error(f"CPU encoding failed: {result.stderr}")
                return False
                
        except subprocess.TimeoutExpired:
            logger.error("CPU encoding timeout")
            return False
        except Exception as e:
            logger.error(f"CPU encoding error: {e}")
            return False
    
    def process_video(self, output_path: str) -> Tuple[bool, str]:
        if self.is_h264_already():
            try:
                import shutil
                shutil.copy2(self.input_path, output_path)
                return True, "Video already in H.264 format, copied without conversion"
            except Exception as e:
                return False, f"Failed to copy H.264 video: {e}"
        
        should_use_gpu, gpu_reason = GPUMonitor.should_use_gpu()
        
        if should_use_gpu:
            estimated_vram = self.estimate_vram_usage()
            gpu_info = GPUMonitor.get_nvidia_gpu_usage()
            
            if gpu_info:
                for i, gpu in enumerate(gpu_info['gpus']):
                    vram_available = gpu['memory_total_mb'] - gpu['memory_used_mb']
                    
                    if vram_available >= estimated_vram:
                        logger.info(f"Using GPU {i} for encoding. {gpu_reason}")
                        logger.info(f"Estimated VRAM needed: {estimated_vram}MB, Available: {vram_available}MB")
                        
                        if self.convert_to_h264_gpu(output_path, i):
                            return True, f"Successfully converted using GPU {i}"
                        else:
                            logger.warning(f"GPU {i} encoding failed, falling back to CPU")
                            break
                    else:
                        logger.info(f"GPU {i} doesn't have enough VRAM: need {estimated_vram}MB, available {vram_available}MB")
        
        logger.info(f"Using CPU for encoding. Reason: {gpu_reason if not should_use_gpu else 'GPU encoding failed'}")
        
        if self.convert_to_h264_cpu(output_path):
            return True, "Successfully converted using CPU"
        else:
            return False, "Both GPU and CPU encoding failed"

def process_uploaded_video(file_path: str) -> Tuple[bool, str, Optional[str]]:
    try:
        processor = VideoProcessor(file_path)
        
        base_dir = os.path.dirname(file_path)
        original_name = os.path.basename(file_path)
        name_without_ext = os.path.splitext(original_name)[0]
        temp_output_path = os.path.join(base_dir, f"{name_without_ext}_temp.mp4")
        
        success, message = processor.process_video(temp_output_path)
        
        if success:
            return True, message, temp_output_path
        else:
            return False, message, None
            
    except Exception as e:
        logger.error(f"Video processing error: {e}")
        return False, f"Video processing failed: {e}", None