import React, { useState } from 'react';
import { Alert, Button, Checkbox, Empty, Input, Message, Modal, Progress, Spin, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useSWR from 'swr';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import * as api from './client';
import type { Action, ProjectInput, Workflow } from './types';
import ProjectForm from './ProjectForm';
import ArtifactPanel from './ArtifactPanel';
import { download, projectMarkdown, projectWorkflow } from './artifacts';
import styles from './Factory.module.css';
import { ReaEnvironment, ReaTransfer } from './ReaPanel';
import ReaWorkflow from './ReaWorkflow';
import alliedServiceDepotModel from '@renderer/assets/logos/brand/allied-service-depot-model.png';
import sovietWarFactoryModel from '@renderer/assets/logos/brand/app.png';

const stageKeys = ['requirements', 'content', 'research', 'review'] as const;
export function ReaFactory(): React.JSX.Element {
  return <Factory workflow='rea' />;
}

export default function Factory({ workflow = 'production' }: { workflow?: Workflow }): React.JSX.Element {
  const isRea = workflow === 'rea';
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
    data: loadedProject,
    error: detailError,
    mutate: refresh,
  } = useSWR(owner && selected ? ['factory-project', owner, selected] : null, () => api.getProject(selected), {
    refreshInterval: 1500,
  });
  const project = loadedProject && projectWorkflow(loadedProject) === workflow ? loadedProject : undefined;
  const {
    data: reaStatus,
    error: reaError,
    mutate: checkRea,
  } = useSWR(owner && isRea ? ['factory-rea-status', owner] : null, api.reaStatus);
  const reaBackendOutdated = reaError instanceof Error && reaError.message === 'FACTORY_HTTP_404';
  const visibleProjects = projects?.filter((item) => projectWorkflow(item) === workflow);
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
  const titles = isRea
    ? (['evidence', 'flow', 'architecture', 'reconstruction'] as const).map((key) => t(`guid.rea.stages.${key}`))
    : stageKeys.map((key) => t(`guid.factory.${key}.title`));
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
      content: automatic
        ? isRea
          ? t('guid.rea.autoHint')
          : t('guid.production.autoHint')
        : isRea && stage === 0
          ? t('guid.rea.inspectHint')
          : t('guid.production.runHint'),
      onOk: () => onAction({ action: 'run', stage, automatic }),
    });
  };
  const completed = project?.stages.filter((s) => s.status === 'approved').length || 0;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.buildingHeading}>
          <h1 className={styles.buildingTitle}>
            <img
              className={styles.buildingTitleIcon}
              src={isRea ? alliedServiceDepotModel : sovietWarFactoryModel}
              width={80}
              height={80}
              alt=''
              aria-hidden='true'
              draggable={false}
            />
            <span className={styles.buildingTitleText}>{t(isRea ? 'guid.rea.title' : 'guid.production.title')}</span>
          </h1>
          <p className={styles.muted}>{isRea ? t('guid.rea.subtitle') : t('guid.production.subtitle')}</p>
        </div>
        <div className={styles.row}>
          <Button onClick={() => navigate('/settings/model')}>{t('guid.production.configure')}</Button>
          <Button type='primary' disabled={isRea && reaBackendOutdated} onClick={() => setForm('create')}>
            {isRea ? t('guid.rea.create') : t('guid.production.create')}
          </Button>
        </div>
      </header>
      {isRea && (
        <ReaEnvironment
          status={reaStatus}
          error={reaError}
          onRetry={() => {
            void checkRea();
          }}
        />
      )}
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
          {visibleProjects
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
          {visibleProjects?.length === 0 && (
            <Empty description={isRea ? t('guid.rea.noProjects') : t('guid.production.noProjects')} />
          )}
        </aside>
        <section className={styles.panel}>
          {!selected ? (
            <Empty description={t('guid.production.chooseProject')} />
          ) : loadedProject && !project ? (
            <Empty description={t('guid.rea.wrongWorkflow')} />
          ) : !project ? (
            <Spin />
          ) : (
            <>
              <div className={styles.header}>
                <div>
                  <h2>{project.name}</h2>
                  {!isRea && (
                    <span className={styles.muted}>{t('guid.production.progress', { count: completed })}</span>
                  )}
                  {isRea && (
                    <p className={styles.muted}>
                      {t('guid.rea.targetPath')} · <code>{project.target_path}</code>
                    </p>
                  )}
                </div>
                <div className={styles.row}>
                  {isRea && (
                    <ReaTransfer
                      project={project}
                      titles={titles}
                      onCreated={async (created) => {
                        await reload();
                        void navigate(`/factory?project=${encodeURIComponent(created.id)}`);
                      }}
                    />
                  )}
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
              {!isRea && <Progress percent={completed * 25} />}
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
                      <span>
                        {isRea && ['review', 'approved'].includes(s.status)
                          ? t(i < 2 ? 'guid.rea.toolResultReady' : 'guid.rea.interpretationReady')
                          : t(`guid.production.status.${s.status}`)}
                      </span>
                    </span>
                  </Button>
                ))}
              </div>
              {isRea ? (
                <ReaWorkflow
                  key={`${project.id}-${project.stages[0].versions.at(-1)?.id || 'empty'}`}
                  project={project}
                  stage={stage}
                  titles={titles}
                  busy={busy}
                  status={reaError ? undefined : reaStatus}
                  onAction={onAction}
                  onStage={setStage}
                  activeConversation={activeConversation}
                  waitingConfirmation={pendingConfirmations.length > 0}
                  onOpenConversation={(id) => {
                    void navigate(`/conversation/${id}`);
                  }}
                />
              ) : (
                <>
                  <div className={styles.row}>
                    <Button type='primary' disabled={locked || !project.assistant_id} onClick={() => start(false)}>
                      {isRea && stage === 0 ? t('guid.rea.inspect') : t('guid.production.runStage')}
                    </Button>
                    <Button
                      disabled={locked || !project.assistant_id || (isRea && stage === 0 && !reaStatus?.available)}
                      onClick={() => start(true)}
                    >
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
                  {!project.assistant_id && (!isRea || stage > 0) && (
                    <Alert type='warning' content={t('guid.production.noAssistant')} />
                  )}
                  {project.run_id && (
                    <Alert
                      type={pendingConfirmations.length > 0 ? 'warning' : 'info'}
                      content={
                        pendingConfirmations.length > 0
                          ? t('guid.production.waitingConfirmation')
                          : isRea && stage === 0
                            ? t('guid.rea.inspectRunning')
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
                </>
              )}
              <ArtifactPanel
                key={`${project.id}-${stage}-${current?.versions.at(-1)?.id || 'empty'}`}
                project={project}
                stage={stage}
                busy={busy}
                onAction={onAction}
              />
              {!isRea && (
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
                          checks: [
                            ...project.checks,
                            { id: crypto.randomUUID(), text: checkText.trim(), passed: false },
                          ],
                        })
                          .then(() => setCheckText(''))
                          .catch(() => {});
                    }}
                  />
                </section>
              )}
            </>
          )}
        </section>
      </div>
      <Modal
        title={form === 'edit' ? t('guid.production.edit') : isRea ? t('guid.rea.create') : t('guid.production.create')}
        visible={Boolean(form)}
        footer={null}
        onCancel={() => setForm(null)}
        unmountOnExit
      >
        {form && (
          <ProjectForm
            workflow={workflow}
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
