import { type Directive, definePlugin } from '@t-req/core';
import type { AssertCheckReport, AssertPluginOptions } from '../domain/types';
import { createMemoizedParser } from '../parser/cache';
import { parseAssertionExpression } from '../parser/parse';
import { buildSummaryReport } from '../reporting/summary';
import { createBodyReader } from '../runtime/body-reader';
import { evaluateAssertion } from '../runtime/evaluate';
import { makeDiagnostic, scanAssertLines } from '../validate/scan';

const PARSE_CACHE_ENTRIES = 512;

function getDirectiveAssertions(
  directives: Directive[] | undefined,
  directiveName: string
): Directive[] {
  if (!directives || directives.length === 0) return [];
  return directives.filter((directive) => directive.name === directiveName);
}

export default function assertPlugin(options: AssertPluginOptions = {}) {
  const directiveName = options.directiveName ?? 'assert';
  const parseCached = createMemoizedParser(parseAssertionExpression, PARSE_CACHE_ENTRIES);

  return definePlugin({
    name: 'assert',
    version: '0.1.0',
    hooks: {
      async 'response.after'(input) {
        const directives = getDirectiveAssertions(input.request.directives, directiveName);
        if (directives.length === 0) return;

        const checks: AssertCheckReport[] = [];
        const bodyReader = createBodyReader(input.response);

        for (const directive of directives) {
          const expression = directive.value.trim();
          const parsed = parseCached(expression);

          if (!parsed.ok) {
            checks.push({
              line: directive.line,
              expression,
              passed: false,
              message: parsed.message,
              code: parsed.code
            });
            continue;
          }

          const evaluated = await evaluateAssertion(parsed.assertion, input.response, bodyReader);
          checks.push({
            line: directive.line,
            expression,
            ...evaluated
          });
        }

        input.ctx.report(buildSummaryReport(checks));
      },

      validate(input, output) {
        const occurrences = scanAssertLines(input.content, directiveName);

        for (const occurrence of occurrences) {
          if (occurrence.afterRequestLine) {
            output.diagnostics.push(
              makeDiagnostic(
                occurrence.line,
                occurrence.directiveColumn,
                occurrence.directiveColumn + directiveName.length + 1,
                'assert.position',
                `@${directiveName} must appear before the request line`
              )
            );
            continue;
          }

          const parsed = parseCached(occurrence.expression);
          if (parsed.ok) continue;

          output.diagnostics.push(
            makeDiagnostic(
              occurrence.line,
              occurrence.expressionColumn + parsed.columnStart,
              occurrence.expressionColumn + parsed.columnEnd,
              parsed.code,
              parsed.message
            )
          );
        }
      }
    }
  });
}
