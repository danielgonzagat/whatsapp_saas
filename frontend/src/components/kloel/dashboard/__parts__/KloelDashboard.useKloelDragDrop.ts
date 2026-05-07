'use client';

import { hasDraggedFiles } from '../KloelDashboard.helpers';
import {
  type Dispatch,
  type DragEvent as ReactDragEvent,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface UseKloelDragDropDeps {
  isReplyInFlight: boolean;
  queueFilesForUpload: (selectedFiles: FileList | File[] | null) => Promise<void>;
  setComposerNotice: Dispatch<SetStateAction<string | null>>;
  inputRef: MutableRefObject<HTMLTextAreaElement | null>;
}

export interface UseKloelDragDropReturn {
  isDragActive: boolean;
  handleDragEnter: (event: ReactDragEvent<HTMLElement>) => void;
  handleDragOver: (event: ReactDragEvent<HTMLElement>) => void;
  handleDragLeave: (event: ReactDragEvent<HTMLElement>) => void;
  handleDropFiles: (event: ReactDragEvent<HTMLElement>) => Promise<void>;
}

export function useKloelDragDrop(deps: UseKloelDragDropDeps): UseKloelDragDropReturn {
  const { isReplyInFlight, queueFilesForUpload, setComposerNotice, inputRef } = deps;
  const [isDragActive, setIsDragActive] = useState(false);
  const dragDepthRef = useRef(0);

  const clearDragState = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDragActive(false);
  }, []);

  const handleDragEnter = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  }, []);

  const handleDragOver = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      if (!hasDraggedFiles(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'copy';
      if (!isDragActive) {
        setIsDragActive(true);
      }
    },
    [isDragActive],
  );

  const handleDragLeave = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragActive(false);
    }
  }, []);

  const handleDropFiles = useCallback(
    async (event: ReactDragEvent<HTMLElement>) => {
      if (!hasDraggedFiles(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      clearDragState();

      if (isReplyInFlight) {
        setComposerNotice('Aguarde a resposta atual antes de anexar novos arquivos.');
        return;
      }

      await queueFilesForUpload(event.dataTransfer.files);
      inputRef.current?.focus();
    },
    [clearDragState, isReplyInFlight, queueFilesForUpload, inputRef, setComposerNotice],
  );

  useEffect(() => {
    const handleWindowDrop = (event: DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      clearDragState();
    };

    const handleWindowDragOver = (event: DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
    };

    const handleWindowDragEnd = () => {
      clearDragState();
    };

    window.addEventListener('drop', handleWindowDrop);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('dragend', handleWindowDragEnd);
    return () => {
      window.removeEventListener('drop', handleWindowDrop);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('dragend', handleWindowDragEnd);
    };
  }, [clearDragState]);

  return {
    isDragActive,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDropFiles,
  };
}
