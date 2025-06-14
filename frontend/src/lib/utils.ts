import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { FileItem } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export interface FilePair {
  id: string;
  type: 'single' | 'paired';
  displayName: string;
  primaryFile: FileItem;
  pairFile?: FileItem;
  files: FileItem[];
}

export function isImageFile(contentType: string): boolean {
  return contentType.startsWith('image/');
}

export function isPairableFile(fileName: string): boolean {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return ['json', 'txt'].includes(extension || '');
}

export function getFileBaseName(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.');
  return lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
}

export function createFilePairs(files: FileItem[]): FilePair[] {
  const pairs: FilePair[] = [];
  const processedFiles = new Set<string>();

  files.forEach(file => {
    if (processedFiles.has(file.id)) return;

    const isImage = isImageFile(file.content_type);
    
    if (isImage) {
      const baseName = getFileBaseName(file.name);
      
      // Look for matching pair file (JSON or TXT)
      const pairFile = files.find(f => 
        f.id !== file.id && 
        !processedFiles.has(f.id) &&
        isPairableFile(f.name) &&
        getFileBaseName(f.name) === baseName
      );

      if (pairFile) {
        // Create paired group
        const pairExtension = pairFile.name.split('.').pop()?.toLowerCase();
        pairs.push({
          id: `pair-${file.id}-${pairFile.id}`,
          type: 'paired',
          displayName: `${file.name} + ${pairExtension}`,
          primaryFile: file,
          pairFile: pairFile,
          files: [file, pairFile]
        });
        processedFiles.add(file.id);
        processedFiles.add(pairFile.id);
      } else {
        // Single image file
        pairs.push({
          id: file.id,
          type: 'single',
          displayName: file.name,
          primaryFile: file,
          files: [file]
        });
        processedFiles.add(file.id);
      }
    } else {
      // Non-image file, check if it's not already paired
      if (!processedFiles.has(file.id)) {
        pairs.push({
          id: file.id,
          type: 'single',
          displayName: file.name,
          primaryFile: file,
          files: [file]
        });
        processedFiles.add(file.id);
      }
    }
  });

  return pairs;
}