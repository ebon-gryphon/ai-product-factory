import React, { useEffect, useState } from 'react';
import { Alert, Button, Modal, Select, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { Action, Project, ReaDirection, ReaStatus } from './types';
import styles from './Factory.module.css';

type Props = {
  project: Project;
  stage: number;
  titles: string[];
  busy: boolean;
  status?: ReaStatus;
  onAction: (action: Action) => Promise<void>;
  onStage: (stage: number) => void;
  activeConversation?: string | null;
  waitingConfirmation: boolean;
  onOpenConversation: (id: string) => void;
};
function currentEvidence(project: Project, stage: number): boolean {
  const value = project.stages[stage];
  return (
    value?.versions.at(-1)?.source === 'rea' &&
    !!value.versions.at(-1)?.rea &&
    ['review', 'approved'].includes(value.status)
  );
}

/** Keep tool investigation separate from model interpretation and offer the next supported action. */
export default function ReaWorkflow({
  project,
  stage,
  titles,
  busy,
  status,
  onAction,
  onStage,
  activeConversation,
  waitingConfirmation,
  onOpenConversation,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [stopRequested, setStopRequested] = useState(false);
  useEffect(() => {
    if (!project.run_id) setStopRequested(false);
  }, [project.run_id]);
  const [seed, setSeed] = useState<string>();
  const [direction, setDirection] = useState<ReaDirection>('both');
  const overview = project.stages[0].versions.at(-1)?.rea;
  const candidates = overview?.candidates || [];
  useEffect(() => {
    setSeed(undefined);
  }, [project.id, project.brief, overview?.evidence_id]);
  const current = project.stages[stage];
  const locked = busy || !!project.run_id || project.archived;
  const activeIndex = project.stages.findIndex((item) => item.status === 'running');
  const stopping =
    !!project.run_id && (stopRequested || project.stages.some((item) => item.error === 'FACTORY_STOP_REQUESTED'));
  const stop = async (): Promise<void> => {
    setStopRequested(true);
    try {
      await onAction({ action: 'pause' });
    } catch {
      setStopRequested(false);
    }
  };
  const prerequisites =
    stage === 0 ||
    (stage === 1 ? currentEvidence(project, 0) : currentEvidence(project, 0) && currentEvidence(project, 1));
  const hasAnalysis =
    stage < 3 || (project.stages[2].versions.length > 0 && ['review', 'approved'].includes(project.stages[2].status));
  const reason = project.archived
    ? t('guid.rea.restoreFirst')
    : !prerequisites
      ? t(stage === 1 ? 'guid.rea.needOverview' : 'guid.rea.needTrace')
      : !hasAnalysis
        ? t('guid.rea.needInterpretation')
        : stage < 2 && !status?.available
          ? t('guid.rea.needTool')
          : stage === 1 && !candidates.some((candidate) => candidate.node_id === seed)
            ? t(candidates.length ? 'guid.rea.chooseAnchor' : 'guid.rea.noAnchors')
            : stage >= 2 && !project.assistant_id
              ? t('guid.rea.needAssistant')
              : '';
  const run = (): void => {
    const execute = () =>
      onAction({
        action: 'run',
        stage,
        automatic: false,
        ...(stage === 1 ? { rea_seed: seed, rea_direction: direction } : {}),
      });
    if (stage < 2) {
      void execute().catch(() => {});
      return;
    }
    Modal.confirm({
      title: t(stage === 2 ? 'guid.rea.interpret' : 'guid.rea.reconstruct'),
      content: t('guid.rea.aiConfirm'),
      onOk: execute,
    });
  };
  return (
    <section className={styles.reaWorkflow}>
      <div className={styles.question}>
        <h3>{t('guid.rea.brief')}</h3>
        <p>{project.brief}</p>
        <span className={styles.muted}>{t('guid.rea.questionStatusHint')}</span>
      </div>
      {stage === 1 && (
        <div className={styles.form}>
          <label className={styles.label}>
            {t('guid.rea.featureAnchor')}
            <Select
              aria-label={t('guid.rea.featureAnchor')}
              showSearch
              allowClear
              disabled={locked || !currentEvidence(project, 0)}
              value={seed}
              placeholder={t('guid.rea.anchorPlaceholder')}
              onChange={(value: string | undefined) => setSeed(value)}
              options={candidates.map((candidate) => ({
                value: candidate.node_id,
                label: `${candidate.label} · ${candidate.kind}`,
              }))}
            />
          </label>
          <span className={styles.muted}>
            {t('guid.rea.candidateCount', { shown: candidates.length, total: overview?.candidate_total || 0 })}
          </span>
          {(overview?.candidate_total || 0) > candidates.length && (
            <Alert
              type='warning'
              content={t('guid.rea.partialCandidates')}
              action={<Button onClick={() => onStage(0)}>{t('guid.rea.viewCompleteEvidence')}</Button>}
            />
          )}

          <label className={styles.label}>
            {t('guid.rea.traceDirection')}
            <Select
              aria-label={t('guid.rea.traceDirection')}
              disabled={locked}
              value={direction}
              onChange={setDirection}
              options={(['incoming', 'outgoing', 'both'] as const).map((value) => ({
                value,
                label: t(`guid.rea.directions.${value}`),
              }))}
            />
          </label>
          <p className={styles.muted}>{t('guid.rea.traceBoundary')}</p>
        </div>
      )}
      {stage >= 2 && (
        <Alert type='info' content={t(stage === 2 ? 'guid.rea.interpretHint' : 'guid.rea.reconstructHint')} />
      )}
      <div className={styles.row}>
        <Button type='primary' disabled={locked || !!reason} onClick={run}>
          {t(
            stage === 0
              ? current.versions.length
                ? 'guid.rea.inspectAgain'
                : 'guid.rea.inspect'
              : stage === 1
                ? 'guid.rea.trace'
                : stage === 2
                  ? 'guid.rea.interpret'
                  : 'guid.rea.reconstruct'
          )}
        </Button>
        {project.run_id && (
          <Button
            status='warning'
            disabled={busy || stopping}
            onClick={() => {
              void stop();
            }}
          >
            {t(stopping ? 'guid.rea.stopping' : 'guid.production.stop')}
          </Button>
        )}
        {stage === 0 && currentEvidence(project, 0) && (
          <Button onClick={() => onStage(1)}>{t('guid.rea.nextTrace')}</Button>
        )}
        {stage === 1 && currentEvidence(project, 1) && (
          <Button onClick={() => onStage(2)}>{t('guid.rea.nextInterpret')}</Button>
        )}
        {stage === 2 && current.versions.length > 0 && ['review', 'approved'].includes(current.status) && (
          <Button onClick={() => onStage(3)}>{t('guid.rea.nextReconstruct')}</Button>
        )}
        {current.conversation_id && (
          <Button onClick={() => onOpenConversation(current.conversation_id!)}>
            {t('guid.production.openConversation')}
          </Button>
        )}
        <Tag>
          {['review', 'approved'].includes(current.status)
            ? t(stage < 2 ? 'guid.rea.toolResultReady' : 'guid.rea.interpretationReady')
            : t(`guid.production.status.${current.status}`)}
        </Tag>
      </div>
      {reason && !project.run_id && <Alert type='info' content={reason} />}
      {project.run_id && (
        <div data-testid='rea-running-state'>
          <Alert
            type={waitingConfirmation ? 'warning' : 'info'}
            content={
              stopping
                ? t('guid.rea.stoppingHint')
                : waitingConfirmation
                  ? t('guid.production.waitingConfirmation')
                  : t('guid.rea.runningStage', { stage: titles[activeIndex] || t('guid.production.status.running') })
            }
            action={
              activeConversation ? (
                <Button onClick={() => onOpenConversation(activeConversation)}>
                  {t('guid.production.openActiveConversation')}
                </Button>
              ) : undefined
            }
          />
        </div>
      )}
    </section>
  );
}
