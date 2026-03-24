'use client';

import { useState } from 'react';
import {
  Bot, Smartphone, Download, RefreshCw, Music, GraduationCap, Users,
  Code, Video, Film, Image, Ticket, Headphones, Package, Monitor,
  MessageSquare, BookOpen, Briefcase, Globe, Zap, ShoppingCart, FileText,
} from 'lucide-react';

const PRODUCT_TYPES = [
  { id: 'ai-agent', label: 'Agentes de IA', icon: Bot },
  { id: 'mobile-app', label: 'Aplicativo para celular', icon: Smartphone },
  { id: 'download', label: 'Arquivos para baixar', icon: Download },
  { id: 'subscription', label: 'Assinatura', icon: RefreshCw },
  { id: 'audio', label: 'Audio / Musica', icon: Music },
  { id: 'online-course', label: 'Curso Online', icon: GraduationCap },
  { id: 'community', label: 'Comunidade', icon: Users },
  { id: 'source-code', label: 'Codigo Fonte', icon: Code },
  { id: 'online-event', label: 'Evento Online', icon: Video },
  { id: 'film', label: 'Filme / Screencast', icon: Film },
  { id: 'image', label: 'Imagem / Foto', icon: Image },
  { id: 'ticket', label: 'Ingressos para eventos', icon: Ticket },
  { id: 'podcast', label: 'Podcast / Audiobook', icon: Headphones },
  { id: 'physical', label: 'Produto Fisico', icon: Package },
  { id: 'software', label: 'Programa para baixar', icon: Monitor },
  { id: 'consulting', label: 'Consultoria Online', icon: MessageSquare },
  { id: 'ebook', label: 'eBook', icon: BookOpen },
  { id: 'mentoring', label: 'Mentoria', icon: Briefcase },
  { id: 'saas', label: 'SaaS / Plataforma', icon: Globe },
  { id: 'template', label: 'Templates / Planilhas', icon: FileText },
  { id: 'automation', label: 'Automacao', icon: Zap },
  { id: 'marketplace', label: 'Marketplace', icon: ShoppingCart },
] as const;

interface ProductTypeSelectorProps {
  value: string | null;
  onChange: (typeId: string) => void;
}

export function ProductTypeSelector({ value, onChange }: ProductTypeSelectorProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 12,
      }}
    >
      {PRODUCT_TYPES.map((type) => {
        const Icon = type.icon;
        const isSelected = value === type.id;
        const isHovered = hovered === type.id;

        return (
          <button
            key={type.id}
            onClick={() => onChange(type.id)}
            onMouseEnter={() => setHovered(type.id)}
            onMouseLeave={() => setHovered(null)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              padding: '20px 12px',
              borderRadius: 6,
              border: `1px solid ${isSelected ? '#E85D30' : isHovered ? '#333338' : '#222226'}`,
              background: isSelected ? 'rgba(232, 93, 48, 0.06)' : '#111113',
              cursor: 'pointer',
              transition: 'all 150ms ease',
              boxShadow: 'none',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isSelected ? 'rgba(232, 93, 48, 0.1)' : '#19191C',
                border: `1px solid ${isSelected ? 'rgba(232, 93, 48, 0.3)' : '#19191C'}`,
                transition: 'all 150ms ease',
              }}
            >
              <Icon
                size={22}
                style={{
                  color: isSelected ? '#E85D30' : '#3A3A3F',
                  transition: 'color 150ms ease',
                }}
              />
            </div>
            <span
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: 12,
                fontWeight: 500,
                color: isSelected ? '#E0DDD8' : '#6E6E73',
                textAlign: 'center',
                lineHeight: 1.3,
              }}
            >
              {type.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
