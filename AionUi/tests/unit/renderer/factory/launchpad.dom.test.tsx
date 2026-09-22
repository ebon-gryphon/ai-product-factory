import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import FactoryLaunchpad from '@/renderer/pages/guid/components/FactoryLaunchpad';
import { appendPromptToDraft } from '@/renderer/hooks/chat/useSendBoxDraft';
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

  it('preserves existing user materials when appending a brief', () => {
    function DraftHarness() {
      const [draft, setDraft] = useState('Original customer notes');
      return (
        <>
          <FactoryLaunchpad
            disabled={false}
            onSelect={(prompt) => setDraft((value) => appendPromptToDraft(value, prompt))}
          />
          <output>{draft}</output>
        </>
      );
    }
    render(<DraftHarness />);
    fireEvent.click(screen.getByRole('button', { name: /Define product/ }));
    expect(screen.getByRole('status')).toHaveTextContent('Original customer notes');
    expect(screen.getByRole('status').textContent).toBe(
      `Original customer notes\n${locale.factory.requirements.prompt}`
    );
  });
});
