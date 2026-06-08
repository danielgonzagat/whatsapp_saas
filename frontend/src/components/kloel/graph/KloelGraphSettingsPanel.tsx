'use client';

import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { useState } from 'react';

import type { KloelGraphGroupSettings, KloelGraphSettings } from './KloelGraphLiteralCanvas';
import { createDefaultKloelGraphSettings } from './KloelGraphLiteralCanvas';
import { GRAPH_FONT, GRAPH_MONO, useGraphTheme } from './KloelGraphTheme';

function XIcon({ size = 14 }: { readonly size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function PlusIcon({ size = 14 }: { readonly size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ChevronIcon({ size = 14 }: { readonly size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function Tag({ children, color, weight }: { readonly children: ReactNode; readonly color?: string; readonly weight?: number }) {
  const { C } = useGraphTheme();
  return (
    <span
      style={{
        fontFamily: GRAPH_MONO,
        fontSize: 10,
        color: color || C.muted,
        fontWeight: weight || 500,
        letterSpacing: 2,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </span>
  );
}

function Section({ title, defaultOpen = true, children }: { readonly title: string; readonly defaultOpen?: boolean; readonly children: ReactNode }) {
  const { C } = useGraphTheme();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: `1px solid ${C.divider}` }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{
          width: '100%',
          padding: '14px 20px',
          background: 'transparent',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          color: C.silver,
        }}
      >
        <Tag color={C.silver} weight={600}>{title}</Tag>
        <span style={{ color: C.dim, display: 'flex', transition: 'transform .15s ease', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
          <ChevronIcon size={12} />
        </span>
      </button>
      {open && <div style={{ padding: '0 20px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>}
    </div>
  );
}

function Toggle({ label, value, onChange, desc }: { readonly label: string; readonly value: boolean; readonly onChange: (value: boolean) => void; readonly desc?: string }) {
  const { C } = useGraphTheme();
  return (
    <div style={{ display: 'flex', alignItems: desc ? 'flex-start' : 'center', justifyContent: 'space-between', padding: '4px 0', gap: 12 }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontFamily: GRAPH_FONT, fontSize: 12.5, color: C.text }}>{label}</span>
        {desc && <span style={{ fontFamily: GRAPH_FONT, fontSize: 10.5, color: C.dim, lineHeight: 1.4 }}>{desc}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        style={{
          width: 32,
          height: 18,
          borderRadius: 6,
          position: 'relative',
          background: value ? C.ember : C.faint,
          transition: 'background .15s ease',
          cursor: 'pointer',
          flexShrink: 0,
          marginTop: desc ? 2 : 0,
          border: 'none',
          padding: 0,
        }}
      >
        <span style={{ position: 'absolute', top: 2, left: value ? 16 : 2, width: 14, height: 14, borderRadius: 6, background: C.paper, transition: 'left .15s ease', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }} />
      </button>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, format }: { readonly label: string; readonly value: number; readonly min: number; readonly max: number; readonly step: number; readonly onChange: (value: number) => void; readonly format?: (value: number) => string }) {
  const { C } = useGraphTheme();
  const pct = ((value - min) / (max - min)) * 100;
  const fmt = format || ((next: number) => next.toFixed(step < 1 ? 2 : 0));
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontFamily: GRAPH_FONT, fontSize: 12.5, color: C.text }}>{label}</span>
        <span style={{ fontFamily: GRAPH_MONO, fontSize: 10.5, color: C.muted, letterSpacing: 0.5 }}>{fmt(value)}</span>
      </div>
      <div style={{ position: 'relative', height: 18, display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: C.faint, borderRadius: 6 }} />
        <div style={{ position: 'absolute', left: 0, height: 2, background: C.ember, borderRadius: 6, width: `${pct}%` }} />
        <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(parseFloat(event.target.value))} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: '100%', margin: 0, opacity: 0, cursor: 'pointer' }} />
        <div style={{ position: 'absolute', left: `calc(${pct}% - 6px)`, width: 12, height: 12, borderRadius: 6, background: C.ember, border: `2px solid ${C.paper}`, boxShadow: `0 0 0 1px ${C.border}`, pointerEvents: 'none' }} />
      </div>
    </div>
  );
}

function SearchInput({ value, onChange, placeholder }: { readonly value: string; readonly onChange: (value: string) => void; readonly placeholder: string }) {
  const { C } = useGraphTheme();
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: C.paper, border: `1px solid ${focus ? C.silver : C.border}`, borderRadius: 6, transition: 'border-color .15s ease' }}>
      <input value={value} onChange={(event) => onChange(event.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} placeholder={placeholder} style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: GRAPH_FONT, fontSize: 12, color: C.text, padding: 0 }} />
      {value && <button type="button" onClick={() => onChange('')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, color: C.dim, display: 'flex' }}><XIcon size={11} /></button>}
    </div>
  );
}

