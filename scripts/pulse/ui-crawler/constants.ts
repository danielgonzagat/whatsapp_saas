import type { CrawlerRole, UIElementKind } from '../../types.ui-crawler';

export const FRONTEND_SRC = 'frontend/src';
export const APP_DIR = 'app';

export const DOM_ELEMENTS: Record<string, UIElementKind> = {
  button: 'button',
  a: 'link',
  form: 'form',
  input: 'input',
  select: 'select',
  textarea: 'input',
};

export const SHADCN_ELEMENTS: Record<string, UIElementKind> = {
  Button: 'button',
  Link: 'link',
  Form: 'form',
  Input: 'input',
  Select: 'select',
  Textarea: 'input',
  Dialog: 'modal',
  Modal: 'modal',
  DropdownMenu: 'menu',
  NavigationMenu: 'nav',
  Tabs: 'tab',
  Toggle: 'toggle',
  Switch: 'toggle',
};

export const DOM_HANDLER_PROPS = new Set([
  'onClick',
  'onSubmit',
  'onChange',
  'onBlur',
  'onFocus',
  'onInput',
  'onKeyDown',
  'onKeyUp',
  'onMouseDown',
  'onMouseEnter',
  'onMouseLeave',
  'onMouseUp',
  'onPointerDown',
  'onPointerEnter',
  'onPointerLeave',
  'onPointerUp',
]);

export const NAVIGATION_PATTERNS = [
  /\brouter\s*\.\s*push\s*\(/,
  /\brouter\s*\.\s*replace\s*\(/,
  /\bnavigate\s*\(/,
  /\bwindow\s*\.\s*location\s*\.\s*href\s*=/,
  /\bredirect\s*\(/,
];

export const AUTH_BOUNDARY_RE =
  /\b(?:middleware|guard|withAuth|requireAuth|useAuth|useSession|getServerSession|authOptions|canActivate|requireSession|requireUser|protectedRoute)\b/i;

export const ROLE_NAMES = new Set<CrawlerRole>([
  'anonymous',
  'customer',
  'operator',
  'admin',
  'producer',
  'affiliate',
]);
