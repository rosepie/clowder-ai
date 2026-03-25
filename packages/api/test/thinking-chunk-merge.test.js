import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('appendThinkingChunk', () => {
  it('concatenates streaming thinking chunks without markdown separators', async () => {
    const { appendThinkingChunk } = await import('../dist/domains/cats/services/agents/routing/thinking-chunk-merge.js');
    let thinking = '';
    thinking = appendThinkingChunk(thinking, 'The');
    thinking = appendThinkingChunk(thinking, ' user');
    thinking = appendThinkingChunk(thinking, ' asked.');
    assert.equal(thinking, 'The user asked.');
  });

  it('keeps existing text when the next chunk is empty', async () => {
    const { appendThinkingChunk } = await import('../dist/domains/cats/services/agents/routing/thinking-chunk-merge.js');
    assert.equal(appendThinkingChunk('ready', ''), 'ready');
  });
});