function GroupRow({ group, onChange, onDelete }: { readonly group: KloelGraphGroupSettings; readonly onChange: (group: KloelGraphGroupSettings) => void; readonly onDelete: () => void }) {
  const { C } = useGraphTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const colors = [C.ember, C.amber, C.green, C.blue, C.purple, C.rose, C.silver, C.muted];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
      <button type="button" onClick={() => onChange({ ...group, enabled: !group.enabled })} aria-label={group.enabled ? 'Desativar grupo' : 'Ativar grupo'} style={{ width: 18, height: 18, borderRadius: 6, background: group.enabled ? C.ember : 'transparent', border: `1px solid ${group.enabled ? C.ember : C.border}`, color: group.enabled ? C.void : C.dim, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{group.enabled ? '✓' : ''}</button>
      <div style={{ position: 'relative' }}>
        <button type="button" onClick={() => setPickerOpen((value) => !value)} style={{ width: 18, height: 18, borderRadius: 6, background: group.color, border: `2px solid ${C.paper}`, boxShadow: `0 0 0 1px ${C.border}`, cursor: 'pointer', padding: 0 }} aria-label="Escolher cor" />
        {pickerOpen && (
          <div style={{ position: 'absolute', top: 24, left: 0, zIndex: 100, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
            {colors.map((color) => (
              <button key={color} type="button" onClick={() => { onChange({ ...group, color }); setPickerOpen(false); }} style={{ width: 18, height: 18, borderRadius: 6, background: color, border: color === group.color ? `2px solid ${C.silver}` : `2px solid ${C.paper}`, boxShadow: `0 0 0 1px ${C.border}`, cursor: 'pointer', padding: 0 }} aria-label={`Cor ${color}`} />
            ))}
          </div>
        )}
      </div>
      <input value={group.query} onChange={(event) => onChange({ ...group, query: event.target.value })} placeholder="type:product" style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 4, outline: 'none', padding: '5px 8px', fontFamily: GRAPH_MONO, fontSize: 10.5, color: C.text, background: C.paper, letterSpacing: 0.3, minWidth: 0 }} />
      <button type="button" onClick={onDelete} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: C.dim, display: 'flex' }} aria-label="Remover grupo"><XIcon size={13} /></button>
    </div>
  );
}

