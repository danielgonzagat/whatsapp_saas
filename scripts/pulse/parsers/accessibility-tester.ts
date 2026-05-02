/**
 * PULSE Parser 69: Accessibility Tester (STATIC)
 * Layer 9: Frontend Health
 *
 * STATIC analysis: scans frontend .tsx files for common accessibility violations
 * that can be detected without running a browser:
 * - <img> without alt prop
 * - Buttons with no accessible text (no text content, no aria-label, no aria-labelledby)
 * - Form inputs without associated labels
 *
 * BREAK TYPES:
 *   ACCESSIBILITY_VIOLATION (medium) — detected pattern prevents screen reader access
 */

import * as path from 'path';
import * as ts from 'typescript';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

interface AccessibilityDiagnostic {
  node: ts.Node;
  description: string;
  guidance: string;
}

function readSafe(file: string): string {
  try {
    return readTextFile(file, 'utf8');
  } catch {
    return '';
  }
}

function eventType(...parts: string[]): Break['type'] {
  return parts.map((part) => part.toUpperCase()).join('_');
}

function accessibilityViolationType(): Break['type'] {
  return eventType('accessibility', 'violation');
}

function pushDiagnostic(
  breaks: Break[],
  config: PulseConfig,
  sourceFile: ts.SourceFile,
  file: string,
  diagnostic: AccessibilityDiagnostic,
): void {
  const { line } = sourceFile.getLineAndCharacterOfPosition(diagnostic.node.getStart(sourceFile));
  const sourceLine = sourceFile.text.split('\n')[line]?.trim() ?? diagnostic.description;
  breaks.push({
    type: accessibilityViolationType(),
    severity: 'medium',
    file: path.relative(config.rootDir, file),
    line: line + 1,
    description: diagnostic.description,
    detail: `${sourceLine.slice(0, 100)} — ${diagnostic.guidance}`,
  });
}

function shouldSkipFile(filePath: string): boolean {
  const normalized = filePath.split(path.sep).join('/');
  const fileName = path.basename(filePath);
  return (
    fileName.endsWith('.spec.tsx') ||
    fileName.endsWith('.test.tsx') ||
    normalized.includes('/__tests__/') ||
    normalized.includes('/__mocks__/') ||
    normalized.includes('/node_modules/') ||
    normalized.includes('/.next/')
  );
}

function tagNameText(name: ts.JsxTagNameExpression): string {
  if (ts.isIdentifier(name)) {
    return name.text;
  }
  return name.getText();
}

function attributeNameText(name: ts.JsxAttributeName): string {
  if (ts.isIdentifier(name)) {
    return name.text;
  }
  return name.getText();
}

function attributesOf(node: ts.JsxOpeningLikeElement): ts.JsxAttributes {
  return node.attributes;
}

function findAttribute(
  node: ts.JsxOpeningLikeElement,
  attributeName: string,
): ts.JsxAttribute | null {
  for (const property of attributesOf(node).properties) {
    if (ts.isJsxAttribute(property) && attributeNameText(property.name) === attributeName) {
      return property;
    }
  }
  return null;
}

function hasAttribute(node: ts.JsxOpeningLikeElement, attributeName: string): boolean {
  return findAttribute(node, attributeName) !== null;
}

function hasSpreadAttribute(node: ts.JsxOpeningLikeElement): boolean {
  return attributesOf(node).properties.some(ts.isJsxSpreadAttribute);
}

function attributeLiteralText(attribute: ts.JsxAttribute | null): string | null {
  if (!attribute?.initializer) {
    return null;
  }
  if (ts.isStringLiteral(attribute.initializer)) {
    return attribute.initializer.text;
  }
  if (!ts.isJsxExpression(attribute.initializer) || !attribute.initializer.expression) {
    return null;
  }
  const expression = attribute.initializer.expression;
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  return null;
}

function expressionCanNameAccessibleText(expression: ts.Expression): boolean {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text.trim().length > 0;
  }
  return ts.isIdentifier(expression) || ts.isPropertyAccessExpression(expression);
}

