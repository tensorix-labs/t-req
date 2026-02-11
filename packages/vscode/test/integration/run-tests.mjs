import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionDevelopmentPath = path.resolve(__dirname, '..', '..');
const extensionTestsPath = path.resolve(__dirname, 'suite', 'index.cjs');
const workspacePath = path.resolve(__dirname, '..', 'fixtures', 'workspace');

try {
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [workspacePath, '--disable-extensions']
  });
} catch (error) {
  console.error('Failed to run VS Code integration tests:', error);
  process.exit(1);
}
