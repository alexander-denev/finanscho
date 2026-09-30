import { describe, expect, it, vi } from 'vitest';
import { FetchHttpAdapter } from '../../../../src/infrastructure/sync/webdav/FetchHttpAdapter.js';

describe('FetchHttpAdapter', () => {
  it('passes the request to fetch and returns status and text', async () => {
    const fetch = vi.fn(async () => new Response('hello', { status: 207 }));
    const adapter = new FetchHttpAdapter({ fetch, isOnline: () => true });
    const response = await adapter.request('PROPFIND', 'https://h/x/', { Depth: '1' }, '<x/>');
    expect(response).toEqual({ status: 207, body: 'hello' });
    expect(fetch).toHaveBeenCalledWith(
      'https://h/x/',
      expect.objectContaining({ method: 'PROPFIND', body: '<x/>', credentials: 'omit' }),
    );
  });

  it('reports offline without calling fetch', async () => {
    const fetch = vi.fn();
    const adapter = new FetchHttpAdapter({ fetch, isOnline: () => false });
    await expect(adapter.request('GET', 'https://h', {})).rejects.toMatchObject({
      reason: 'offline',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('maps fetch failures (including CORS rejections) to network errors', async () => {
    const adapter = new FetchHttpAdapter({
      fetch: async () => {
        throw new TypeError('Failed to fetch');
      },
      isOnline: () => true,
    });
    await expect(adapter.request('GET', 'https://h', {})).rejects.toMatchObject({
      reason: 'network',
    });
  });
});
