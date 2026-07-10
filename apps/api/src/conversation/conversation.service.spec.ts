import { Logger } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import type { SupabaseService } from '../common/supabase/supabase.service';
import type { StoredMessage } from './types/stored-message.type';

type Result = { data: unknown; error: { message: string } | null };

/**
 * Builds a Supabase client mock whose chainable methods all return the same
 * builder, and whose terminal methods (`maybeSingle`, `single`) resolve the
 * next queued result in order. `update().eq().eq()` without a terminal is
 * awaited directly, so the builder is also thenable (resolves { error: null }).
 */
function makeClient(results: Result[]) {
  const builder: Record<string, jest.Mock> & { then?: unknown } = {};
  for (const method of ['select', 'eq', 'order', 'limit', 'insert', 'update']) {
    builder[method] = jest.fn(() => builder);
  }
  builder.maybeSingle = jest.fn(() => Promise.resolve(results.shift()));
  builder.single = jest.fn(() => Promise.resolve(results.shift()));
  // Make a bare `update().eq().eq()` chain awaitable (the stale-close path).
  (builder as { then: unknown }).then = (resolve: (v: Result) => unknown) =>
    resolve({ data: null, error: null });

  const from = jest.fn(() => builder);
  const supabase = { client: { from } } as unknown as SupabaseService;
  return { supabase, builder, from };
}

function conversationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conv-1',
    agency_id: 'agency-1',
    phone: '5491122223333',
    messages: [],
    status: 'active',
    lead_id: null,
    message_count: 0,
    last_message_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('ConversationService', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('getOrCreateActive', () => {
    it('returns the active conversation when one exists within the timeout', async () => {
      const active = conversationRow({ id: 'conv-active' });
      const { supabase, builder } = makeClient([{ data: active, error: null }]);
      const service = new ConversationService(supabase);

      const result = await service.getOrCreateActive('agency-1', '549112');

      expect(result).toEqual(active);
      expect(builder.insert).not.toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith('agency_id', 'agency-1');
    });

    it('creates a new conversation when none exists', async () => {
      const created = conversationRow({ id: 'conv-new' });
      const { supabase, builder } = makeClient([
        { data: null, error: null }, // select → nothing active
        { data: created, error: null }, // insert → new row
      ]);
      const service = new ConversationService(supabase);

      const result = await service.getOrCreateActive('agency-1', '549112');

      expect(result).toEqual(created);
      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          agency_id: 'agency-1',
          phone: '549112',
          status: 'active',
          message_count: 0,
        }),
      );
    });

    it('closes the stale conversation and creates a new one when expired', async () => {
      const stale = conversationRow({
        id: 'conv-stale',
        last_message_at: new Date(
          Date.now() - 9 * 60 * 60 * 1000,
        ).toISOString(),
      });
      const created = conversationRow({ id: 'conv-new' });
      const { supabase, builder } = makeClient([
        { data: stale, error: null }, // select → stale active
        { data: created, error: null }, // insert → new row
      ]);
      const service = new ConversationService(supabase);

      const result = await service.getOrCreateActive('agency-1', '549112');

      expect(result).toEqual(created);
      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'closed' }),
      );
      expect(builder.insert).toHaveBeenCalled();
    });

    it('throws when the load query errors', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { supabase } = makeClient([
        { data: null, error: { message: 'db down' } },
      ]);
      const service = new ConversationService(supabase);

      await expect(
        service.getOrCreateActive('agency-1', '549112'),
      ).rejects.toThrow('Failed to load conversation');
    });
  });

  describe('appendMessages', () => {
    it('merges new messages, bumps the count and filters by agency_id', async () => {
      const existingMsg: StoredMessage = {
        role: 'user',
        content: 'Hola',
        timestamp: '2026-07-07T00:00:00.000Z',
      };
      const conversation = conversationRow({
        id: 'conv-1',
        agency_id: 'agency-1',
        messages: [existingMsg],
        message_count: 1,
      });
      const updated = conversationRow({ id: 'conv-1', message_count: 2 });
      const { supabase, builder } = makeClient([
        { data: updated, error: null },
      ]);
      const service = new ConversationService(supabase);

      const newMsg: StoredMessage = {
        role: 'assistant',
        content: 'Buenas',
        timestamp: '2026-07-07T00:00:01.000Z',
      };
      const result = await service.appendMessages(conversation as never, [
        newMsg,
      ]);

      expect(result).toEqual(updated);
      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [existingMsg, newMsg],
          message_count: 2,
        }),
      );
      expect(builder.eq).toHaveBeenCalledWith('id', 'conv-1');
      expect(builder.eq).toHaveBeenCalledWith('agency_id', 'agency-1');
    });
  });

  describe('markEscalated', () => {
    it('sets status to escalated, scoped by agency_id', async () => {
      const { supabase, builder } = makeClient([]);
      const service = new ConversationService(supabase);

      await service.markEscalated('conv-1', 'agency-1');

      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'escalated' }),
      );
      expect(builder.eq).toHaveBeenCalledWith('id', 'conv-1');
      expect(builder.eq).toHaveBeenCalledWith('agency_id', 'agency-1');
    });
  });
});
