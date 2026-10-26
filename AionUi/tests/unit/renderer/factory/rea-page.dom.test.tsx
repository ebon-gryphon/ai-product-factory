import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Factory from '@/renderer/pages/guid/Factory';
import { ReaEnvironment } from '@/renderer/pages/guid/Factory/ReaPanel';
import type { Project, ReaEvidence } from '@/renderer/pages/guid/Factory/types';
import locale from '@/renderer/services/i18n/locales/en-US/guid.json';

const state = vi.hoisted(() => ({
  selected: 'rea-project',
  projects: [] as Project[],
  detail: undefined as Project | undefined,
  ready: true,
  reaError: null as Error | null,
  navigate: vi.fn(),
  mutate: vi.fn(() => Promise.resolve()),
  create: vi.fn(),
  act: vi.fn(),
  evidence: vi.fn(),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string, params?: Record<string, unknown>) => {
      const value = key
        .split('.')
        .slice(1)
        .reduce<unknown>((current, part) => (current as Record<string, unknown>)?.[part], locale);
      return typeof value === 'string'
        ? value.replace(/{{(\w+)}}/g, (_, name: string) => String(params?.[name] ?? ''))
        : key;
    },
  }),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => state.navigate,
  useSearchParams: () => [new URLSearchParams({ project: state.selected }), vi.fn()],
}));
vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ status: 'authenticated', user: { id: 'user' } }),
}));
vi.mock('swr', () => ({
  default: (key: string[] | null) => ({
    data:
      key?.[0] === 'factory-projects'
        ? state.projects
        : key?.[0] === 'factory-project'
          ? state.detail
          : key?.[0] === 'factory-rea-status'
            ? { available: state.ready, version: '6.7.0', error: state.ready ? null : 'FACTORY_REA_UNAVAILABLE' }
            : [],
    error: key?.[0] === 'factory-rea-status' ? state.reaError : undefined,
    mutate: state.mutate,
  }),
}));
vi.mock('@/renderer/pages/guid/Factory/client', () => ({
  listProjects: vi.fn(),
  getProject: vi.fn(),
  assistants: vi.fn(),
  models: vi.fn(),
  confirmations: vi.fn(),
  reaStatus: vi.fn(),
  createProject: (...args: unknown[]) => state.create(...args),
  act: (...args: unknown[]) => state.act(...args),
  evidence: (...args: unknown[]) => state.evidence(...args),
}));

