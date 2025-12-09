"use client";

import { useState, useRef, useCallback, ChangeEvent, DragEvent } from 'react';
import { Upload, X, FileText, Image, Film, Music, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiUrl } from '@/lib/http';

interface FileUploadProps {
  workspaceId: string;
  accept?: string;
  maxSize?: number; // in MB
  onUpload?: (file: File, url: string) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  className?: string;
}

interface UploadedFile {
  file: File;
  preview?: string;
  url?: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
}

const fileIcons: Record<string, React.ReactNode> = {
  image: <Image className="w-5 h-5" />,
  video: <Film className="w-5 h-5" />,
  audio: <Music className="w-5 h-5" />,
  default: <FileText className="w-5 h-5" />,
};

const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return fileIcons.image;
  if (type.startsWith('video/')) return fileIcons.video;
  if (type.startsWith('audio/')) return fileIcons.audio;
  return fileIcons.default;
};

export function FileUpload({
  workspaceId,
  accept = '*/*',
  maxSize = 10,
  onUpload,
  onError,
  disabled = false,
  className = '',
}: FileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    const newFiles: UploadedFile[] = [];

    Array.from(selectedFiles).forEach((file) => {
      // Check file size
      if (file.size > maxSize * 1024 * 1024) {
        onError?.(`Arquivo ${file.name} excede o tamanho máximo de ${maxSize}MB`);
        return;
      }

      const uploadedFile: UploadedFile = {
        file,
        status: 'pending',
        progress: 0,
      };

      // Create preview for images
      if (file.type.startsWith('image/')) {
        uploadedFile.preview = URL.createObjectURL(file);
      }

      newFiles.push(uploadedFile);
    });

    setFiles((prev) => [...prev, ...newFiles]);

    // Auto-upload files
    newFiles.forEach((uploadedFile) => {
      uploadFile(uploadedFile);
    });
  }, [maxSize, onError]);

  const uploadFile = useCallback(async (uploadedFile: UploadedFile) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.file === uploadedFile.file ? { ...f, status: 'uploading' } : f
      )
    );

    try {
      const formData = new FormData();
      formData.append('file', uploadedFile.file);

      // Simulated upload endpoint - replace with actual endpoint
      const response = await fetch(apiUrl(`/kloel/media/${workspaceId}/upload`), {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Falha no upload');
      }

      const data = await response.json();
      const fileUrl = data.url;

      setFiles((prev) =>
        prev.map((f) =>
          f.file === uploadedFile.file
            ? { ...f, status: 'done', progress: 100, url: fileUrl }
            : f
        )
      );

      onUpload?.(uploadedFile.file, fileUrl);
    } catch (error: any) {
      setFiles((prev) =>
        prev.map((f) =>
          f.file === uploadedFile.file
            ? { ...f, status: 'error', error: error.message }
            : f
        )
      );
      onError?.(error.message);
    }
  }, [workspaceId, onUpload, onError]);

  const removeFile = useCallback((file: File) => {
    setFiles((prev) => {
      const uploadedFile = prev.find((f) => f.file === file);
      if (uploadedFile?.preview) {
        URL.revokeObjectURL(uploadedFile.preview);
      }
      return prev.filter((f) => f.file !== file);
    });
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleFileSelect]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={className}>
      {/* Drop zone */}
      <div
        className={`
          relative border-2 border-dashed rounded-xl p-6 transition-colors
          ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />

        <div className="flex flex-col items-center gap-2 text-gray-500">
          <Upload className="w-8 h-8" />
          <p className="text-sm font-medium">
            Arraste arquivos aqui ou clique para selecionar
          </p>
          <p className="text-xs text-gray-400">
            Máximo {maxSize}MB por arquivo
          </p>
        </div>
      </div>

      {/* File list */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 space-y-2"
          >
            {files.map((uploadedFile, index) => (
              <motion.div
                key={`${uploadedFile.file.name}-${index}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
              >
                {/* Preview or icon */}
                {uploadedFile.preview ? (
                  <img
                    src={uploadedFile.preview}
                    alt=""
                    className="w-10 h-10 object-cover rounded"
                  />
                ) : (
                  <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center text-gray-500">
                    {getFileIcon(uploadedFile.file.type)}
                  </div>
                )}

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {uploadedFile.file.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(uploadedFile.file.size)}
                  </p>

                  {/* Progress bar */}
                  {uploadedFile.status === 'uploading' && (
                    <div className="mt-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-blue-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadedFile.progress}%` }}
                      />
                    </div>
                  )}

                  {/* Error message */}
                  {uploadedFile.status === 'error' && (
                    <p className="text-xs text-red-500 mt-1">
                      {uploadedFile.error}
                    </p>
                  )}
                </div>

                {/* Status */}
                <div className="shrink-0">
                  {uploadedFile.status === 'uploading' && (
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                  )}
                  {uploadedFile.status === 'done' && (
                    <span className="text-green-500 text-lg">✓</span>
                  )}
                  {uploadedFile.status === 'error' && (
                    <span className="text-red-500 text-lg">✗</span>
                  )}
                </div>

                {/* Remove button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(uploadedFile.file);
                  }}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
