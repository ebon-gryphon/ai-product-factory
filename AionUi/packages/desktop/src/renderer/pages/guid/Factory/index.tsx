import React, { useState } from 'react';
import { Alert, Button, Checkbox, Empty, Input, Message, Modal, Progress, Spin, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useSWR from 'swr';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import * as api from './client';
import type { Action, ProjectInput } from './types';
import ProjectForm from './ProjectForm';
import ArtifactPanel from './ArtifactPanel';
import { download, projectMarkdown } from './artifacts';
import styles from './Factory.module.css';

const stageKeys = ['requirements', 'content', 'research', 'review'] as const;
export default function Factory(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, status } = useAuth();
  const owner = status === 'authenticated' ? user?.id || 'desktop-local' : null;
  const [params, setParams] = useSearchParams();
  const selected = params.get('project') || '';
  const {
    data: projects,
    error: listError,
    mutate: reload,
  } = useSWR(owner ? ['factory-projects', owner] : null, api.listProjects, { refreshInterval: 5000 });
  const {
    data: project,
    error: detailError,
    mutate: refresh,
  } = useSWR(owner && selected ? ['factory-project', owner, selected] : null, () => api.getProject(selected), {
    refreshInterval: 1500,
  });
  const activeConversation = project?.run_id
    ? project.stages.find((item) => item.status === 'running')?.conversation_id
    : null;
  const { data: pendingConfirmations = [] } = useSWR(
    owner && activeConversation ? ['factory-confirmations', owner, activeConversation] : null,
    () => api.confirmations(activeConversation!),
    { refreshInterval: 1500 }
  );
  const { data: assistants = [], error: assistantError } = useSWR(
    owner ? ['factory-assistants', owner] : null,
    api.assistants
  );
  const { data: models = [], error: modelError } = useSWR(owner ? ['factory-models', owner] : null, api.models);
  const [stage, setStage] = useState(0);
  const [form, setForm] = useState<'create' | 'edit' | null>(null);
  const [busy, setBusy] = useState(false);
  const [archived, setArchived] = useState(false);
  const [checkText, setCheckText] = useState('');
  const titles = stageKeys.map((key) => t(`guid.factory.${key}.title`));
  const report = (error: unknown): void => {
    const code = error instanceof Error ? error.message : 'FACTORY_STORAGE';
    Message.error(
      t(`guid.production.errors.${code}` as 'guid.production.errors.FACTORY_STORAGE', {
        defaultValue: t('guid.production.requestError'),
      })
    );
  };
  const onAction = async (action: Action): Promise<void> => {
    if (!project || busy) return;
    setBusy(true);
    try {
      const updated = await api.act(project, action);
      await refresh(updated, false);
      await reload();
    } catch (error) {
      report(error);
      await refresh();
      throw error;
    } finally {
      setBusy(false);
    }
  };
  const perform = (action: Action): void => {
    void onAction(action).catch(() => {});
  };
  const saveProject = async (input: ProjectInput): Promise<void> => {
    setBusy(true);
    try {
      const saved =
        form === 'edit' && project
          ? await api.act(project, { action: 'update', ...input })
          : await api.createProject(input);
      setParams({ project: saved.id });
      setStage(0);
      setForm(null);
      await reload();
      await refresh();
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };
  const current = project?.stages[stage];
  const locked = busy || Boolean(project?.run_id) || Boolean(project?.archived);
  const start = (automatic: boolean): void => {
    Modal.confirm({
      title: t('guid.production.startConfirm'),
      content: automatic ? t('guid.production.autoHint') : t('guid.production.runHint'),
      onOk: () => onAction({ action: 'run', stage, automatic }),
    });
  };
  const completed = project?.stages.filter((s) => s.status === 'approved').length || 0;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>{t('guid.production.title')}</h1>
          <p className={styles.muted}>{t('guid.production.subtitle')}</p>
        </div>
        <div className={styles.row}>
          <Button onClick={() => navigate('/settings/model')}>{t('guid.production.configure')}</Button>
          <Button type='primary' onClick={() => setForm('create')}>
            {t('guid.production.create')}
          </Button>
        </div>
      </header>
      {(listError || detailError) && (
        <Alert
          type='error'
          content={t('guid.production.requestError')}
          action={
            <Button
              onClick={() => {
                void reload();
                void refresh();
              }}
            >
              {t('guid.production.retry')}
            </Button>
          }
        />
      )}
      {(assistantError || modelError) && <Alert type='warning' content={t('guid.production.catalogError')} />}
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <Checkbox checked={archived} onChange={setArchived}>
            {t('guid.production.showArchived')}
          </Checkbox>
          {!projects && !listError && <Spin />}
          {projects
            ?.filter((p) => archived || !p.archived)
            .map((p) => (
              <Button
                key={p.id}
                className={styles.projectButton}
                type={selected === p.id ? 'secondary' : 'text'}
                onClick={() => {
                  setParams({ project: p.id });
                  setStage(0);
                }}
              >
                {p.name}
                {p.run_id ? ` · ${t('guid.production.status.running')}` : ''}
                {p.archived ? ` · ${t('guid.production.archived')}` : ''}
              </Button>
            ))}
          {projects?.length === 0 && <Empty description={t('guid.production.noProjects')} />}
        </aside>
        <section className={styles.panel}>
          {!selected ? (
            <Empty description={t('guid.production.chooseProject')} />
          ) : !project ? (
            <Spin />
          ) : (
            <>
              <div className={styles.header}>
                <div>
                  <h2>{project.name}</h2>
                  <span className={styles.muted}>{t('guid.production.progress', { count: completed })}</span>
                </div>
                <div className={styles.row}>
                  <Button disabled={locked} onClick={() => setForm('edit')}>
                    {t('guid.production.edit')}
                  </Button>
                  <Button onClick={() => download(`${project.name}.md`, projectMarkdown(project, titles))}>
                    {t('guid.production.export')}
                  </Button>
                  <Button
                    onClick={() =>
                      download(
                        `${project.name}.json`,
                        JSON.stringify({ format: 'ai-product-factory', version: 1, project }, null, 2),
                        'application/json'
                      )
                    }
                  >
                    {t('guid.production.exportHistory')}
                  </Button>
                  <Button
                    disabled={busy || Boolean(project.run_id)}
                    onClick={() => perform({ action: 'archive', archived: !project.archived })}
                  >
                    {project.archived ? t('guid.production.unarchive') : t('guid.production.archive')}
                  </Button>
                </div>
              </div>
              <Progress percent={completed * 25} />
              <div className={styles.stages}>
                {project.stages.map((s, i) => (
                  <Button
                    key={i}
                    className={styles.stageButton}
                    type={stage === i ? 'primary' : 'secondary'}
                    onClick={() => setStage(i)}
                  >
                    <span className={styles.stageContent}>
                      <strong>
                        {i + 1}. {titles[i]}
                      </strong>
                      <span>{t(`guid.production.status.${s.status}`)}</span>
                    </span>
                  </Button>
                ))}
              </div>
              <div className={styles.row}>
                <Button type='primary' disabled={locked || !project.assistant_id} onClick={() => start(false)}>
                  {t('guid.production.runStage')}
                </Button>
                <Button disabled={locked || !project.assistant_id} onClick={() => start(true)}>
                  {t('guid.production.runAll')}
                </Button>
                {project.run_id && (
                  <Button status='warning' disabled={busy} onClick={() => perform({ action: 'pause' })}>
                    {t('guid.production.stop')}
                  </Button>
                )}
                <Button
                  disabled={locked || current?.status !== 'review'}
                  onClick={() => perform({ action: 'approve', stage })}
                >
                  {t('guid.production.approve')}
                </Button>
                {current?.conversation_id && (
                  <Button onClick={() => navigate(`/conversation/${current.conversation_id}`)}>
                    {t('guid.production.openConversation')}
                  </Button>
                )}
                {current && <Tag>{t(`guid.production.status.${current.status}`)}</Tag>}
              </div>
              {!project.assistant_id && <Alert type='warning' content={t('guid.production.noAssistant')} />}
              {project.run_id && (
                <Alert
                  type={pendingConfirmations.length > 0 ? 'warning' : 'info'}
                  content={
                    pendingConfirmations.length > 0
                      ? t('guid.production.waitingConfirmation')
                      : t('guid.production.runningHint')
                  }
                  action={
                    activeConversation ? (
                      <Button onClick={() => navigate(`/conversation/${activeConversation}`)}>
                        {t('guid.production.openActiveConversation')}
                      </Button>
                    ) : undefined
                  }
                />
              )}
              <ArtifactPanel
                key={`${project.id}-${stage}-${current?.versions.at(-1)?.id || 'empty'}`}
                project={project}
                stage={stage}
                busy={busy}
                onAction={onAction}
              />
              <section className={styles.checks}>
                <h3>{t('guid.production.checks')}</h3>
                {project.checks.map((check) => (
                  <div className={styles.row} key={check.id}>
                    <Checkbox
                      disabled={locked}
                      checked={check.passed}
                      onChange={(passed) =>
                        perform({
                          action: 'checks',
                          checks: project.checks.map((c) => (c.id === check.id ? { ...c, passed } : c)),
                        })
                      }
                    >
                      {check.text}
                    </Checkbox>
                    <Button
                      type='text'
                      disabled={locked}
                      onClick={() =>
                        perform({ action: 'checks', checks: project.checks.filter((c) => c.id !== check.id) })
                      }
                    >
                      {t('guid.production.remove')}
                    </Button>
                  </div>
                ))}
                <Input.Search
                  aria-label={t('guid.production.addCheck')}
                  placeholder={t('guid.production.addCheck')}
                  searchButton={t('guid.production.add')}
                  value={checkText}
                  disabled={locked}
                  maxLength={250}
                  onChange={setCheckText}
                  onSearch={() => {
                    if (checkText.trim())
                      void onAction({
                        action: 'checks',
                        checks: [...project.checks, { id: crypto.randomUUID(), text: checkText.trim(), passed: false }],
                      })
                        .then(() => setCheckText(''))
                        .catch(() => {});
                  }}
                />
              </section>
            </>
          )}
        </section>
      </div>
      <Modal
        title={form === 'edit' ? t('guid.production.edit') : t('guid.production.create')}
        visible={Boolean(form)}
        footer={null}
        onCancel={() => setForm(null)}
        unmountOnExit
      >
        {form && (
          <ProjectForm
            initial={form === 'edit' ? project : undefined}
            assistants={assistants}
            models={models}
            busy={busy}
            onSave={saveProject}
          />
        )}
      </Modal>
    </main>
  );
}
