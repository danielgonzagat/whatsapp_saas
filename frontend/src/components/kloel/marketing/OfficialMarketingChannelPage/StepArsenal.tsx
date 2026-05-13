import { sectionTitleStyle, secondaryButtonStyle, textAreaStyle } from './shared-styles';

interface Props {
  arsenal: string[];
  onArsenalChange: (value: string) => void;
  busy: string | null;
  onSave: () => void;
}

export function StepArsenal({ arsenal, onArsenalChange, busy, onSave }: Props) {
  return (
    <div>
      <h2 style={sectionTitleStyle}>Arsenal do canal</h2>
      <textarea
        value={arsenal.join('\n')}
        onChange={(event) => onArsenalChange(event.target.value)}
        placeholder="Um material por linha: script de objeção, depoimento, oferta, FAQ, garantia..."
        rows={7}
        style={textAreaStyle}
      />
      <button
        type="button"
        onClick={onSave}
        style={{ ...secondaryButtonStyle, marginTop: 14 }}
      >
        {busy === 'setup' ? 'Salvando...' : 'Salvar arsenal'}
      </button>
    </div>
  );
}
