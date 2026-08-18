/**
 * Decode an SSE byte stream into event `data` payloads. Framing 鈥?chunk
 * reassembly, UTF-8/CRLF/BOM handling, comment and non-data field skipping,
 * multi-`data:` joining 鈥?is `eventsource-parser`'s. Comments are reported
 * only through an optional transport-activity callback. This module keeps the
 * OpenAI-compatible protocol: the literal `[DONE]` is yielded so the caller
 * owns final flushing. RightAPI terminates the event stream by a clean EOF
 * WITHOUT the `[DONE]` sentinel, so a clean EOF synthesizes the sentinel
 * instead of being treated as truncation. Framing is spec-strict: an event
 * dispatches only on its blank-line terminator.
 *
 * @module dsh-llm-rightapi/sse
 */

import { EventSourceParserStream } from 'eventsource-parser/stream'

/** The terminal payload OpenAI-compatible services send after the last chunk. */
export const DONE = '[DONE]'

/**
 * Parse an SSE byte stream into data payloads. Yields `[DONE]` as the final
 * value and returns. A stream that ends without the sentinel is treated as a
 * normal RightAPI completion (it closes by EOF); the sentinel is synthesized
 * so the caller's final block/usage flush always runs. An entirely empty
 * stream therefore produces a lone `[DONE]`, which the translate layer maps
 * to an `EMPTY_RESPONSE` error finish.
 * @param stream - raw SSE bytes; reads may split anywhere, including mid-UTF-8 sequence.
 * @param onComment - optional transport-activity callback; comments never enter the yielded payload stream.
 * @returns each event's data payload in arrival order, the `[DONE]` sentinel last.
 */
export async function* parseSse(
  stream: ReadableStream<BufferSource>,
  onComment?: (comment: string) => void,
): AsyncGenerator<string> {
  const events = stream
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream({ onComment }))
  for await (const { data } of events) {
    yield data
    if (data === DONE) return
  }
  // RightAPI does not emit the [DONE] sentinel: a clean EOF is the terminal
  // marker. Any data payloads already yielded were flushed above, so the
  // synthesized sentinel only triggers the caller's final block/usage flush.
  yield DONE
}