function evidence(operation = 'analyze_javascript_application'): ReaEvidence {
  return {
    evidence_id: 'ev-overview',
    file_name: 'overview.json',
    sha256: 'a'.repeat(64),
    bytes: 100,
    operation,
    summary: { statistics: { relevant_files: 3, modules: 2, parsed_javascript_files: 2 } },
    limitations: ['Dynamic IPC channels remain unknown'],
    coverage: { application: { status: 'complete' }, semantic: { status: 'partial' } },
    candidates: [{ node_id: 'ipc-notes', kind: 'ipc-channel', label: 'notes:list' }],
    candidate_total: 1,
  };
}
function makeProject(workflow: 'production' | 'rea'): Project {
  return {
    id: `${workflow}-project`,
    name: `${workflow} example`,
    workflow,
    brief: 'Investigate search',
    target_path: '/apps/example',
    assistant_id: '',
    workspace: '',
    model: null,
    revision: 1,
    checks: [],
    archived: false,
    created_at: 1,
    updated_at: 1,
    run_id: null,
    stages: Array.from({ length: 4 }, (_, index) => ({
      status: index === 0 ? 'review' : 'pending',
      error: null,
      conversation_id: null,
      versions:
        index === 0
          ? [
              {
                id: 'evidence-version',
                content: 'Saved REA evidence',
                source: 'rea',
                conversation_id: null,
                created_at: 1,
                based_on: [],
                rea: workflow === 'rea' ? evidence() : null,
              },
            ]
          : [],
    })),
  };
}
function tracedProject(): void {
  state.detail!.stages[1] = {
    status: 'review',
    error: null,
    conversation_id: null,
    versions: [
      {
        ...state.detail!.stages[0].versions[0],
        id: 'trace-version',
        content: 'Trace evidence',
        rea: evidence('trace_application_feature'),
      },
    ],
  };
}
const stageButton = (index: number, title: string) =>
  screen.getByRole('button', { name: new RegExp(`${index + 1}\\. ${title}`) });
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  });
  state.mutate.mockClear();
  state.projects = [makeProject('rea'), makeProject('production')];
  state.detail = state.projects[0];
  state.selected = 'rea-project';
  state.ready = true;
  state.reaError = null;
  state.create.mockReset();
  state.act.mockReset();
  state.evidence.mockReset();
  state.navigate.mockReset();
  state.create.mockResolvedValue({ ...makeProject('production'), id: 'created-production' });
  state.act.mockResolvedValue(state.detail);
  state.evidence.mockResolvedValue(new Blob(['{"evidence_id":"ev-overview"}'], { type: 'application/json' }));
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:original') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('REA investigation workflow', () => {
  it('separates workflows and uses tool actions without a production progress bar or automatic run', () => {
    render(<Factory workflow='rea' />);
    expect(screen.getByRole('button', { name: locale.rea.inspectAgain })).toBeEnabled();
    expect(screen.queryByRole('button', { name: locale.production.runAll })).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
  it('shows actual evidence statistics, limits and the next investigation action', () => {
    render(<Factory workflow='rea' />);
    expect(screen.getByText('ev-overview')).toBeInTheDocument();
    expect(screen.getByText('Dynamic IPC channels remain unknown')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: locale.rea.nextTrace })).toBeEnabled();
  });
  it('disables inspection and offers installation guidance when the tool is missing', () => {
    state.ready = false;
    render(<Factory workflow='rea' />);
    expect(screen.getByRole('button', { name: locale.rea.inspectAgain })).toBeDisabled();
    expect(screen.getByText(locale.rea.installHint)).toBeInTheDocument();
  });
  it('explains a missing backend endpoint and lets the user recheck after restarting', () => {
    const recheck = vi.fn();
    render(<ReaEnvironment error={new Error('FACTORY_HTTP_404')} onRetry={recheck} />);
    expect(screen.getByText(locale.rea.backendOutdated)).toBeInTheDocument();
    expect(screen.queryByText(locale.rea.checkFailed)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: locale.rea.checkEnvironment }));
    expect(recheck).toHaveBeenCalledOnce();
  });
  it('blocks tool execution and project creation when a missing endpoint invalidates cached readiness', () => {
    state.ready = true;
    state.reaError = new Error('FACTORY_HTTP_404');
    render(<Factory workflow='rea' />);
    expect(screen.getByRole('button', { name: locale.rea.inspectAgain })).toBeDisabled();
    expect(screen.getByRole('button', { name: locale.rea.create })).toBeDisabled();
    expect(screen.getByText(locale.rea.backendOutdated)).toBeInTheDocument();
  });
  it('does not expose a production project through a REA project query', () => {
    state.detail = state.projects[1];
    render(<Factory workflow='rea' />);
    expect(screen.getByText(locale.rea.wrongWorkflow)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: locale.production.runStage })).not.toBeInTheDocument();
  });
  it('requires a local target and asks a concrete question before creating an investigation', () => {
    render(<Factory workflow='rea' />);
    fireEvent.click(screen.getByRole('button', { name: locale.rea.create }));
    expect(screen.getByRole('textbox', { name: new RegExp(locale.rea.targetPath) })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(locale.rea.questionExample)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: locale.production.saveProject })).toBeDisabled();
  });
  it('requires an actual overview anchor and sends its exact node ID without an assistant', async () => {
    render(<Factory workflow='rea' />);
    fireEvent.click(stageButton(1, locale.rea.stages.flow));
    expect(screen.getByRole('button', { name: locale.rea.trace })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(locale.rea.featureAnchor));
    fireEvent.click(await screen.findByText('notes:list · ipc-channel'));
    fireEvent.click(screen.getByRole('button', { name: locale.rea.trace }));
    await waitFor(() =>
      expect(state.act).toHaveBeenCalledWith(state.detail, {
        action: 'run',
        stage: 1,
        automatic: false,
        rea_seed: 'ipc-notes',
        rea_direction: 'both',
      })
    );
  });
  it('keeps missing trace evidence distinct from assistant configuration', () => {
    render(<Factory workflow='rea' />);
    fireEvent.click(stageButton(2, locale.rea.stages.architecture));
    expect(screen.getByRole('button', { name: locale.rea.interpret })).toBeDisabled();
    expect(screen.getByText(locale.rea.needTrace)).toBeInTheDocument();
  });
  it('asks for an assistant only after real tool evidence exists', () => {
    tracedProject();
    render(<Factory workflow='rea' />);
    fireEvent.click(stageButton(2, locale.rea.stages.architecture));
    expect(screen.getByText(locale.rea.needAssistant)).toBeInTheDocument();
    expect(screen.getByText(locale.rea.interpretHint)).toBeInTheDocument();
  });
  it('labels partial anchor lists without claiming absence and offers complete original evidence', () => {
    state.detail!.stages[0].versions[0].rea!.candidate_total = 500;
    render(<Factory workflow='rea' />);
    fireEvent.click(stageButton(1, locale.rea.stages.flow));
    expect(screen.getByText(locale.rea.partialCandidates)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: locale.rea.viewCompleteEvidence })).toBeEnabled();
  });
  it('downloads the original evidence by project and version rather than exporting the summary', async () => {
    render(<Factory workflow='rea' />);
    fireEvent.click(screen.getByRole('button', { name: locale.rea.downloadEvidence }));
    await waitFor(() => expect(state.evidence).toHaveBeenCalledWith('rea-project', 'evidence-version'));
    expect(URL.createObjectURL).toHaveBeenCalled();
  });
  it('preserves download failures as visible errors', async () => {
    state.evidence.mockRejectedValueOnce(new Error('FACTORY_REA_EVIDENCE_INTEGRITY'));
    render(<Factory workflow='rea' />);
    fireEvent.click(screen.getByRole('button', { name: locale.rea.downloadEvidence }));
    expect(await screen.findByText(locale.production.errors.FACTORY_REA_EVIDENCE_INTEGRITY)).toBeInTheDocument();
  });
  it('creates a production brief with saved evidence references without running a model', async () => {
    render(<Factory workflow='rea' />);
    fireEvent.click(screen.getByRole('button', { name: locale.rea.toProduction }));
    fireEvent.click(screen.getByRole('button', { name: locale.rea.createProduction }));
    await waitFor(() => expect(state.create).toHaveBeenCalledTimes(1));
    expect(state.create.mock.calls[0][0]).toMatchObject({
      workflow: 'production',
      brief: expect.stringContaining('rea-project/0/evidence-version'),
    });
    expect(state.act).not.toHaveBeenCalled();
  });
  it('ignores cached manual drafts for original overview evidence', () => {
    sessionStorage.setItem('factory.draft.rea-project.0.evidence-version', 'Fabricated evidence');
    render(<Factory workflow='rea' />);
    expect(screen.queryByText('Fabricated evidence')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: locale.production.artifact })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: locale.production.saveVersion })).not.toBeInTheDocument();
  });
  it('keeps original feature trace evidence read-only too', () => {
    tracedProject();
    render(<Factory workflow='rea' />);
    fireEvent.click(stageButton(1, locale.rea.stages.flow));
    expect(screen.queryByRole('textbox', { name: locale.production.artifact })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: locale.production.saveVersion })).not.toBeInTheDocument();
  });
  it('retains editable production artifacts', () => {
    state.detail = state.projects[1];
    state.selected = 'production-project';
    render(<Factory />);
    const artifact = screen.getByRole('textbox', { name: locale.production.artifact });
    fireEvent.change(artifact, { target: { value: 'Revised requirement' } });
    expect(artifact).not.toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: locale.production.saveVersion })).toBeEnabled();
  });
  it('allows historical evidence viewing and downloads without restoring tool facts', async () => {
    state.detail!.stages[0].versions.unshift({
      ...state.detail!.stages[0].versions[0],
      id: 'previous-evidence',
      content: 'Previous tool evidence',
    });
    render(<Factory workflow='rea' />);
    fireEvent.click(screen.getByLabelText(locale.production.versions));
    fireEvent.click(await screen.findByText(/^v1 · /));
    fireEvent.click(screen.getByText(locale.rea.viewSummary));
    expect(screen.getByText('Previous tool evidence')).toBeVisible();
    expect(screen.queryByRole('button', { name: locale.production.restore })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: locale.rea.downloadEvidence }));
    await waitFor(() => expect(state.evidence).toHaveBeenCalledWith('rea-project', 'previous-evidence'));
  });
  it('reports the actual running operation when a different section is selected', () => {
    state.detail!.run_id = 'run';
    state.detail!.stages[0].status = 'running';
    render(<Factory workflow='rea' />);
    fireEvent.click(stageButton(1, locale.rea.stages.flow));
    expect(screen.getByTestId('rea-running-state')).toHaveTextContent('Application overview is running');
    expect(screen.getByRole('button', { name: locale.rea.trace })).toBeDisabled();
  });
  it('shows stopping until the backend confirms the operation ended', async () => {
    state.detail!.run_id = 'run';
    state.detail!.stages[0].status = 'running';
    let resolve!: (value: Project) => void;
    state.act.mockImplementationOnce(
      () =>
        new Promise<Project>((done) => {
          resolve = done;
        })
    );
    render(<Factory workflow='rea' />);
    fireEvent.click(screen.getByRole('button', { name: locale.production.stop }));
    expect(screen.getByRole('button', { name: locale.rea.stopping })).toBeDisabled();
    expect(screen.getByTestId('rea-running-state')).toHaveTextContent(locale.rea.stoppingHint);
    resolve(state.detail!);
    await waitFor(() => expect(state.mutate).toHaveBeenCalled());
  });
  it('clears the selected anchor when the source evidence identity changes', async () => {
    const view = render(<Factory workflow='rea' />);
    fireEvent.click(stageButton(1, locale.rea.stages.flow));
    fireEvent.click(screen.getByLabelText(locale.rea.featureAnchor));
    fireEvent.click(await screen.findByText('notes:list · ipc-channel'));
    expect(screen.getByRole('button', { name: locale.rea.trace })).toBeEnabled();
    state.detail!.stages[0].versions[0].rea!.evidence_id = 'ev-new-overview';
    view.rerender(<Factory workflow='rea' />);
    expect(screen.getByRole('button', { name: locale.rea.trace })).toBeDisabled();
  });
  it('requires old unstructured results to be recollected before feature tracing', () => {
    state.detail!.stages[0].versions[0].rea = null;
    render(<Factory workflow='rea' />);
    expect(screen.getByText(locale.rea.legacyEvidence)).toBeInTheDocument();
    fireEvent.click(stageButton(1, locale.rea.stages.flow));
    expect(screen.getByRole('button', { name: locale.rea.trace })).toBeDisabled();
    expect(screen.getByText(locale.rea.needOverview)).toBeInTheDocument();
  });
  it('identifies the saved anchor, direction and source for each historical trace after remounting', async () => {
    tracedProject();
    const latest = state.detail!.stages[1].versions[0];
    latest.rea = {
      ...evidence('trace_application_feature'),
      evidence_id: 'ev-trace-current',
      summary: {
        seed: { kind: 'node-id', value: 'current-node' },
        direction: 'outgoing',
        source_evidence_id: 'ev-overview-current',
      },
      candidates: [{ node_id: 'current-node', kind: 'ipc-channel', label: 'notes:current' }],
    };
    state.detail!.stages[1].versions.unshift({
      ...latest,
      id: 'trace-history',
      rea: {
        ...latest.rea,
        evidence_id: 'ev-trace-history',
        summary: {
          seed: { kind: 'node-id', value: 'history-node' },
          direction: 'incoming',
          source_evidence_id: 'ev-overview-history',
        },
        candidates: [],
      },
    });
    const view = render(<Factory workflow='rea' />);
    fireEvent.click(stageButton(1, locale.rea.stages.flow));
    expect(screen.getByLabelText(locale.rea.evidenceDetails)).toHaveTextContent('current-node');
    fireEvent.click(screen.getByLabelText(locale.production.versions));
    fireEvent.click(await screen.findByText(/^v1 · /));
    const history = within(screen.getByLabelText(locale.rea.evidenceDetails));
    expect(history.getByText('history-node').closest('section')).toHaveTextContent(
      `${locale.rea.savedTraceDirection}${locale.rea.directions.incoming}${locale.rea.sourceOverview}ev-overview-history`
    );
    view.unmount();
    render(<Factory workflow='rea' />);
    fireEvent.click(stageButton(1, locale.rea.stages.flow));
    expect(screen.getByLabelText(locale.rea.evidenceDetails)).toHaveTextContent(
      `${locale.rea.savedTraceDirection}${locale.rea.directions.outgoing}${locale.rea.sourceOverview}ev-overview-current`
    );
  });
});
