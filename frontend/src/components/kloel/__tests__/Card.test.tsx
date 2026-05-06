import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Card } from '../Card';

describe('Card', () => {
  it('renders children inside a div when no onClick is provided', () => {
    render(<Card>Hello world</Card>);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText('Hello world').tagName).toBe('DIV');
  });

  it('renders as a button when onClick is provided', () => {
    render(<Card onClick={() => {}}>Click me</Card>);
    const el = screen.getByText('Click me');
    expect(el.tagName).toBe('BUTTON');
    expect(el).toHaveAttribute('type', 'button');
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick}>Interactive</Card>);
    fireEvent.click(screen.getByText('Interactive'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies custom className', () => {
    render(
      <Card className="custom-card" onClick={() => {}}>
        Styled
      </Card>,
    );
    expect(screen.getByText('Styled')).toHaveClass('custom-card');
  });

  it('applies custom style', () => {
    const { container } = render(<Card style={{ margin: 12 }}>Styled</Card>);
    expect(container.firstChild).toHaveStyle({ margin: '12px' });
  });

  it('sets cursor pointer style when interactive', () => {
    const { container } = render(<Card onClick={() => {}}>Interactive</Card>);
    expect(container.firstChild).toHaveStyle({ cursor: 'pointer' });
  });

  it('does not set cursor pointer when non-interactive', () => {
    const { container } = render(<Card>Static</Card>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.cursor).toBe('');
  });

  it('updates border on mouse enter/leave', () => {
    const { container } = render(<Card>Hover test</Card>);
    const el = container.firstChild as HTMLElement;

    const initialColor = el.style.borderColor;
    expect(initialColor).toBe('rgb(34, 34, 38)');

    fireEvent.mouseEnter(el);
    expect(el.style.borderColor).toBe('rgb(51, 51, 56)');

    fireEvent.mouseLeave(el);
    expect(el.style.borderColor).toBe('rgb(34, 34, 38)');
  });

  it('handles null onClick without error', () => {
    render(<Card onClick={undefined}>Safe</Card>);
    expect(screen.getByText('Safe').tagName).toBe('DIV');
  });
});
