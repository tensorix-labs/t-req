import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

/**
 * OpenAPI Document Configuration
 *
 * Defines the metadata and server configuration for the generated OpenAPI spec.
 */
export const openApiConfig = {
  openapi: '3.0.3',
  info: {
    title: 'Typed Collection API',
    version: '1.0.0',
    description:
      'Auto-generated OpenAPI spec from Zod schemas. ' +
      'Part of the "Ship Types, Not Docs" pattern - schemas are the source of truth.'
  },
  servers: [
    {
      url: 'https://jsonplaceholder.typicode.com',
      description: 'JSONPlaceholder - Users and Posts'
    },
    {
      url: 'https://dummyjson.com',
      description: 'DummyJSON - Authentication'
    }
  ]
};

/**
 * Shared OpenAPI Registry
 *
 * Single registry instance used across all schema registrations and route definitions.
 */
export const registry = new OpenAPIRegistry();
