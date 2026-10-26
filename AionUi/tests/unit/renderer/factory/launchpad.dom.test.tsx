import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import FactoryLaunchpad from '@/renderer/pages/guid/components/FactoryLaunchpad';
import locale from '@/renderer/services/i18n/locales/en-US/guid.json';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key
        .split('.')
        .slice(1)
        .reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], locale),
  }),
}));

afterEach(cleanup);

describe('factory production briefs', () => {
  it('selects each matching brief without sending a conversation', () => {
    const onSelect = vi.fn();
    render(<FactoryLaunchpad disabled={false} onSelect={onSelect} />);
    for (const stage of ['requirements', 'content', 'research', 'review'] as const) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(locale.factory[stage].title) }));
      expect(onSelect).toHaveBeenLastCalledWith(locale.factory[stage].prompt);
    }
    expect(onSelect).toHaveBeenCalledTimes(4);
  });

  it('does not change the draft while a request is loading', () => {
    const onSelect = vi.fn();
    render(<FactoryLaunchpad disabled onSelect={onSelect} />);
    for (const button of screen.getAllByRole('button')) fireEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('switches between briefs and repeated selections without accumulating prompts', () => {
    function DraftHarness() {
      const [draft, setDraft] = useState('Original customer notes');
      return (
        <>
          <FactoryLaunchpad disabled={false} selectedPrompt={draft} onSelect={setDraft} />
          <output>{draft}</output>
        </>
      );
    }
    render(<DraftHarness />);
    for (const stage of ['requirements', 'content', 'content', 'research', 'review', 'requirements'] as const) {
      const button = screen.getByRole('button', { name: new RegExp(locale.factory[stage].title) });
      fireEvent.click(button);
      expect(screen.getByRole('status').textContent).toBe(locale.factory[stage].prompt);
      expect(button).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
    }
  });
});