export function KloelGraphSettingsPanel({ settings, setSettings, onClose }: { readonly settings: KloelGraphSettings; readonly setSettings: Dispatch<SetStateAction<KloelGraphSettings>>; readonly onClose: () => void }) {
  const { C } = useGraphTheme();
  const update = (fn: (current: KloelGraphSettings) => KloelGraphSettings) => setSettings((current) => fn(current));
  const updateFilter = <K extends keyof KloelGraphSettings['filters']>(key: K, value: KloelGraphSettings['filters'][K]) => update((current) => ({ ...current, filters: { ...current.filters, [key]: value } }));
  const updateDisplay = <K extends keyof KloelGraphSettings['display']>(key: K, value: KloelGraphSettings['display'][K]) => update((current) => ({ ...current, display: { ...current.display, [key]: value } }));
  const updateForces = <K extends keyof KloelGraphSettings['forces']>(key: K, value: KloelGraphSettings['forces'][K]) => update((current) => ({ ...current, forces: { ...current.forces, [key]: value } }));
  const updateGroup = (group: KloelGraphGroupSettings) => update((current) => ({ ...current, groups: current.groups.map((candidate) => (candidate.id === group.id ? group : candidate)) }));
  const deleteGroup = (groupId: string) => update((current) => ({ ...current, groups: current.groups.filter((group) => group.id !== groupId) }));
  const addGroup = () => update((current) => ({ ...current, groups: [...current.groups, { id: `grp-${Date.now()}`, query: 'type:product', color: C.ember, enabled: true }] }));

  return (
    <div style={{ position: 'fixed', top: 72, left: 20, bottom: 20, width: 320, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: '0 16px 50px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', zIndex: 40, animation: 'panelSlideLeft .3s cubic-bezier(.2,.7,.2,1) both', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Tag color={C.muted} weight={600}>configurações do graph</Tag>
        <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: C.muted, display: 'flex' }} aria-label="Fechar configurações"><XIcon size={16} /></button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Section title="filtros">
          <SearchInput value={settings.filters.search} onChange={(value) => updateFilter('search', value)} placeholder="type:product · area:criar" />
          <Toggle label="Mostrar anexos" value={settings.filters.showAttachments} onChange={(value) => updateFilter('showAttachments', value)} />
          <Toggle label="Existentes apenas" value={settings.filters.existingOnly} onChange={(value) => updateFilter('existingOnly', value)} />
          <Toggle label="Mostrar órfãos" value={settings.filters.showOrphans} onChange={(value) => updateFilter('showOrphans', value)} />
          <Toggle label="Links de entrada" value={settings.filters.incomingLinks} onChange={(value) => updateFilter('incomingLinks', value)} />
          <Toggle label="Links de saída" value={settings.filters.outgoingLinks} onChange={(value) => updateFilter('outgoingLinks', value)} />
        </Section>
        <Section title="grupos" defaultOpen={false}>
          {settings.groups.map((group) => <GroupRow key={group.id} group={group} onChange={updateGroup} onDelete={() => deleteGroup(group.id)} />)}
          <button type="button" onClick={addGroup} style={{ height: 32, border: `1px dashed ${C.border}`, borderRadius: 6, background: 'transparent', color: C.muted, fontFamily: GRAPH_MONO, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><PlusIcon size={12} /> novo grupo</button>
        </Section>
        <Section title="visual">
          <Toggle label="Setas nas ligações" value={settings.display.arrows} onChange={(value) => updateDisplay('arrows', value)} />
          <Slider label="Fade dos textos" value={settings.display.textFade} min={0} max={1} step={0.05} onChange={(value) => updateDisplay('textFade', value)} />
          <Slider label="Tamanho dos nós" value={settings.display.nodeSize} min={0.6} max={2} step={0.05} onChange={(value) => updateDisplay('nodeSize', value)} format={(value) => `${value.toFixed(2)}×`} />
          <Slider label="Espessura dos links" value={settings.display.linkThickness} min={0.3} max={3} step={0.05} onChange={(value) => updateDisplay('linkThickness', value)} format={(value) => `${value.toFixed(2)}×`} />
        </Section>
        <Section title="forças" defaultOpen={false}>
          <Slider label="Força central" value={settings.forces.centerForce} min={0} max={0.02} step={0.001} onChange={(value) => updateForces('centerForce', value)} format={(value) => value.toFixed(3)} />
          <Slider label="Repulsão" value={settings.forces.repelForce} min={80} max={1000} step={10} onChange={(value) => updateForces('repelForce', value)} />
          <Slider label="Força dos links" value={settings.forces.linkForce} min={0.2} max={3} step={0.05} onChange={(value) => updateForces('linkForce', value)} format={(value) => value.toFixed(2)} />
          <Slider label="Distância dos links" value={settings.forces.linkDistance} min={20} max={120} step={1} onChange={(value) => updateForces('linkDistance', value)} />
        </Section>
      </div>
      <div style={{ padding: 14, borderTop: `1px solid ${C.divider}`, background: C.raised }}>
        <button type="button" onClick={() => setSettings(createDefaultKloelGraphSettings())} style={{ width: '100%', height: 34, border: `1px solid ${C.border}`, borderRadius: 6, background: C.paper, color: C.muted, fontFamily: GRAPH_MONO, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer' }}>restaurar padrão</button>
      </div>
    </div>
  );
}
