import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadHistory, saveRecord } from '@/renderer/pages/ModelBench/client';
import type { BenchRecord } from '@/renderer/pages/ModelBench/types';
import ModelBench from '@/renderer/pages/ModelBench';

vi.mock('@/common/adapter/httpBridge', () => ({
  getBaseUrl: () => 'http://localhost',
  resolveCoreCsrfToken: () => 'csrf',
}));
vi.mock('@/common/adapter/sessionRefresh', () => ({ refreshSession: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/renderer/components/Markdown', () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

const record: BenchRecord = {
  id: 'comparison',
  created: 1,
  prompt: 'Compare these answers',
  results: [
    {
      target: { provider_id: 'provider', provider_name: 'Provider', model: 'Model' },
      text: 'Saved answer',
      status: 'done',
      elapsed: 100,
    },
  ],
};

function historyResponse(records: unknown): Response {
  return Response.json({ data: { 'modelBench.history': records } });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('saved model comparisons', () => {
  it('ignores incomplete results instead of restoring a record that crashes the comparison page', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          historyResponse([
            { ...record, id: 'null-result', results: [null] },
            { ...record, id: 'missing-target', results: [{ text: 'answer', status: 'done', elapsed: 1 }] },
            { ...record, id: 'invalid-text', results: [{ ...record.results[0], text: {} }] },
            record,
          ])
        )
    );
    expect(await loadHistory()).toEqual([record]);
  });

  it('rejects invalid metadata and result states while retaining valid records', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          historyResponse([
            null,
            { ...record, created: 'yesterday' },
            { ...record, results: [] },
            { ...record, results: [{ ...record.results[0], status: 'unknown' }] },
            { ...record, results: [{ ...record.results[0], elapsed: -1 }] },
            record,
          ])
        )
    );
    expect(await loadHistory()).toEqual([record]);
  });

  it('still saves a new comparison when older settings contain a malformed record', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(historyResponse([null, record]))
      .mockResolvedValueOnce(Response.json({ data: {} }));
    vi.stubGlobal('fetch', fetchMock);
    const updated = { ...record, prompt: 'Updated prompt' };
    expect(await saveRecord(updated)).toEqual([updated]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({ 'modelBench.history': [updated] });
  });

  it('limits valid history records after discarding damaged entries', async () => {
    const valid = Array.from({ length: 7 }, (_, index) => ({ ...record, id: `comparison-${index}` }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(historyResponse([null, ...valid])));
    expect(await loadHistory()).toEqual(valid.slice(0, 5));
  });

  it('opens a valid saved answer even when the history also contains damaged results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          url.endsWith('/api/model-bench/models')
            ? Response.json({ data: [] })
            : historyResponse([{ ...record, id: 'damaged', prompt: 'Damaged comparison', results: [null] }, record])
        )
      )
    );
    render(
      <MemoryRouter>
        <ModelBench />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText('common.modelBench.history'));
    fireEvent.click(await screen.findByText(/Compare these answers/));
    expect(await screen.findByText('Saved answer')).toBeInTheDocument();
    expect(screen.queryByText(/Damaged comparison/)).toBeNull();
  });
});
