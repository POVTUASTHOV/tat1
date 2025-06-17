'use client';

import { ChevronRight, FolderOpen, Home } from 'lucide-react';
import Button from './Button';
import FileIcon from './FileIcon';

interface BreadcrumbItem {
  id: string;
  name: string;
  type: 'project' | 'folder';
  projectId?: string;
  path?: string;
}

interface VerticalBreadcrumbProps {
  breadcrumbs: BreadcrumbItem[];
  onNavigate: (item: BreadcrumbItem) => void;
  onClear?: () => void;
  className?: string;
}

export default function VerticalBreadcrumb({ 
  breadcrumbs, 
  onNavigate, 
  onClear,
  className = '' 
}: VerticalBreadcrumbProps) {
  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <div className={`bg-white rounded-lg shadow border border-gray-200 ${className}`}>
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">Current Location</h3>
          {onClear && breadcrumbs.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              ✕ Clear
            </Button>
          )}
        </div>
      </div>
      
      <div className="p-4">
        <div className="space-y-2">
          {breadcrumbs.map((item, index) => {
            const isLast = index === breadcrumbs.length - 1;
            const indentLevel = index;
            
            return (
              <div key={item.id} className="flex items-center">
                {/* Indentation lines for nested levels */}
                {indentLevel > 0 && (
                  <div className="flex items-center mr-2">
                    {Array.from({ length: indentLevel }).map((_, lineIndex) => (
                      <div key={lineIndex} className="w-4 flex justify-center">
                        {lineIndex === indentLevel - 1 ? (
                          <div className="w-4 h-4 flex items-center justify-center">
                            <div className="w-2 h-px bg-gray-300"></div>
                          </div>
                        ) : (
                          <div className="w-px h-6 bg-gray-200"></div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Breadcrumb item */}
                <button
                  onClick={() => onNavigate(item)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm transition-colors min-w-0 ${
                    isLast
                      ? 'bg-blue-50 text-blue-800 font-medium cursor-default'
                      : 'text-blue-600 hover:bg-blue-50 hover:text-blue-800'
                  }`}
                  disabled={isLast}
                >
                  {/* Icon */}
                  {item.type === 'project' ? (
                    <Home className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <FileIcon 
                      fileName={item.name} 
                      contentType="" 
                      isFolder={true} 
                      size="sm" 
                      className="w-4 h-4 flex-shrink-0" 
                    />
                  )}
                  
                  {/* Name */}
                  <span className="truncate">{item.name}</span>
                  
                  {/* Arrow for non-last items */}
                  {!isLast && (
                    <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
        
        {/* Path summary at bottom */}
        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="text-xs text-gray-500">
            <span className="font-medium">Full path:</span>
            <div className="mt-1 text-gray-700 break-all">
              {breadcrumbs.map((item, index) => (
                <span key={item.id}>
                  {index > 0 && ' / '}
                  {item.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}