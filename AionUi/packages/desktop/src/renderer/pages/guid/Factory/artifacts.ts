import type { Project } from './types';
export function prototypeHtml(content: string): string | null {
  return content.match(/```html\s*\n([\s\S]*?)```/i)?.[1] || null;
}
export function isolatedPreview(html: string): string {
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">${html}`;
}
export function download(name: string, content: string, type = 'text/markdown;charset=utf-8'): void {
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
