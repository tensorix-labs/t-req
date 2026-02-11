const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const vscode = require('vscode');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createServer() {
  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end('missing url');
      return;
    }

    if (req.url.startsWith('/ok')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.url.startsWith('/slow')) {
      await delay(1500);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ slow: true }));
      return;
    }

    if (req.url.startsWith('/events')) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream');
      res.write('event: ping\n');
      res.write('data: hello\n\n');
      setTimeout(() => res.end(), 500);
      return;
    }

    res.statusCode = 404;
    res.end('not found');
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to resolve test server address'));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

async function runCase(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function openDocument(filePath) {
  const document = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(document, { preview: false });
  return document;
}

async function rewriteBaseUrl(filePath, port) {
  const original = await fs.readFile(filePath, 'utf8');
  const updated = original.replace(/^@base\s*=.*$/m, `@base = http://127.0.0.1:${port}`);
  await fs.writeFile(filePath, updated, 'utf8');
  return original;
}

async function restoreFile(filePath, original) {
  await fs.writeFile(filePath, original, 'utf8');
}

async function updateWorkspaceSetting(name, value) {
  await vscode.workspace
    .getConfiguration('t-req')
    .update(name, value, vscode.ConfigurationTarget.Workspace);
}

async function run() {
  const extension = vscode.extensions.getExtension('tensorix-labs.t-req-vscode');
  assert(extension, 'extension tensorix-labs.t-req-vscode not found');
  await extension.activate();

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  assert(workspaceFolder, 'workspace folder is required for integration tests');

  const filePath = path.join(workspaceFolder.uri.fsPath, 'basic.http');
  const slowPath = path.join(workspaceFolder.uri.fsPath, 'slow.http');

  const { server, port } = await createServer();
  const originalContent = await rewriteBaseUrl(filePath, port);

  try {
    await updateWorkspaceSetting('executionMode', 'local');
    await updateWorkspaceSetting('timeout', 10000);

    await runCase('provides code lens and symbols', async () => {
      const document = await openDocument(filePath);

      const codelenses = await vscode.commands.executeCommand(
        'vscode.executeCodeLensProvider',
        document.uri
      );
      assert(Array.isArray(codelenses), 'expected codelens array');
      assert(
        codelenses.length >= 3,
        `expected at least 3 codelenses, received ${codelenses.length}`
      );

      const symbols = await vscode.commands.executeCommand(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      );
      assert(Array.isArray(symbols), 'expected symbols array');
      assert(symbols.length >= 2, `expected at least 2 symbols, received ${symbols.length}`);
    });

    await runCase('runs single request and run-all', async () => {
      const document = await openDocument(filePath);
      await vscode.commands.executeCommand('t-req.runRequest', document.uri, 0);
      await vscode.commands.executeCommand('t-req.runAllRequests', document.uri);
    });

    await runCase('supports cancellation command', async () => {
      await fs.writeFile(slowPath, `GET http://127.0.0.1:${port}/slow\n`, 'utf8');

      const document = await openDocument(slowPath);
      const runPromise = vscode.commands.executeCommand('t-req.runRequest', document.uri, 0);
      setTimeout(() => {
        void vscode.commands.executeCommand('t-req.cancelRequest');
      }, 120);
      await runPromise;
      await fs.unlink(slowPath);
    });
  } finally {
    await restoreFile(filePath, originalContent);
    await new Promise((resolve) => server.close(resolve));
  }
}

module.exports = {
  run
};
