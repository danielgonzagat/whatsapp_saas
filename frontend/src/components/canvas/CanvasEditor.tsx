'use client';

// MUST be imported before any Polotno import — shims React 19 internals for React 18 compat
import '@/lib/react-polotno-shim';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PolotnoContainer, SidePanelWrap, WorkspaceWrap } from 'polotno';
import { Toolbar } from 'polotno/toolbar/toolbar';
import { ZoomButtons } from 'polotno/toolbar/zoom-buttons';
import { SidePanel, DEFAULT_SECTIONS } from 'polotno/side-panel';
import { Workspace } from 'polotno/canvas/workspace';
import { PagesTimeline } from 'polotno/pages-timeline';
import { createStore } from 'polotno/model/store';
import { apiFetch } from '@/lib/api';
import { PRODUCT_TEMPLATES } from '@/lib/canvas-formats';
import { EditorTopBar } from './EditorTopBar';
import '@/styles/polotno-terminator.css';

const S = "var(--font-sora), 'Sora', sans-serif";

/* Polotno store — singleton */
let _store: ReturnType<typeof createStore> | null = null;
function getStore() {
  if (!_store) {
    _store = createStore({
      key: 'nFA5H9elEytDyPyvKL7T',
      showCredit: true,
    });
  }
  return _store;
}

export default function CanvasEditor() {
  const params = useSearchParams();
  const router = useRouter();
  const w = parseInt(params.get('w') || '1080');
  const h = parseInt(params.get('h') || '1080');
  const name = params.get('name') || 'Design sem nome';
  const designId = params.get('id');
  const tplId = params.get('tpl');
  const [saving, setSaving] = useState(false);
  const [designName, setDesignName] = useState(name);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentId = useRef<string | null>(designId || null);
  const store = getStore();

  /* Initialize canvas */
  useEffect(() => {
    if (designId) {
      apiFetch(`/canvas/designs/${designId}`).then((res: any) => {
        const design = res?.design;
        if (design?.elements) {
          try {
            const json = typeof design.elements === 'string'
              ? JSON.parse(design.elements)
              : design.elements;
            if (json && typeof json === 'object' && (json.pages || Array.isArray(json))) {
              store.loadJSON(json);
            } else {
              store.clear();
              store.setSize(design.width || w, design.height || h);
              store.addPage();
            }
          } catch {
            store.clear();
            store.setSize(w, h);
            store.addPage();
          }
        } else {
          store.clear();
          store.setSize(design?.width || w, design?.height || h);
          store.addPage();
        }
        if (design?.name) setDesignName(design.name);
      });
    } else if (tplId) {
      /* Load a product template by id */
      const tpl = PRODUCT_TEMPLATES.find(t => t.id === tplId);
      if (tpl) {
        try {
          store.loadJSON(tpl.json);
        } catch {
          store.clear();
          store.setSize(tpl.w, tpl.h);
          store.addPage();
        }
        setDesignName(tpl.name);
      } else {
        store.clear();
        store.setSize(w, h);
        store.addPage();
      }
    } else {
      store.clear();
      store.setSize(w, h);
      store.addPage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Auto-save with 3s debounce */
  useEffect(() => {
    const unsub = store.on('change', () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setSaving(true);
        const json = store.toJSON();
        try {
          if (!currentId.current) {
            const res: any = await apiFetch('/canvas/designs', {
              method: 'POST',
              body: {
                name: designName,
                format: `${w}x${h}`,
                width: w,
                height: h,
                elements: json,
              },
            });
            currentId.current = res?.design?.id || null;
          } else {
            await apiFetch(`/canvas/designs/${currentId.current}`, {
              method: 'PUT',
              body: { elements: json, name: designName },
            });
          }
        } catch (e) {
          console.error('Auto-save failed:', e);
        }
        setSaving(false);
      }, 3000);
    });
    return () => { unsub?.(); if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designName]);

  const handleExport = async () => {
    try {
      const url = await store.toDataURL({ pixelRatio: 2 });
      const a = document.createElement('a');
      a.download = `${designName}.png`;
      a.href = url;
      a.click();
    } catch (e) {
      console.error('Export failed:', e);
    }
  };

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      background: '#0A0A0C', fontFamily: S, color: '#E0DDD8',
      overflow: 'hidden', userSelect: 'none',
    }}>
      <EditorTopBar
        designName={designName}
        onNameChange={setDesignName}
        saving={saving}
        onBack={() => router.push('/canvas/inicio')}
        onUndo={() => store.history.undo()}
        onRedo={() => store.history.redo()}
        onExport={handleExport}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <PolotnoContainer style={{ width: '100%', height: '100%' }}>
          <SidePanelWrap>
            <SidePanel store={store} sections={DEFAULT_SECTIONS} />
          </SidePanelWrap>
          <WorkspaceWrap>
            <Toolbar store={store} />
            <Workspace store={store} />
            <ZoomButtons store={store} />
            <PagesTimeline store={store} />
          </WorkspaceWrap>
        </PolotnoContainer>
      </div>
    </div>
  );
}