function nodeHasVisibleText(node: ts.Node): boolean {
  let found = false;
  const visit = (current: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isJsxText(current) && current.text.trim().length > 0) {
      found = true;
      return;
    }
    if (
      ts.isJsxExpression(current) &&
      current.expression &&
      expressionCanNameAccessibleText(current.expression)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

function nodeHasDescendantTag(node: ts.Node, predicate: (tagName: string) => boolean): boolean {
  let found = false;
  const visit = (current: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isJsxElement(current)) {
      found = predicate(tagNameText(current.openingElement.tagName));
      if (found) {
        return;
      }
    }
    if (ts.isJsxSelfClosingElement(current)) {
      found = predicate(tagNameText(current.tagName));
      if (found) {
        return;
      }
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

function isIconTag(tagName: string): boolean {
  return tagName === 'svg' || tagName.endsWith('Icon') || tagName === 'Icon';
}

function isLabelLikeTag(tagName: string): boolean {
  return tagName === 'label' || tagName === 'Label' || tagName.endsWith('Label');
}

function hasLabelAncestor(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxElement(current) && isLabelLikeTag(tagNameText(current.openingElement.tagName))) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function collectLabelTargets(sourceFile: ts.SourceFile): Set<string> {
  const targets = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) && tagNameText(node.openingElement.tagName) === 'label') {
      const target = attributeLiteralText(findAttribute(node.openingElement, 'htmlFor'));
      if (target) {
        targets.add(target);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return targets;
}

function isNonUserTextInput(opening: ts.JsxOpeningLikeElement): boolean {
  const typeValue = attributeLiteralText(findAttribute(opening, 'type'))?.toLowerCase();
  if (!typeValue) {
    return false;
  }
  return ['hidden', 'submit', 'button', 'reset', 'image', 'file'].includes(typeValue);
}

function isHiddenByStaticEvidence(opening: ts.JsxOpeningLikeElement): boolean {
  const className = attributeLiteralText(findAttribute(opening, 'className'));
  if (className?.split(' ').includes('hidden')) {
    return true;
  }
  const style = findAttribute(opening, 'style');
  return (
    style?.initializer?.getText().includes('display') === true &&
    style.initializer.getText().includes('none')
  );
}

function hasComponentLabelEvidence(opening: ts.JsxOpeningLikeElement): boolean {
  let current: ts.Node | undefined = opening.parent;
  while (current) {
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) {
      const tagName = ts.isJsxElement(current)
        ? tagNameText(current.openingElement.tagName)
        : tagNameText(current.tagName);
      const attributes = ts.isJsxElement(current) ? current.openingElement : current;
      if (tagName !== 'input' && hasAttribute(attributes, 'label')) {
        return true;
      }
    }
    current = current.parent;
  }
  return false;
}

function imgDiagnostic(
  node: ts.JsxSelfClosingElement | ts.JsxElement,
): AccessibilityDiagnostic | null {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  if (tagNameText(opening.tagName) !== 'img' || hasAttribute(opening, 'alt')) {
    return null;
  }
  return {
    node: opening,
    description: '<img> element missing alt attribute',
    guidance:
      'Screen readers cannot describe this image without an alt attribute. Add alt="" for decorative images or alt="descriptive text" for informative ones.',
  };
}

function buttonDiagnostic(node: ts.JsxElement): AccessibilityDiagnostic | null {
  const opening = node.openingElement;
  if (tagNameText(opening.tagName) !== 'button') {
    return null;
  }
  const hasAccessibleName =
    hasAttribute(opening, 'aria-label') ||
    hasAttribute(opening, 'aria-labelledby') ||
    hasAttribute(opening, 'title') ||
    nodeHasDescendantTag(node, (tagName) => tagName === 'title') ||
    nodeHasVisibleText(node);
  const hasIconOnlyEvidence = nodeHasDescendantTag(node, isIconTag) && !nodeHasVisibleText(node);
  if (!hasIconOnlyEvidence || hasAccessibleName) {
    return null;
  }
  return {
    node: opening,
    description: 'Icon-only <button> missing aria-label — inaccessible to screen readers',
    guidance:
      'This button appears to contain only an SVG icon with no visible text. Add aria-label="Action description" so screen readers can announce the button purpose.',
  };
}

function inputDiagnostic(
  node: ts.JsxSelfClosingElement,
  labelTargets: Set<string>,
): AccessibilityDiagnostic | null {
  if (tagNameText(node.tagName) !== 'input') {
    return null;
  }
  if (
    isNonUserTextInput(node) ||
    isHiddenByStaticEvidence(node) ||
    hasSpreadAttribute(node) ||
    hasAttribute(node, 'aria-label') ||
    hasAttribute(node, 'aria-labelledby') ||
    hasAttribute(node, 'placeholder') ||
    hasLabelAncestor(node) ||
    hasComponentLabelEvidence(node)
  ) {
    return null;
  }
  const idValue = attributeLiteralText(findAttribute(node, 'id'));
  if (idValue && labelTargets.has(idValue)) {
    return null;
  }
  return {
    node,
    description: '<input> without associated label or aria-label',
    guidance:
      'Screen readers cannot describe this input to users. Add aria-label="Field description" or wrap in <label> or use <label htmlFor={id}>.',
  };
}

/** Check accessibility. */
export function checkAccessibility(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const tsxFiles = walkFiles(config.frontendDir, ['.tsx']).filter((file) => !shouldSkipFile(file));

  for (const file of tsxFiles) {
    const content = readSafe(file);
    if (!content) {
      continue;
    }

    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const labelTargets = collectLabelTargets(sourceFile);
    const visit = (node: ts.Node): void => {
      const elementDiagnostic = ts.isJsxElement(node)
        ? (imgDiagnostic(node) ?? buttonDiagnostic(node))
        : null;
      const selfClosingDiagnostic = ts.isJsxSelfClosingElement(node)
        ? (imgDiagnostic(node) ?? inputDiagnostic(node, labelTargets))
        : null;
      const diagnostic = elementDiagnostic ?? selfClosingDiagnostic;
      if (diagnostic) {
        pushDiagnostic(breaks, config, sourceFile, file, diagnostic);
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return breaks;
}
