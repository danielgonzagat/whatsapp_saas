import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button, IconButton, Badge, Chip, Skeleton, Avatar } from '../Primitives';

vi.mock('next/image', () => ({
  default: ({ src, alt = '', ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img src={typeof src === 'string' ? src : ''} alt={alt} {...props} />
  ),
}));

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByText('Click'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disables the button and prevents click when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>,
    );
    const btn = screen.getByText('Disabled');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disables the button when isLoading', () => {
    render(<Button isLoading>Loading</Button>);
    expect(screen.getByLabelText('Carregando')).toBeInTheDocument();
  });

  it('renders leftIcon and rightIcon', () => {
    render(
      <Button
        leftIcon={<span data-testid="left">L</span>}
        rightIcon={<span data-testid="right">R</span>}
      >
        With Icons
      </Button>,
    );
    expect(screen.getByTestId('left')).toBeInTheDocument();
    expect(screen.getByTestId('right')).toBeInTheDocument();
  });

  it('hides rightIcon when isLoading', () => {
    render(
      <Button isLoading rightIcon={<span data-testid="right">R</span>}>
        Loading
      </Button>,
    );
    expect(screen.queryByTestId('right')).toBeNull();
  });

  it('applies variant styles — danger', () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByText('Delete');
    expect(btn).toHaveStyle({ backgroundColor: '#E85D30', color: '#fff' });
  });

  it('applies size styles — lg', () => {
    render(<Button size="lg">Big</Button>);
    expect(screen.getByText('Big')).toHaveClass('h-12');
  });

  it('forwards ref', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});

describe('IconButton', () => {
  it('renders with icon', () => {
    render(<IconButton aria-label="Close" icon={<span data-testid="close-icon">x</span>} />);
    expect(screen.getByLabelText('Close')).toBeInTheDocument();
    expect(screen.getByTestId('close-icon')).toBeInTheDocument();
  });

  it('disables when isLoading', () => {
    render(<IconButton aria-label="Loading" isLoading icon={<span data-testid="icon">i</span>} />);
    expect(screen.getByLabelText('Carregando')).toBeInTheDocument();
    expect(screen.queryByTestId('icon')).toBeNull();
  });
});

describe('Badge', () => {
  it('renders text children', () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('renders as a dot when dot prop is true', () => {
    const { container } = render(<Badge dot>Hidden</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass('w-2', 'h-2', 'rounded-full');
    expect(el).toBeEmptyDOMElement();
  });

  it('applies success variant colors', () => {
    render(<Badge variant="success">Done</Badge>);
    expect(screen.getByText('Done')).toHaveStyle({ color: '#E0DDD8' });
  });

  it('renders warning variant', () => {
    render(<Badge variant="warning">Warn</Badge>);
    expect(screen.getByText('Warn')).toHaveStyle({ color: '#6E6E73' });
  });

  it('renders error variant', () => {
    render(<Badge variant="error">Fail</Badge>);
    expect(screen.getByText('Fail')).toHaveStyle({ color: '#E85D30' });
  });

  it('renders info variant', () => {
    render(<Badge variant="info">Info</Badge>);
    expect(screen.getByText('Info')).toHaveStyle({ color: '#6E6E73' });
  });
});

describe('Chip', () => {
  it('renders children', () => {
    render(<Chip>Filter</Chip>);
    expect(screen.getByText('Filter')).toBeInTheDocument();
  });

  it('renders as a button when onClick is provided', () => {
    render(<Chip onClick={() => {}}>Clickable</Chip>);
    expect(screen.getByText('Clickable').tagName).toBe('BUTTON');
  });

  it('calls onRemove when remove button is clicked', () => {
    const onRemove = vi.fn();
    render(<Chip onRemove={onRemove}>Removable</Chip>);
    const removeBtn = screen.getByText('\xd7');
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('onRemove stopPropagation prevents onClick', () => {
    const onClick = vi.fn();
    const onRemove = vi.fn();
    render(
      <Chip onClick={onClick} onRemove={onRemove}>
        Both
      </Chip>,
    );
    fireEvent.click(screen.getByText('\xd7'));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders as span when not interactive', () => {
    render(<Chip>Static</Chip>);
    expect(screen.getByText('Static').tagName).toBe('SPAN');
  });

  it('applies success variant', () => {
    render(<Chip variant="success">OK</Chip>);
    expect(screen.getByText('OK')).toHaveStyle({ color: '#E0DDD8' });
  });
});

describe('Skeleton', () => {
  it('renders with default rectangular variant', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass('animate-pulse', 'rounded-lg');
  });

  it('renders circular variant', () => {
    const { container } = render(<Skeleton variant="circular" />);
    expect(container.firstChild).toHaveClass('rounded-full');
  });

  it('renders text variant', () => {
    const { container } = render(<Skeleton variant="text" />);
    expect(container.firstChild).toHaveClass('rounded', 'h-4');
  });

  it('applies width and height', () => {
    const { container } = render(<Skeleton width={200} height={40} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe('200px');
    expect(el.style.height).toBe('40px');
  });
});

describe('Avatar', () => {
  it('renders initials from full name', () => {
    render(<Avatar name="Maria Santos" />);
    expect(screen.getByText('MS')).toBeInTheDocument();
  });

  it('renders first letter for single word name', () => {
    render(<Avatar name="Admin" />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renders "?" fallback when no name or src', () => {
    render(<Avatar />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('renders image when src is provided', () => {
    render(<Avatar src="/avatar.png" alt="User" />);
    expect(screen.getByAltText('User')).toBeInTheDocument();
  });

  it('uses name as alt fallback when src provided without alt', () => {
    render(<Avatar src="/avatar.png" name="Joao" />);
    expect(screen.getByAltText('Joao')).toBeInTheDocument();
  });

  it('renders status dot with inline style', () => {
    const { container } = render(<Avatar name="Online" status="online" />);
    const statusDot = container.querySelector('[class*="rounded-full"][class*="border-2"]');
    expect(statusDot).toBeInTheDocument();
    expect(statusDot).toHaveStyle({ backgroundColor: '#E0DDD8' });
  });

  it('applies size classes to avatar inner element', () => {
    const { container } = render(<Avatar name="Big" size="xl" />);
    const innerAvatar = container.querySelector('.w-16.h-16');
    expect(innerAvatar).toBeInTheDocument();
    expect(innerAvatar).toHaveClass('rounded-full');
  });
});
