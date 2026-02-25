import { type Extension, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  hoverTooltip,
  type Tooltip,
  ViewPlugin,
  type ViewUpdate
} from '@codemirror/view';
import {
  resolveTemplateTokenFromVariables,
  scanTemplateTokens,
  type TemplateToken,
  type TemplateTokenResolution,
  type TemplateTokenResolutionStatus
} from '../../utils/template-variables';

export type TemplateTokenResolver = (token: TemplateToken) => TemplateTokenResolution;

export type TemplateCodeMirrorOptions = {
  resolveToken?: TemplateTokenResolver;
};

function classNameForStatus(status: TemplateTokenResolutionStatus): string {
  const tokenBaseClasses = 'bg-transparent no-underline';

  switch (status) {
    case 'resolved':
      return `${tokenBaseClasses} text-success`;
    case 'missing':
      return `${tokenBaseClasses} text-error`;
    case 'resolver':
      return `${tokenBaseClasses} text-info`;
    default:
      return `${tokenBaseClasses} text-warning`;
  }
}

function inlineStyleForStatus(status: TemplateTokenResolutionStatus): string {
  const baseStyle = 'text-decoration:none;background-color:transparent;border:0;';

  switch (status) {
    case 'resolved':
      return `${baseStyle}color:var(--color-success);`;
    case 'missing':
      return `${baseStyle}color:var(--color-error);`;
    case 'resolver':
      return `${baseStyle}color:var(--color-info);`;
    default:
      return `${baseStyle}color:var(--color-warning);`;
  }
}

function fallbackResolver(token: TemplateToken): TemplateTokenResolution {
  return resolveTemplateTokenFromVariables(token, {});
}

function buildDecorations(content: string, resolveToken: TemplateTokenResolver): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const tokens = scanTemplateTokens(content);

  for (const token of tokens) {
    if (token.end <= token.start) {
      continue;
    }

    const resolution = resolveToken(token);
    builder.add(
      token.start,
      token.end,
      Decoration.mark({
        class: classNameForStatus(resolution.status),
        attributes: {
          style: inlineStyleForStatus(resolution.status)
        }
      })
    );
  }

  return builder.finish();
}

function findTokenAtPosition(content: string, position: number): TemplateToken | undefined {
  const tokens = scanTemplateTokens(content);
  return tokens.find((token) => position >= token.start && position <= token.end);
}

function tooltipMessageForToken(token: TemplateToken, resolution: TemplateTokenResolution): string {
  if (resolution.status === 'resolved') {
    return `Resolved value: ${resolution.displayValue}`;
  }

  if (resolution.status === 'resolver') {
    return resolution.displayValue;
  }

  if (resolution.status === 'invalid') {
    return 'Template syntax is invalid.';
  }

  return token.variablePath
    ? `Variable "${token.variablePath}" is not defined.`
    : resolution.displayValue;
}

function applyTooltipTheme(dom: HTMLElement): void {
  const apply = (remainingAttempts: number) => {
    const wrapper = dom.closest('.cm-tooltip') as HTMLElement | null;
    if (!wrapper) {
      if (remainingAttempts > 0) {
        requestAnimationFrame(() => {
          apply(remainingAttempts - 1);
        });
      }
      return;
    }

    const backgroundColor = 'var(--color-base-200)';
    const foregroundColor = 'var(--color-base-content)';
    const borderColor = 'var(--color-base-300)';

    wrapper.style.background = backgroundColor;
    wrapper.style.backgroundColor = backgroundColor;
    wrapper.style.backgroundImage = 'none';
    wrapper.style.color = foregroundColor;
    wrapper.style.borderColor = borderColor;
    wrapper.style.borderStyle = 'solid';
    wrapper.style.borderWidth = '1px';
    wrapper.style.borderRadius = '0.5rem';
    wrapper.style.boxShadow = '0 12px 30px rgb(0 0 0 / 0.45)';
    wrapper.style.minWidth = '260px';
    wrapper.style.maxWidth = '420px';
    wrapper.style.padding = '0';
    wrapper.style.zIndex = '80';
    wrapper.style.opacity = '1';
    wrapper.style.backdropFilter = 'none';
    wrapper.style.mixBlendMode = 'normal';

    dom.style.background = backgroundColor;
    dom.style.backgroundColor = backgroundColor;
    dom.style.backgroundImage = 'none';
    dom.style.color = foregroundColor;
    dom.style.opacity = '1';
    dom.style.backdropFilter = 'none';
  };

  apply(4);
}

function buildTooltip(token: TemplateToken, resolution: TemplateTokenResolution): Tooltip {
  const statusTitleClass =
    resolution.status === 'resolved'
      ? 'text-success'
      : resolution.status === 'missing'
        ? 'text-error'
        : resolution.status === 'resolver'
          ? 'text-info'
          : 'text-warning';

  return {
    pos: token.start,
    end: token.end,
    above: false,
    arrow: false,
    create() {
      const dom = document.createElement('div');
      dom.className = 'cm-template-tooltip p-2 font-mono text-xs leading-5';
      applyTooltipTheme(dom);

      const title = document.createElement('div');
      title.className = `cm-template-tooltip-title mb-1 break-all font-semibold ${statusTitleClass}`;
      title.textContent = token.raw;

      const body = document.createElement('div');
      body.className = 'cm-template-tooltip-body break-words whitespace-pre-wrap text-base-content';
      body.textContent = tooltipMessageForToken(token, resolution);

      dom.append(title, body);
      return { dom };
    }
  };
}

export function createTemplateCodeMirrorExtensions(
  options: TemplateCodeMirrorOptions = {}
): readonly Extension[] {
  const resolveToken = options.resolveToken ?? fallbackResolver;

  const decorationPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view.state.doc.toString(), resolveToken);
      }

      update(update: ViewUpdate) {
        if (!update.docChanged) {
          return;
        }
        this.decorations = buildDecorations(update.state.doc.toString(), resolveToken);
      }
    },
    {
      decorations: (value) => value.decorations
    }
  );

  const tooltipExtension = hoverTooltip((view, position) => {
    const content = view.state.doc.toString();
    const token = findTokenAtPosition(content, position);
    if (!token) {
      return null;
    }

    const resolution = resolveToken(token);
    return buildTooltip(token, resolution);
  });

  return [decorationPlugin, tooltipExtension];
}
