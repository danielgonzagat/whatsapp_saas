import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StepEmbalagem } from './step-embalagem';
import { initialForm } from './types';

describe('StepEmbalagem', () => {
  it('identifies package fields for autofill and accessibility tooling', () => {
    render(<StepEmbalagem form={initialForm} updateForm={vi.fn()} />);

    const packageType = screen.getByRole('combobox', { name: /tipo de embalagem/i });
    const width = screen.getByRole('textbox', { name: /largura/i });
    const height = screen.getByRole('textbox', { name: /altura em cm/i });
    const depth = screen.getByRole('textbox', { name: /profundidade em cm/i });
    const weight = screen.getByRole('textbox', { name: /peso em kg/i });

    expect(packageType.getAttribute('id')).toBe('product-package-type');
    expect(packageType.getAttribute('name')).toBe('productPackageType');
    expect(width.getAttribute('id')).toBe('product-package-width');
    expect(width.getAttribute('name')).toBe('productPackageWidth');
    expect(height.getAttribute('id')).toBe('product-package-height');
    expect(height.getAttribute('name')).toBe('productPackageHeight');
    expect(depth.getAttribute('id')).toBe('product-package-depth');
    expect(depth.getAttribute('name')).toBe('productPackageDepth');
    expect(weight.getAttribute('id')).toBe('product-package-weight');
    expect(weight.getAttribute('name')).toBe('productPackageWeight');

    for (const field of [width, height, depth, weight]) {
      expect(field.getAttribute('inputmode')).toBe('decimal');
      expect(field.getAttribute('min')).toBeNull();
      expect(field.getAttribute('max')).toBeNull();
    }
  });
});
