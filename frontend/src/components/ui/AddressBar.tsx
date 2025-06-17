'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronRight } from 'lucide-react';

interface AddressBarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  className?: string;
}

interface PathSegment {
  name: string;
  fullPath: string;
}

export default function AddressBar({ currentPath, onNavigate, className = '' }: AddressBarProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(currentPath);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Convert to Windows-style path for display
    const windowsPath = currentPath === '/' ? 'Projects' : currentPath.replace(/\//g, '\\');
    setInputValue(windowsPath);
  }, [currentPath]);

  // Parse path into segments (Windows style)
  const parsePathSegments = (path: string): PathSegment[] => {
    if (!path || path === '/') {
      return [{ name: 'Projects', fullPath: '/' }];
    }

    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    const parts = cleanPath.split('/').filter(part => part.length > 0);
    
    // Start with "Projects" as root instead of just "Root"
    const segments: PathSegment[] = [{ name: 'Projects', fullPath: '/' }];
    
    parts.forEach((part, index) => {
      const fullPath = '/' + parts.slice(0, index + 1).join('/');
      segments.push({ name: part, fullPath });
    });

    return segments;
  };

  const segments = parsePathSegments(currentPath);

  const handleBreadcrumbClick = (segment: PathSegment) => {
    onNavigate(segment.fullPath);
  };

  const handleInputSubmit = () => {
    const trimmedValue = inputValue.trim();
    
    if (!trimmedValue) {
      alert('Invalid path');
      const windowsPath = currentPath === '/' ? 'Projects' : currentPath.replace(/\//g, '\\');
      setInputValue(windowsPath);
      setIsEditing(false);
      return;
    }

    // Handle special case of just "Projects"
    if (trimmedValue === 'Projects') {
      onNavigate('/');
      setIsEditing(false);
      return;
    }

    // Basic path validation
    if (trimmedValue.includes('..') || trimmedValue.includes('//') || trimmedValue.includes('\\\\')) {
      alert('Invalid path');
      const windowsPath = currentPath === '/' ? 'Projects' : currentPath.replace(/\//g, '\\');
      setInputValue(windowsPath);
      setIsEditing(false);
      return;
    }

    // Normalize path - handle both Windows-style (with backslashes) and Unix-style
    let normalizedPath = trimmedValue.replace(/\\/g, '/'); // Convert backslashes to forward slashes
    if (!normalizedPath.startsWith('/')) {
      normalizedPath = '/' + normalizedPath;
    }

    onNavigate(normalizedPath);
    setIsEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInputSubmit();
    } else if (e.key === 'Escape') {
      const windowsPath = currentPath === '/' ? 'Projects' : currentPath.replace(/\//g, '\\');
      setInputValue(windowsPath);
      setIsEditing(false);
    }
  };

  const enterEditMode = () => {
    setIsEditing(true);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 0);
  };

  return (
    <div className={`bg-white border border-gray-300 rounded-sm ${className}`}>
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
          onBlur={handleInputSubmit}
          className="w-full px-3 py-1.5 text-sm font-sans border-none outline-none bg-transparent"
          style={{ fontFamily: 'Arial, sans-serif' }}
        />
      ) : (
        <div 
          className="flex items-center min-h-[32px] px-1 cursor-text"
          onClick={enterEditMode}
        >
          {segments.map((segment, index) => (
            <div key={segment.fullPath} className="flex items-center">
              {index > 0 && (
                <ChevronRight className="w-3 h-3 text-gray-400 mx-1 flex-shrink-0" />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleBreadcrumbClick(segment);
                }}
                className="px-2 py-1 text-sm text-gray-700 hover:bg-blue-100 hover:text-blue-800 rounded transition-colors duration-150 font-sans whitespace-nowrap"
                style={{ fontFamily: 'Arial, sans-serif' }}
              >
                {segment.name}
              </button>
            </div>
          ))}
          {/* Clickable area to enter edit mode */}
          <div className="flex-1 min-w-0 h-full px-2" />
        </div>
      )}
    </div>
  );
}