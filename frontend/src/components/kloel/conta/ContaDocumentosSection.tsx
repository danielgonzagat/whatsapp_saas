'use client';

import { kloelT } from '@/lib/i18n/t';
import { useRef, useState } from 'react';
import { useDocumentMutations, type KycDocument } from '@/hooks/useKyc';
import { PulseLoader } from '@/components/kloel/PulseLoader';
import Icons from './ContaIcons';
import { SORA, EMBER } from './ContaConstants';
import { getErrorMessage } from './ContaHelpers';
import { SectionCard, StatusBadge } from './ContaShared';
import type { KycFiscal } from './ContaTypes';

function UploadZone({
  label,
  sublabel,
  type,
  doc,
  inputRef,
  uploading,
  onUpload,
  onDelete,
}: {
  label: string;
  sublabel: string;
  type: string;
  doc: KycDocument | undefined;
  inputRef: React.RefObject<HTMLInputElement | null>;
  uploading: string | null;
  onUpload: (type: string, file: File) => void;
  onDelete: (docId: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const isUploading = uploading === type;

  if (doc) {
    return (
      <div
        style={{
          background: 'var(--app-bg-secondary)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          padding: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ color: 'var(--app-text-secondary)' }}>{Icons.doc(20)}</span>
        <div style={{ flex: 1 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
              display: 'block',
              fontFamily: SORA,
            }}
          >
            {doc.fileName || doc.originalName || label}
          </span>
          <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)', fontFamily: SORA }}>
            {kloelT(`Enviado em`)}{' '}
            {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('pt-BR') : '--'}
          </span>
        </div>
        <StatusBadge status={doc.status || 'pending'} />
        {(doc.status === 'pending' || !doc.status) && (
          <button
            type="button"
            onClick={() => onDelete(doc.id)}
            style={{
              background: 'none',
              border: 'none',
              color: '#EF4444',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            {Icons.trash(14)}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        const file = e.dataTransfer.files[0];
        if (file) {
          onUpload(type, file);
        }
      }}
      style={{
        border: `1px dashed ${hover ? EMBER : 'var(--app-border-primary)'}`,
        borderRadius: 6,
        padding: '28px 20px',
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer',
        transition: 'all 150ms ease',
        background: hover ? 'rgba(232,93,48,.02)' : 'transparent',
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
        }
      }}
    >
      <span
        style={{ color: hover ? EMBER : 'var(--app-text-placeholder)', transition: 'color .15s' }}
      >
        {Icons.upload(24)}
      </span>
      <div style={{ textAlign: 'center' as const }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            display: 'block',
            fontFamily: SORA,
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
          {sublabel}
        </span>
      </div>
      {isUploading && (
        <div style={{ marginTop: 2 }}>
          <PulseLoader width={84} height={18} />
        </div>
      )}
      <input
        aria-label={label}
        ref={inputRef}
        type="file"
        accept={kloelT(`image/*,.pdf`)}
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onUpload(type, file);
          }
        }}
      />
    </div>
  );
}

export default function DocumentosSection({
  documents,
  fiscal,
  mutate,
}: {
  documents: KycDocument[];
  fiscal: KycFiscal | null;
  mutate: () => void;
}) {
  const { uploadDocument, deleteDocument } = useDocumentMutations();
  const idRef = useRef<HTMLInputElement>(null);
  const secondRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const isPJ = fiscal?.type === 'PJ' || !!fiscal?.cnpj;
  const docs: KycDocument[] = Array.isArray(documents) ? documents : [];

  const idDoc = docs.find((d) => d.type === 'DOCUMENT_FRONT');
  const secondDoc = isPJ
    ? docs.find((d) => d.type === 'COMPANY_DOCUMENT')
    : docs.find((d) => d.type === 'PROOF_OF_ADDRESS');

  const handleUpload = async (type: string, file: File) => {
    setError('');
    setUploading(type);
    try {
      await uploadDocument(type, file);
      mutate();
    } catch (e) {
      setError(getErrorMessage(e) || 'Erro ao salvar. Tente novamente.');
    }
    setUploading(null);
  };

  const handleDelete = async (docId: string) => {
    setError('');
    try {
      await deleteDocument(docId);
      mutate();
    } catch (e) {
      setError(getErrorMessage(e) || 'Erro ao salvar. Tente novamente.');
    }
  };

  return (
    <SectionCard
      title={kloelT(`Documentos`)}
      subtitle={kloelT(`Envie os documentos necessarios para verificacao`)}
    >
      <div
        style={{
          background: 'rgba(59,130,246,.04)',
          border: '1px solid rgba(59,130,246,.15)',
          borderRadius: 6,
          padding: '12px 16px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <span style={{ color: '#3B82F6', marginTop: 2, flexShrink: 0 }}>{Icons.clock(16)}</span>
        <span style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
          {kloelT(`A analise dos documentos pode levar ate 48 horas uteis. Voce sera notificado por e-mail
          quando o resultado estiver disponivel.`)}
        </span>
      </div>

      {error && (
        <span
          style={{
            fontSize: 11,
            color: '#EF4444',
            marginTop: 8,
            display: 'block',
            fontFamily: SORA,
          }}
        >
          {error}
        </span>
      )}
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
        <UploadZone
          label={kloelT(`Documento de identidade`)}
          sublabel={kloelT(`RG, CNH ou Passaporte`)}
          type="DOCUMENT_FRONT"
          doc={idDoc}
          inputRef={idRef}
          uploading={uploading}
          onUpload={handleUpload}
          onDelete={handleDelete}
        />
        <UploadZone
          label={isPJ ? 'Contrato social ou cartao CNPJ' : 'Comprovante de residencia'}
          sublabel={isPJ ? 'Documento da empresa' : 'Conta de luz, agua, internet (ate 90 dias)'}
          type={isPJ ? 'COMPANY_DOCUMENT' : 'PROOF_OF_ADDRESS'}
          doc={secondDoc}
          inputRef={secondRef}
          uploading={uploading}
          onUpload={handleUpload}
          onDelete={handleDelete}
        />
      </div>
    </SectionCard>
  );
}
