import { json } from '@codemirror/lang-json';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

const jsonHighlightStyle = HighlightStyle.define([
  {
    tag: tags.propertyName,
    color: 'var(--app-editor-jb-key, #c792ea)'
  },
  {
    tag: [tags.string, tags.special(tags.string)],
    color: 'var(--app-editor-jb-string, #8dc891)'
  },
  {
    tag: [tags.number, tags.integer, tags.float],
    color: 'var(--app-editor-jb-number, #7aa2f7)'
  },
  {
    tag: [tags.bool, tags.null],
    color: 'var(--app-editor-jb-boolean, #e5c07b)'
  },
  {
    tag: [tags.punctuation, tags.bracket],
    color: 'var(--app-editor-jb-punctuation, #c8ccd4)'
  }
]);

const jsonEditorTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: 'var(--app-editor-jb-bg, #2b2d3a)',
      color: 'var(--app-editor-jb-foreground, #d3dae3)'
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'var(--font-mono)'
    },
    '.cm-content': {
      minHeight: '100%',
      padding: '0.5rem 0.625rem',
      fontSize: '0.75rem',
      lineHeight: '1.5rem',
      caretColor: 'var(--app-editor-jb-caret, #d3dae3)'
    },
    '.cm-focused': {
      outline: 'none'
    },
    '.cm-editor.cm-focused': {
      outline: 'none'
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--app-editor-jb-active-line, #333a4a)'
    },
    '.cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'var(--app-editor-jb-selection, #2679db)'
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--app-editor-jb-caret, #d3dae3)'
    },
    '.cm-gutters': {
      backgroundColor: 'var(--app-editor-jb-gutter-bg, #272b3a)',
      color: 'var(--app-editor-jb-gutter-fg, #7f8796)',
      borderRight: '1px solid var(--app-editor-jb-border, #3b4052)'
    },
    '.cm-lineNumbers .cm-gutterElement': {
      paddingInline: '0.5rem'
    }
  },
  { dark: true }
);

export function createJsonCodeMirrorExtensions(): readonly Extension[] {
  return [json(), syntaxHighlighting(jsonHighlightStyle), EditorView.lineWrapping, jsonEditorTheme];
}
