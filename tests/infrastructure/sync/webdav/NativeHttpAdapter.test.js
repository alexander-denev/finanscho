import { describe, expect, it, vi } from 'vitest';
import { NativeHttpAdapter } from '../../../../src/infrastructure/sync/webdav/NativeHttpAdapter.js';

describe('NativeHttpAdapter', () => {
  it('sends any method through native HTTP on iOS', async () => {
    const http = { request: vi.fn(async () => ({ status: 207, data: '<ok/>' })) };
    const adapter = new NativeHttpAdapter({ platform: 'ios', http });
    for (const method of ['PROPFIND', 'MKCOL', 'GET', 'PUT']) {
      expect(adapter.supports(method)).toBe(true);
    }
    expect(await adapter.request('PROPFIND', 'https://h/', { Depth: '1' })).toEqual({
      status: 207,
      body: '<ok/>',
    });
    expect(http.request).toHaveBeenCalledWith({
      method: 'PROPFIND',
      url: 'https://h/',
      headers: { Depth: '1' },
      data: undefined,
      responseType: 'text',
    });
  });

  it('rejects WebDAV methods Android cannot send instead of degrading silently', async () => {
    const http = { request: vi.fn() };
    const adapter = new NativeHttpAdapter({ platform: 'android', http });
    expect(adapter.supports('GET')).toBe(true);
    expect(adapter.supports('PUT')).toBe(true);
    expect(adapter.supports('PROPFIND')).toBe(false);
    expect(adapter.supports('MKCOL')).toBe(false);
    await expect(adapter.request('MKCOL', 'https://h/x/', {})).rejects.toMatchObject({
      reason: 'unsupportedMethod',
    });
    expect(http.request).not.toHaveBeenCalled();
  });

  it('normalizes non-string bodies and maps failures', async () => {
    const adapter = new NativeHttpAdapter({
      platform: 'ios',
      http: { request: async () => ({ status: 200, data: { a: 1 } }) },
    });
    expect((await adapter.request('GET', 'https://h', {})).body).toBe('{"a":1}');
    const failing = new NativeHttpAdapter({
      platform: 'ios',
      http: {
        request: async () => {
          throw new Error('no route');
        },
      },
    });
    await expect(failing.request('GET', 'https://h', {})).rejects.toMatchObject({
      reason: 'network',
    });
  });
});
