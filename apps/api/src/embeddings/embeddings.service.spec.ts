import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { EmbeddingsService } from './embeddings.service';

jest.mock('openai');

const MockedOpenAI = OpenAI as unknown as jest.Mock;
const mockCreate = jest.fn();

function createConfig(model?: string): ConfigService {
  return {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'OPENAI_API_KEY') return 'test-openai-key';
      throw new Error(`Unexpected required config key: ${key}`);
    }),
    get: jest.fn((key: string) =>
      key === 'OPENAI_EMBEDDING_MODEL' ? model : undefined,
    ),
  } as unknown as ConfigService;
}

describe('EmbeddingsService', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    MockedOpenAI.mockReset();
    MockedOpenAI.mockImplementation(() => ({
      embeddings: { create: mockCreate },
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the embedding vector and uses the default model', async () => {
    mockCreate.mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3] }] });

    const service = new EmbeddingsService(createConfig());
    const vector = await service.generateEmbedding('quiet home with garden');

    expect(vector).toEqual([0.1, 0.2, 0.3]);
    expect(mockCreate).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: 'quiet home with garden',
    });
  });

  it('honors OPENAI_EMBEDDING_MODEL when set', async () => {
    mockCreate.mockResolvedValue({ data: [{ embedding: [0.5] }] });

    const service = new EmbeddingsService(
      createConfig('text-embedding-3-large'),
    );
    await service.generateEmbedding('x');

    expect(mockCreate).toHaveBeenCalledWith({
      model: 'text-embedding-3-large',
      input: 'x',
    });
  });

  it('throws if OPENAI_API_KEY is missing (fail fast on boot)', () => {
    const configService = {
      getOrThrow: jest.fn(() => {
        throw new Error('OPENAI_API_KEY is missing');
      }),
      get: jest.fn(),
    } as unknown as ConfigService;

    expect(() => new EmbeddingsService(configService)).toThrow(
      'OPENAI_API_KEY is missing',
    );
  });

  it('rethrows and does not log the input text on API failure', async () => {
    mockCreate.mockRejectedValue(new Error('rate limited'));
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const service = new EmbeddingsService(createConfig());
    await expect(
      service.generateEmbedding('a very private client query'),
    ).rejects.toThrow('rate limited');

    for (const call of errorSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('a very private client query');
    }
  });

  it('throws when OpenAI returns no embedding', async () => {
    mockCreate.mockResolvedValue({ data: [] });
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const service = new EmbeddingsService(createConfig());
    await expect(service.generateEmbedding('x')).rejects.toThrow(
      'OpenAI returned an empty embedding',
    );
  });
});
