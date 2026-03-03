import { lazy } from 'solid-js';

export const LazyEditorWithExecution = lazy(() => import('./EditorWithExecution'));
export const LazyCodeEditor = lazy(() => import('./CodeEditor'));
