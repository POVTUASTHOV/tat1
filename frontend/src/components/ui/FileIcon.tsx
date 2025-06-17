import React from 'react';
import { 
  FileText, 
  Image, 
  Video, 
  Music, 
  Archive, 
  File, 
  FileSpreadsheet,
  FileCode,
  Folder,
  FolderOpen
} from 'lucide-react';

interface FileIconProps {
  fileName: string;
  contentType: string;
  isFolder?: boolean;
  isOpen?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const FileIcon: React.FC<FileIconProps> = ({ 
  fileName, 
  contentType, 
  isFolder = false, 
  isOpen = false,
  size = 'md',
  className = '' 
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6', 
    lg: 'w-8 h-8'
  };

  const iconSize = sizeClasses[size];

  // Folder icons
  if (isFolder) {
    return isOpen ? 
      <FolderOpen className={`${iconSize} text-blue-500 ${className}`} /> :
      <Folder className={`${iconSize} text-blue-600 ${className}`} />;
  }

  // Get file extension
  const extension = fileName.split('.').pop()?.toLowerCase() || '';

  // File type based on content type
  if (contentType.startsWith('image/')) {
    return <Image className={`${iconSize} text-green-500 ${className}`} />;
  }
  
  if (contentType.startsWith('video/')) {
    return <Video className={`${iconSize} text-red-500 ${className}`} />;
  }
  
  if (contentType.startsWith('audio/')) {
    return <Music className={`${iconSize} text-purple-500 ${className}`} />;
  }

  // File extension based icons
  switch (extension) {
    case 'pdf':
      return <FileText className={`${iconSize} text-red-600 ${className}`} />;
    case 'doc':
    case 'docx':
      return <FileText className={`${iconSize} text-blue-600 ${className}`} />;
    case 'xls':
    case 'xlsx':
    case 'csv':
      return <FileSpreadsheet className={`${iconSize} text-green-600 ${className}`} />;
    case 'zip':
    case 'rar':
    case 'tar':
    case 'gz':
      return <Archive className={`${iconSize} text-orange-500 ${className}`} />;
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
    case 'py':
    case 'java':
    case 'cpp':
    case 'c':
    case 'html':
    case 'css':
    case 'json':
      return <FileCode className={`${iconSize} text-blue-500 ${className}`} />;
    case 'txt':
    case 'md':
      return <FileText className={`${iconSize} text-gray-600 ${className}`} />;
    default:
      return <File className={`${iconSize} text-gray-500 ${className}`} />;
  }
};

export default FileIcon;