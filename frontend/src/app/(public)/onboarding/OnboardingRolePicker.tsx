'use client';

import { colors } from '@/lib/design-tokens';
import { Bot, CreditCard, Package, ShoppingBag, Users } from 'lucide-react';

const ROLES = [
  {
    id: 'subscriber',
    title: 'Quero acessar minha assinatura',
    description: 'Já sou cliente e quero acompanhar meus pedidos e assinaturas.',
    icon: CreditCard,
  },
  {
    id: 'producer',
    title: 'Sou produtor',
    description: 'Quero vender meus produtos com a inteligência artificial do Kloel.',
    icon: ShoppingBag,
  },
  {
    id: 'affiliate',
    title: 'Sou Afiliado',
    description: 'Quero promover produtos e ganhar comissões com vendas automatizadas.',
    icon: Users,
  },
  {
    id: 'coproducer',
    title: 'Sou coprodutor',
    description: 'Quero acompanhar produtos, operação e divisão de receita.',
    icon: Package,
  },
  {
    id: 'agency',
    title: 'Sou agência',
    description: 'Quero operar canais e vendas de clientes em um só lugar.',
    icon: Bot,
  },
] as const;

interface OnboardingRolePickerProps {
  selected: string | null;
  onSelect: (id: string) => void;
}

export function OnboardingRolePicker({ selected, onSelect }: OnboardingRolePickerProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {ROLES.map((role) => {
        const Icon = role.icon;
        const isSelected = selected === role.id;
        return (
          <button
            type="button"
            key={role.id}
            onClick={() => onSelect(role.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              width: '100%',
              padding: '16px 20px',
              borderRadius: 6,
              border: `1px solid ${isSelected ? colors.ember.primary : colors.background.border}`,
              background: isSelected ? 'rgba(232, 93, 48, 0.06)' : colors.background.surface,
              boxShadow: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                background: isSelected ? 'rgba(232, 93, 48, 0.12)' : colors.background.elevated,
                border: `1px solid ${isSelected ? 'rgba(232, 93, 48, 0.3)' : colors.background.border}`,
              }}
            >
              <Icon size={24} style={{ color: isSelected ? colors.ember.primary : colors.text.muted }} />
            </div>
            <div>
              <p
                style={{
                  fontFamily: "'Sora', sans-serif",
                  fontSize: 15,
                  fontWeight: 600,
                  color: colors.text.silver,
                  margin: 0,
                }}
              >
                {role.title}
              </p>
              <p
                style={{
                  fontFamily: "'Sora', sans-serif",
                  fontSize: 13,
                  color: colors.text.muted,
                  margin: '2px 0 0',
                }}
              >
                {role.description}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
