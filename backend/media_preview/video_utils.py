import subprocess
import json
import os
import logging

logger = logging.getLogger(__name__)

class VideoProcessor:
    def __init__(self, file_path):
        self.file_path = file_path
        self.info = None
        
    def get_video_info(self):
        if self.info:
            return self.info
            
        try:
            cmd = [
                'ffprobe', '-v', 'quiet', 
                '-print_format', 'json', 
                '-show_format', '-show_streams',
                self.file_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                self.info = json.loads(result.stdout)
                return self.info
            else:
                logger.error(f"ffprobe failed: {result.stderr}")
                return None
                
        except subprocess.TimeoutExpired:
            logger.error("ffprobe timeout")
            return None
        except FileNotFoundError:
            logger.warning("ffprobe not found, using fallback")
            return self._get_basic_info()
        except Exception as e:
            logger.error(f"ffprobe error: {e}")
            return None
    
    def _get_basic_info(self):
        return {
            'format': {'size': str(os.path.getsize(self.file_path))},
            'streams': [{'codec_name': 'h264', 'codec_type': 'video'}]
        }
    
    def is_web_compatible(self):
        info = self.get_video_info()
        if not info:
            return False
            
        video_streams = [s for s in info.get('streams', []) if s.get('codec_type') == 'video']
        if not video_streams:
            return False
            
        video_codec = video_streams[0].get('codec_name', '').lower()
        compatible_codecs = ['h264', 'h265', 'vp8', 'vp9', 'av1']
        
        return video_codec in compatible_codecs
    
    def get_content_type(self):
        info = self.get_video_info()
        if not info:
            return 'video/mp4'
            
        format_name = info.get('format', {}).get('format_name', '').lower()
        
        if 'mp4' in format_name or 'mov' in format_name:
            return 'video/mp4'
        elif 'webm' in format_name:
            return 'video/webm'
        elif 'avi' in format_name:
            return 'video/x-msvideo'
        else:
            return 'video/mp4'
    
    def get_file_size(self):
        return os.path.getsize(self.file_path)
    
    def needs_conversion(self):
        if self.get_file_size() > 1024 * 1024 * 1024:
            return True
        return not self.is_web_compatible()

def get_optimal_mime_type(file_path):
    processor = VideoProcessor(file_path)
    return processor.get_content_type()