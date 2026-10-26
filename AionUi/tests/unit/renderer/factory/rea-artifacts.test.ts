import { describe, expect, it } from 'vitest';
import { projectWorkflow, reconstructionInput } from '@/renderer/pages/guid/Factory/artifacts';
import type { Project } from '@/renderer/pages/guid/Factory/types';

const titles = ['Evidence', 'Flow', 'Architecture', 'Reconstruction'];
const labels = {
  source: 'Source project',
  target: 'Target',
  scope: 'Scope',
  version: 'Source version',
};
function project(): Project {
  return {
    id: 'rea-project',
    name: 'Reference application',
    brief: 'Trace the search feature.',
    workflow: 'rea',
    target_path: '/apps/reference/app.asar',
    assistant_id: 'assistant',
    model: null,
    workspace: '/source-workspace',
    stages: Array.from({ length: 4 }, (_, index) => ({
      status: 'review',
      error: null,
      conversation_id: null,
      versions: [
        {
          id: `version-${index}`,
          content: `Saved artifact ${index}`,
          source: 'ai',
          created_at: 1,
          conversation_id: null,
          based_on: [],
        },
      ],
    })),
    checks: [],
    archived: false,
    revision: 1,
    created_at: 1,
    updated_at: 1,
    run_id: null,
  };
}

describe('REA production transfer', () => {
  it('creates a production brief from only the selected saved versions with source references', () => {
    const source = project();
    const result = reconstructionInput(source, [0, 3], ' Build search ', titles, labels);
    expect(result).toMatchObject({
      workflow: 'production',
      target_path: '',
      workspace: '',
      name: 'Build search',
    });
    expect(result.brief).toContain('rea-project/3/version-3');
    expect(result.brief).not.toContain('Saved artifact 1');
  });

  it('refuses stale evidence rather than transferring invalidated findings', () => {
    const source = project();
    source.stages[1].status = 'stale';
    expect(() => reconstructionInput(source, [1], 'Build', titles, labels)).toThrow('FACTORY_REA_SELECTION_REQUIRED');
  });

  it('refuses oversized briefs without silently truncating source evidence', () => {
    const source = project();
    source.stages[0].versions[0].content = '中'.repeat(14_000);
    expect(() => reconstructionInput(source, [0], 'Build', titles, labels)).toThrow('FACTORY_REA_TRANSFER_TOO_LARGE');
  });

  it('keeps old projects in the production workflow and refuses them as REA transfer sources', () => {
    const source = project();
    delete source.workflow;
    expect(projectWorkflow(source)).toBe('production');
    expect(() => reconstructionInput(source, [0], 'Build', titles, labels)).toThrow('FACTORY_REA_SOURCE_REQUIRED');
  });
});
