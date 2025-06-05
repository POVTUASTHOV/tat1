'use client';

import { useState } from 'react';
import { Eye, Download, Trash2, Archive } from 'lucide-react';
import Button from './Button';
import FilePreviewModal from './FilePreviewModal';
import ArchivePreviewModal from './ArchivePreviewModal';

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
  const [showPreview, setShowPreview] = useState(false);
  const [showArchivePreview, setShowArchivePreview] = useState(false);

  const isPreviewable = () => {
    return contentType.startsWith('image/') ||
           contentType.startsWith('video/') ||
           contentType.startsWith('audio/') ||
           contentType.startsWith('text/') ||
           contentType === 'application/json' ||
           contentType === 'text/csv' ||
           contentType === 'application/pdf';
  };

  const isArchive = () => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    return ['zip', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz'].includes(extension || '');
  };

  const handlePreview = () => {
    if (isArchive()) {
      setShowArchivePreview(true);
    } else {
      setShowPreview(true);
    }
  };

  return (
    <>
      <div className="flex items-center space-x-1">
        {(isPreviewable() || isArchive()) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePreview}
            title={isArchive() ? "View archive contents" : "Preview file"}
          >
            {isArchive() ? <Archive className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
        )}
        
        {onDownload && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDownload}
            title="Download file"
          >
            <Download className="w-4 h-4" />
          </Button>
        )}
        
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            title="Delete file"
            className="text-red-600 hover:text-red-800"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      {showPreview && !isArchive() && (
        <FilePreviewModal
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
          fileId={fileId}
          fileName={fileName}
          contentType={contentType}
        />
      )}

      {showArchivePreview && isArchive() && (
        <ArchivePreviewModal
          isOpen={showArchivePreview}
          onClose={() => setShowArchivePreview(false)}
          fileId={fileId}
          fileName={fileName}
          onExtractComplete={() => {
            setShowArchivePreview(false);
            onPreviewComplete?.();
          }}
        />
      )}
    </>
  );
}