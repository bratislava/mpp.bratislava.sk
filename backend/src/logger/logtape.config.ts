import { AsyncLocalStorage } from 'node:async_hooks'

import { configure, getAnsiColorFormatter, getConsoleSink, type TextFormatter } from '@logtape/logtape'

// eslint-disable-next-line no-control-regex, sonarjs/no-control-regex
const ANSI_ESCAPE_REGEX = /\u001B\[[0-9;]*m/g

/**
 * LogTape treats `{...}` in a logged string as a template placeholder — a
 * message like Nest's "AppController {/}:" would render as "AppController
 * undefined:". Double the braces to log arbitrary text literally.
 */
export function escapeMessageTemplate(text: string): string {
  return text.replaceAll('{', '{{').replaceAll('}', '}}')
}

/**
 * Neutralizes log forging from user-controlled input: strips ANSI escapes and
 * escapes newlines so a value can never break the one-line-per-event format.
 */
export function escapeLogText(text: string): string {
  return text
    .replace(ANSI_ESCAPE_REGEX, '')
    .replaceAll('\n', String.raw`\n`)
    .replaceAll('\r', String.raw`\r`)
}

/** Renders a property value: strings quoted when ambiguous, objects as self-delimiting JSON. */
export function formatLogValue(value: unknown): string {
  if (typeof value === 'string') {
    const escaped = escapeLogText(value)
    // Quote whatever would make the key=value suffix ambiguous to a scraper
    // (whitespace, '=', '"') or vanish entirely (empty), escaping embedded quotes.
    if (escaped === '' || /[ ="]/.test(escaped)) {
      const quoted = escaped.replaceAll('"', '\\"')
      return `"${quoted}"`
    }
    return escaped
  }
  // Objects/arrays render as self-delimiting JSON; other primitives via String().
  // JSON.stringify returns undefined for functions/symbols despite its typing.
  return escapeLogText((JSON.stringify(value) as string | undefined) ?? String(value))
}

function extractStack(error: unknown): string | undefined {
  if (error instanceof Error && error.stack) {
    // Drop the first line ("Name: message") — it duplicates the log message.
    return error.stack.split('\n').slice(1).join('\n')
  }
  if (typeof error === 'object' && error !== null && 'stack' in error && typeof error.stack === 'string') {
    return error.stack
  }
  return undefined
}

export function buildLogFormatter(escapeNewlines: boolean): TextFormatter {
  return getAnsiColorFormatter({
    timestampStyle: null,
    value: (value) => formatLogValue(value),
    format({ timestamp, level, category, message, record }) {
      const { error, ...rest } = record.properties
      let line = `${timestamp ?? ''} ${level} ${category}: ${escapeLogText(message)}`
      const suffix = Object.entries(rest)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${formatLogValue(value)}`)
        .join(' ')
      if (suffix) {
        line += ` ${suffix}`
      }
      const stack = extractStack(error)
      if (stack) {
        // The ONLY sanctioned multi-line output — glued by the Loki multiline
        // stage. LOG_ESCAPE_NEWLINES keeps it single-line until that stage is
        // live (delete the flag once confirmed, see TODOS.md).
        line += escapeNewlines
          ? ` error=${formatLogValue(stack)}`
          : `\n${stack.replace(ANSI_ESCAPE_REGEX, '')}`
      }
      return line
    },
  })
}

export async function configureLogging(): Promise<void> {
  await configure({
    contextLocalStorage: new AsyncLocalStorage(),
    sinks: {
      console: getConsoleSink({
        formatter: buildLogFormatter(process.env.LOG_ESCAPE_NEWLINES === 'true'),
      }),
    },
    loggers: [
      { category: 'http', sinks: ['console'], lowestLevel: 'info' },
      { category: 'app', sinks: ['console'], lowestLevel: 'debug' },
      { category: ['logtape', 'meta'], sinks: ['console'], lowestLevel: 'warning' },
    ],
  })
}
