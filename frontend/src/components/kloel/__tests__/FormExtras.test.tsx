import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChipInput, CodeSnippet, CurrencyInput, DataTable, RadioGroup } from '../FormExtras';

vi.mock('@/lib/i18n/t', () => ({
  kloelT: (text: string) => text,
}));

vi.mock('@/hooks/usePersistentImagePreview', () => ({
  usePersistentImagePreview: () => ({
    previewUrl: null,
    clearPreview: vi.fn(),
    setPreviewUrl: vi.fn(),
  }),
}));

vi.mock('@/lib/media-upload', () => ({
  readFileAsDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,xxx'),
  uploadGenericMedia: vi.fn().mockResolvedValue('https://example.com/img.png'),
}));

describe('ChipInput', () => {
  it('renders with label', () => {
    render(<ChipInput value={[]} onChange={() => {}} label="Tags" />);
    expect(screen.getByText('Tags')).toBeInTheDocument();
  });

  it('adds a tag on Enter', () => {
    const onChange = vi.fn();
    render(<ChipInput value={[]} onChange={onChange} placeholder="Add tag" />);
    const input = screen.getByPlaceholderText('Add tag');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['hello']);
  });

  it('does not add blank or duplicate tags', () => {
    const onChange = vi.fn();
    render(<ChipInput value={['hello']} onChange={onChange} />);
    const input = screen.getByLabelText('Adicionar...');
    fireEvent.change(input, { target: { value: '  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('respects max limit', () => {
    render(<ChipInput value={['a', 'b', 'c', 'd', 'e']} onChange={() => {}} max={5} />);
    const input = screen.getByLabelText('Adicionar...');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('placeholder', 'Máximo 5');
  });

  it('removes a tag on click', () => {
    const onChange = vi.fn();
    render(<ChipInput value={['tag1', 'tag2']} onChange={onChange} />);
    const removeBtn = screen.getAllByRole('button')[0];
    fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith(['tag2']);
  });

  it('renders without label', () => {
    const { container } = render(<ChipInput value={[]} onChange={() => {}} />);
    expect(container.querySelector('label')).toBeNull();
  });
});

describe('CurrencyInput', () => {
  it('renders with label and placeholder', () => {
    const onChange = vi.fn();
    render(<CurrencyInput value="" onChange={onChange} label="Preço" />);
    expect(screen.getByText('Preço')).toBeInTheDocument();
    const input = screen.getByLabelText('Preço');
    expect(input).toHaveAttribute('placeholder', '0,00');
  });

  it('calls onChange on input', () => {
    const onChange = vi.fn();
    render(<CurrencyInput value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Valor em reais'), { target: { value: '10' } });
    expect(onChange).toHaveBeenCalledWith('10');
  });

  it('displays the R$ prefix', () => {
    const onChange = vi.fn();
    render(<CurrencyInput value="50" onChange={onChange} />);
    expect(screen.getByText('R$')).toBeInTheDocument();
  });

  it('uses type number input', () => {
    const onChange = vi.fn();
    render(<CurrencyInput value="0" onChange={onChange} />);
    expect(screen.getByLabelText('Valor em reais')).toHaveAttribute('type', 'number');
  });
});

describe('RadioGroup', () => {
  const options = [
    { value: 'a', label: 'Option A', description: 'First' },
    { value: 'b', label: 'Option B' },
  ];

  it('renders options and selects checked', () => {
    const onChange = vi.fn();
    render(<RadioGroup value="a" onChange={onChange} options={options} label="Choose" />);
    expect(screen.getByText('Choose')).toBeInTheDocument();
    expect(screen.getByLabelText('Option A')).toBeChecked();
    expect(screen.getByLabelText('Option B')).not.toBeChecked();
  });

  it('calls onChange on selection', () => {
    const onChange = vi.fn();
    render(<RadioGroup value="a" onChange={onChange} options={options} />);
    fireEvent.click(screen.getByLabelText('Option B'));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('renders descriptions', () => {
    const onChange = vi.fn();
    render(<RadioGroup value="a" onChange={onChange} options={options} />);
    expect(screen.getByText('First')).toBeInTheDocument();
  });

  it('renders horizontally', () => {
    const onChange = vi.fn();
    const { container } = render(
      <RadioGroup value="a" onChange={onChange} options={options} direction="horizontal" />,
    );
    const wrapper = container.querySelector('.flex.flex-wrap');
    expect(wrapper).toBeInTheDocument();
  });
});

describe('CodeSnippet', () => {
  it('renders code and label', () => {
    render(<CodeSnippet code="console.log(1)" label="Script" />);
    expect(screen.getByText('Script')).toBeInTheDocument();
    expect(screen.getByText('console.log(1)')).toBeInTheDocument();
  });

  it('renders without label', () => {
    render(<CodeSnippet code="const x = 1" />);
    expect(screen.getByText('const x = 1')).toBeInTheDocument();
  });

  it('copies to clipboard on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CodeSnippet code="test" />);
    fireEvent.click(screen.getByRole('button'));
    expect(writeText).toHaveBeenCalledWith('test');
  });
});

describe('DataTable', () => {
  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'age', label: 'Age', render: (val: unknown) => String(val) },
  ];

  it('renders empty state', () => {
    render(<DataTable columns={columns} rows={[]} emptyText="No data" />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('renders default empty text', () => {
    render(<DataTable columns={columns} rows={[]} />);
    expect(screen.getByText('Nenhum registro')).toBeInTheDocument();
  });

  it('renders table with rows', () => {
    render(
      <DataTable<
        Record<string, unknown>
      > columns={columns} rows={[{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }]} />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Age')).toBeInTheDocument();
  });

  it('uses row id when available', () => {
    const { container } = render(
      <DataTable
        columns={columns}
        rows={[{ id: 'row-1', name: 'Test', age: 1 }] as Record<string, unknown>[]}
      />,
    );
    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(1);
  });

  it('renders fallback for undefined values', () => {
    render(
      <DataTable
        columns={[{ key: 'missing', label: 'Missing' }]}
        rows={[{ missing: undefined }] as Record<string, unknown>[]}
      />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders column with width style', () => {
    const { container } = render(
      <DataTable
        columns={[{ key: 'x', label: 'X', width: '200px' }]}
        rows={[{ x: 'val' }] as Record<string, unknown>[]}
      />,
    );
    const th = container.querySelector('th');
    expect(th?.style.width).toBe('200px');
  });
});
