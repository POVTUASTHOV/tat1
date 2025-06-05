'use client';

import { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import Button from './Button';

interface FileActionsProps {
  fileId: string;
  fileName: string;
  contentType: string;
  onDelete?: () => void;
  onDownload?: () => void;
  onPreviewComplete?: () => void;
}

export default function FileActions({
  fileId,
  fileName,
  contentType,
  onDelete,
  onDownload,
  onPreviewComplete
}: FileActionsProps) {
  const handleDownload = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (onDownload) {
      onDownload();
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (onDelete) {
      onDelete();
    }
  };

  return (
    <div className="flex items-center space-x-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDownload}
        title="Download file"
      >
        <Download className="w-4 h-4" />
      </Button>
      
      {onDelete && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          title="Delete file"
          className="text-red-600 hover:text-red-800"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}