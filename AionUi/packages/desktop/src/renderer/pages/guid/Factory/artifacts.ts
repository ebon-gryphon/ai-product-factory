import type { Project, ProjectInput, Workflow } from './types';
export function prototypeHtml(content: string): string | null {
  return content.match(/```html\s*\n([\s\S]*?)```/i)?.[1] || null;
}
export function isolatedPreview(html: string): string {
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">${html}`;
}
export function download(name: string, content: string | Blob, type = 'text/markdown;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name.replace(/[/\\:*?"<>|]/g, '_');
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function projectMarkdown(project: Project, titles: string[]): string {
  return [
    `# ${project.name}`,
    project.brief,
    ...project.stages.map(
      (stage, index) => `## ${titles[index]} (${stage.status})\n\n${stage.versions.at(-1)?.content || '—'}`
    ),
    ...project.checks.map((c) => `- [${c.passed ? 'x' : ' '}] ${c.text}`),
  ].join('\n\n');
}

/** Old archives predate workflow tagging and remain production projects. */
export function projectWorkflow(project: Pick<Project, 'workflow'>): Workflow {
  return project.workflow || 'production';
}

/** Transfer only saved, current evidence; drafts and stale artifacts stay in the source project. */
export function reconstructionInput(
  project: Project,
  selectedStages: number[],
  name: string,
  titles: string[],
  labels: { source: string; target: string; scope: string; version: string }
): ProjectInput {
  if (projectWorkflow(project) !== 'rea') throw new Error('FACTORY_REA_SOURCE_REQUIRED');
  const eligible = selectedStages.filter((index, order, values) => {
    const stage = project.stages[index];
    return (
      values.indexOf(index) === order && stage?.versions.length > 0 && ['review', 'approved'].includes(stage.status)
    );
  });
  if (new TextEncoder().encode(name.trim()).length > 200) throw new Error('FACTORY_INVALID_INPUT');
  eligible.sort((a, b) => a - b);
  if (!name.trim() || !eligible.length || eligible.length !== selectedStages.length) {
    throw new Error('FACTORY_REA_SELECTION_REQUIRED');
  }
  const brief = [
    `${labels.source}: ${project.name} (${project.id})`,
    `${labels.target}: ${project.target_path || ''}`,
    `${labels.scope}: ${project.brief}`,
    ...eligible.map((index) => {
      const version = project.stages[index].versions.at(-1)!;
      return `## ${titles[index]}\n${labels.version}: ${project.id}/${index}/${version.id}\n\n${version.content}`;
    }),
  ].join('\n\n');
  if (new TextEncoder().encode(brief).length > 40_000) throw new Error('FACTORY_REA_TRANSFER_TOO_LARGE');
  return {
    workflow: 'production',
    target_path: '',
    name: name.trim(),
    brief,
    assistant_id: project.assistant_id,
    workspace: '',
    model: project.model,
  };
}
