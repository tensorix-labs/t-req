/**
 * Editor integration for viewing execution details in $EDITOR.
 */

import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CliRenderer } from '@opentui/core';
import type { ExecutionDetail } from './sdk';

/**
 * Get the user's preferred editor.
 * Returns undefined if no editor is configured.
 */
function getEditor(): string | undefined {
  return process.env.VISUAL || process.env.EDITOR;
}

/**
 * Format body content, pretty printing JSON when detected.
 */
function formatBody(body: string, contentType?: string): string {
  const isJson = contentType?.toLowerCase().includes('application/json');

  if (isJson || !contentType) {
    try {
      const parsed = JSON.parse(body);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return body;
    }
  }
  return body;
}

/**
 * Format execution detail as human-readable text.
 */
function formatExecutionDetail(detail: ExecutionDetail): string {
  const lines: string[] = [];

  // Header
  lines.push('='.repeat(60));
  lines.push(`Execution: ${detail.reqExecId}`);
  lines.push(`Status: ${detail.status}`);
  if (detail.reqLabel) {
    lines.push(`Label: ${detail.reqLabel}`);
  }
  lines.push('='.repeat(60));
  lines.push('');

  // Source info
  if (detail.source) {
    lines.push('--- Source ---');
    lines.push(`Kind: ${detail.source.kind}`);
    if (detail.source.path) {
      lines.push(`File: ${detail.source.path}`);
    }
    if (detail.source.requestIndex !== undefined) {
      lines.push(`Request Index: ${detail.source.requestIndex}`);
    }
    if (detail.source.requestName) {
      lines.push(`Request Name: ${detail.source.requestName}`);
    }
    lines.push('');
  }

  // Request info
  lines.push('--- Request ---');
  if (detail.method) {
    lines.push(`Method: ${detail.method}`);
  }
  if (detail.urlTemplate) {
    lines.push(`URL Template: ${detail.urlTemplate}`);
  }
  if (detail.urlResolved) {
    lines.push(`URL Resolved: ${detail.urlResolved}`);
  }
  if (detail.headers && detail.headers.length > 0) {
    lines.push('');
    lines.push('Headers:');
    for (const header of detail.headers) {
      lines.push(`  ${header.name}: ${header.value}`);
    }
  }
  if (detail.bodyPreview) {
    lines.push('');
    lines.push('Body Preview:');
    lines.push(detail.bodyPreview);
  }
  lines.push('');

  // Raw HTTP block
  if (detail.rawHttpBlock) {
    lines.push('--- Raw HTTP Block ---');
    lines.push(detail.rawHttpBlock);
    lines.push('');
  }

  // Timing
  lines.push('--- Timing ---');
  lines.push(`Started: ${new Date(detail.timing.startTime).toISOString()}`);
  if (detail.timing.endTime) {
    lines.push(`Ended: ${new Date(detail.timing.endTime).toISOString()}`);
  }
  if (detail.timing.durationMs !== undefined) {
    lines.push(`Duration: ${detail.timing.durationMs}ms`);
  }
  lines.push('');

  // Response
  if (detail.response) {
    lines.push('--- Response ---');
    lines.push(`Status: ${detail.response.status} ${detail.response.statusText}`);
    lines.push(`Body Size: ${detail.response.bodyBytes} bytes`);
    if (detail.response.truncated) {
      lines.push('(Body was truncated)');
    }
    lines.push('');

    if (detail.response.headers.length > 0) {
      lines.push('Headers:');
      for (const header of detail.response.headers) {
        lines.push(`  ${header.name}: ${header.value}`);
      }
      lines.push('');
    }

    if (detail.response.body) {
      lines.push('Body:');
      if (detail.response.encoding === 'base64') {
        lines.push('(Base64 encoded)');
        lines.push(detail.response.body);
      } else {
        const contentType = detail.response.headers.find(
          (h) => h.name.toLowerCase() === 'content-type'
        )?.value;
        lines.push(formatBody(detail.response.body, contentType));
      }
      lines.push('');
    }
  }

  // Error
  if (detail.error) {
    lines.push('--- Error ---');
    lines.push(`Stage: ${detail.error.stage}`);
    lines.push(`Message: ${detail.error.message}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Open execution detail in the user's configured editor.
 * Uses the renderer's suspend/resume methods to properly restore the TUI.
 * Returns a promise that resolves when the editor closes.
 */
export async function openInEditor(detail: ExecutionDetail, renderer: CliRenderer): Promise<void> {
  const editor = getEditor();
  if (!editor) return;

  const content = formatExecutionDetail(detail);
  const filepath = join(tmpdir(), `treq-${detail.reqExecId}-${Date.now()}.txt`);

  try {
    await writeFile(filepath, content, 'utf-8');

    // Suspend TUI - use renderer's built-in methods
    renderer.suspend();
    renderer.currentRenderBuffer.clear();

    // Spawn editor
    const parts = editor.split(' ');
    const proc = Bun.spawn({
      cmd: [...parts, filepath],
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit'
    });
    await proc.exited;

    // Resume TUI
    renderer.currentRenderBuffer.clear();
    renderer.resume();
    renderer.requestRender();
  } finally {
    try {
      await unlink(filepath);
    } catch {
      // Ignore cleanup errors
    }
  }
}
