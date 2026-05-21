'use client';

import type React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface AccordionSectionProps {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function AccordionSection({
  icon: Icon,
  title,
  children,
  defaultOpen = false,
}: AccordionSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-md border border-[colors.border.space] bg-[colors.background.surface] shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`${isOpen ? 'Fechar' : 'Abrir'} ${title}`}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between p-5"
      >
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-[colors.text.muted]" />
          <span className="font-semibold text-[colors.text.silver]">{title}</span>
        </div>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-[colors.text.muted]" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-5 w-5 text-[colors.text.muted]" aria-hidden="true" />
        )}
      </button>
      {isOpen && <div className="border-t border-[colors.border.space] p-5">{children}</div>}
    </div>
  );
}
