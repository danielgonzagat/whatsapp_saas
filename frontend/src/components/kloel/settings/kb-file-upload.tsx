'use client';

import { kloelT } from '@/lib/i18n/t';
import { PulseLoader } from '@/components/kloel/PulseLoader';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { tokenStorage } from '@/lib/api';
import { uploadKnowledgeBase } from '@/lib/api/ai-assistant';

interface KbFileUploadProps {
  selectedKbId: string;
  onUploaded: () => void;
}

export function KbFileUpload({ selectedKbId, onUploaded }: KbFileUploadProps) {
  const fid = React.useId();
  const kbFileRef = useRef<HTMLInputElement>(null);
  const [kbUploadFile, setKbUploadFile] = useState<File | null>(null);
  const [kbUploading, setKbUploading] = useState(false);
  const [kbUploadError, setKbUploadError] = useState('');
  const [kbUploadSuccess, setKbUploadSuccess] = useState('');
  const [kbDragOver, setKbDragOver] = useState(false);

  const handleKbFileUpload = async (file: File) => {
    if (!selectedKbId) {
      setKbUploadError('Selecione uma base de conhecimento primeiro.');
      return;
    }
    setKbUploading(true);
    setKbUploadError('');
    setKbUploadSuccess('');
    try {
      await uploadKnowledgeBase(file, selectedKbId);
      setKbUploadSuccess(`Arquivo ${file.name} enviado com sucesso.`);
      setKbUploadFile(null);
      onUploaded();
    } catch (e: unknown) {
      setKbUploadError(e instanceof Error ? e.message : 'Erro ao fazer upload do arquivo.');
    } finally {
      setKbUploading(false);
    }
  };

  const handleKbDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setKbDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setKbUploadFile(file);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {kloelT(`Upload de arquivo (PDF, TXT)`)}
      </p>
      {(kbUploadError || kbUploadSuccess) && (
        <div
          className={`rounded-xl border px-3 py-2 text-xs ${kbUploadError ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
        >
          {kbUploadError || kbUploadSuccess}
        </div>
      )}
      <label
        htmlFor={`${fid}-kb-file-input`}
        onDragOver={(e) => {
          e.preventDefault();
          setKbDragOver(true);
        }}
        onDragLeave={() => setKbDragOver(false)}
        onDrop={handleKbDrop}
        aria-label="Selecionar arquivo para base de conhecimento"
        className={`rounded-xl border-2 border-dashed cursor-pointer transition-colors p-6 text-center ${kbDragOver ? 'border-[colors.ember.primary] bg-[colors.ember.primary]/5' : 'border-gray-200 hover:border-gray-300'}`}
      >
        <Upload className="mx-auto mb-2 h-6 w-6 text-gray-400" aria-hidden="true" />
        <p className="text-sm text-gray-600">
          {kbUploadFile ? kbUploadFile.name : 'Arraste um arquivo ou clique para selecionar'}
        </p>
        <p className="mt-1 text-xs text-gray-400">{kloelT(`PDF, TXT, DOCX — max 10MB`)}</p>
        <input
          ref={kbFileRef}
          id={`${fid}-kb-file-input`}
          type="file"
          aria-label="Selecionar arquivo para base de conhecimento (PDF, TXT, DOCX)"
          className="hidden"
          accept={kloelT(`.pdf,.txt,.docx`)}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setKbUploadFile(f);
            }
          }}
        />
      </label>
      {kbUploadFile && (
        <Button
          onClick={() => void handleKbFileUpload(kbUploadFile)}
          disabled={kbUploading || !selectedKbId}
          className="w-full rounded-xl bg-[colors.ember.primary] text-white hover:bg-[colors.ember.primary]/90"
        >
          {kbUploading ? <PulseLoader width={88} height={18} /> : `Enviar ${kbUploadFile.name}`}
        </Button>
      )}
    </div>
  );
}
