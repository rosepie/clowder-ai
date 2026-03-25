import type { CatId } from '@cat-cafe/shared';
import type { AgentMessage } from '../../types.js';

function toTextContent(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (!value || typeof value !== 'object') return null;
  const text = (value as { text?: unknown }).text;
  if (typeof text === 'string' && text.length > 0) return text;
  return null;
}

function extractToolResultContent(rawContent: unknown): string | null {
  if (Array.isArray(rawContent)) {
    for (const item of rawContent) {
      if (!item || typeof item !== 'object') continue;
      const content = (item as { content?: unknown }).content;
      const text = toTextContent(content);
      if (text) return text;
    }
  }
  return toTextContent(rawContent);
}

function toolInputFromRaw(rawInput: unknown): Record<string, unknown> {
  if (rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)) {
    return rawInput as Record<string, unknown>;
  }
  if (rawInput === undefined) return {};
  return { rawInput };
}

export function transformACPUpdate(
  update: Record<string, unknown>,
  catId: CatId,
): AgentMessage[] {
  const sessionUpdate = typeof update.sessionUpdate === 'string' ? update.sessionUpdate : '';
  switch (sessionUpdate) {
    case 'agent_message_chunk': {
      const text = toTextContent(update.content);
      return text
        ? [
            {
              type: 'text',
              catId,
              content: text,
              timestamp: Date.now(),
            },
          ]
        : [];
    }
    case 'agent_thought_chunk': {
      const text = toTextContent(update.content);
      return text
        ? [
            {
              type: 'system_info',
              catId,
              content: JSON.stringify({ type: 'thinking', catId, text }),
              timestamp: Date.now(),
            },
          ]
        : [];
    }
    case 'tool_call':
      return [
        {
          type: 'tool_use',
          catId,
          toolName: typeof update.title === 'string' && update.title.trim() ? update.title.trim() : 'tool',
          toolInput: toolInputFromRaw(update.rawInput),
          timestamp: Date.now(),
        },
      ];
    case 'tool_call_update': {
      const text =
        extractToolResultContent(update.content) ??
        (typeof update.status === 'string' && update.status.trim() ? `status: ${update.status.trim()}` : null);
      return text
        ? [
            {
              type: 'tool_result',
              catId,
              content: text,
              timestamp: Date.now(),
            },
          ]
        : [];
    }
    case 'user_message_chunk':
      return [];
    default:
      return [];
  }
}
