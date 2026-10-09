import { getBaseUrl, resolveCoreCsrfToken } from '@/common/adapter/httpBridge';
import { refreshSession } from '@/common/adapter/sessionRefresh';
import type { Action, Project, ProjectInput, Assistant, ModelOption } from './types';

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const csrf =
    resolveCoreCsrfToken() ||
    document.cookie
      .split('; ')
      .find((c) => c.startsWith('aionui-csrf-token='))
      ?.split('=')
      .slice(1)
      .join('=');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (csrf) headers['x-csrf-token'] = csrf;
  const init = {
    method,
    headers,
    credentials: 'same-origin' as const,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
  let response = await fetch(`${getBaseUrl()}${path}`, init);
  if (response.status === 401) {
    await refreshSession();
    response = await fetch(`${getBaseUrl()}${path}`, init);
  }
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText.match(/FACTORY_[A-Z_]+/)?.[0] || `FACTORY_HTTP_${response.status}`);
  }
  return ((await response.json()) as { data: T }).data;
}
export const listProjects = (): Promise<Project[]> => request('/api/factory/projects');
export const getProject = (id: string): Promise<Project> => request(`/api/factory/projects/${encodeURIComponent(id)}`);
export const createProject = (input: ProjectInput): Promise<Project> => request('/api/factory/projects', 'POST', input);
export const act = (project: Project, action: Action): Promise<Project> =>
  request(`/api/factory/projects/${encodeURIComponent(project.id)}/actions`, 'POST', {
    revision: project.revision,
    ...action,
  });
export const assistants = (): Promise<Assistant[]> => request('/api/assistants');
export const models = (): Promise<ModelOption[]> => request('/api/model-bench/models');

export const confirmations = (id: string): Promise<{ id: string }[]> =>
  request(`/api/conversations/${encodeURIComponent(id)}/confirmations`);
