import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { writeFileSync } from 'fs';
import { stringify } from 'yaml';

import { openApiConfig, registry } from './config';

// Import registry to ensure schemas are registered
import './registry';

// Import routes to register all paths
import './routes';

/**
 * Generate OpenAPI Document
 *
 * Uses the configured registry to produce a complete OpenAPI 3.0.3 specification.
 */
function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument(openApiConfig);
}

/**
 * Main Entry Point
 *
 * Generates OpenAPI spec and outputs to both YAML and JSON formats.
 */
function main() {
  console.log('Generating OpenAPI specification...\n');

  const document = generateOpenApiDocument();

  // Write YAML
  const yamlContent = stringify(document);
  writeFileSync('openapi.yaml', yamlContent);
  console.log('  openapi.yaml');

  // Write JSON
  const jsonContent = JSON.stringify(document, null, 2);
  writeFileSync('openapi.json', jsonContent);
  console.log('  openapi.json');

  console.log('\nOpenAPI spec generated successfully!');
  console.log('\nPreview with: bunx @redocly/cli preview-docs openapi.yaml');
}

main();
