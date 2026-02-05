import { lazy } from 'solid-js';

export const LazyEditorWithExecution = lazy(() => import('./EditorWithExecution'));
export const LazyHttpEditor = lazy(() => import('./HttpEditor'));
export const LazyCodeEditor = lazy(() => import('./CodeEditor'));
