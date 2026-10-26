import React, { useState } from 'react';
import { Alert, Button, Checkbox, Input, Message, Modal, Spin } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import * as api from './client';
import { reconstructionInput } from './artifacts';
import type { Project, ReaStatus } from './types';
import styles from './Factory.module.css';

type EnvironmentProps = { status?: ReaStatus; error: unknown; onRetry: () => void };

/** Report the backend's actual tool readiness before offering local inspection. */
export function ReaEnvironment({ status, error, onRetry }: EnvironmentProps): React.JSX.Element {
  const { t } = useTranslation();
  const missingEndpoint = error instanceof Error && error.message === 'FACTORY_HTTP_404';
  return (
    <section className={styles.reaEnvironment}>
      <Alert
        type={error || status?.available === false ? 'warning' : 'info'}
        title={
          !error && status?.available
            ? t('guid.rea.ready', { version: status.version || 'REA' })
            : t('guid.rea.environment')
        }
        content={
          missingEndpoint ? (
            t('guid.rea.backendOutdated')
          ) : error ? (
            t('guid.rea.checkFailed')
          ) : status ? (
            status.available ? (
              t('guid.rea.scopeHint')
            ) : status.error === 'FACTORY_REA_VERSION_MISMATCH' ? (
              t('guid.production.errors.FACTORY_REA_VERSION_MISMATCH')
            ) : status.error === 'FACTORY_REA_UNAVAILABLE' ? (
              t('guid.rea.installHint')
            ) : (
              t('guid.rea.checkFailed')
            )
          ) : (
            <Spin />
          )
        }
        action={<Button onClick={onRetry}>{t('guid.rea.checkEnvironment')}</Button>}
      />
    </section>
  );
}

type TransferProps = {
  project: Project;
  titles: string[];
  onCreated: (project: Project) => Promise<void>;
};

/** Create a separate production brief with selected saved versions and their provenance. */
export function ReaTransfer({ project, titles, onCreated }: TransferProps): React.JSX.Element {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const eligible = project.stages.flatMap((stage, index) =>
    stage.versions.length && ['review', 'approved'].includes(stage.status) ? [index] : []
  );
  const transfer = async (): Promise<void> => {
    setBusy(true);
    try {
      const input = reconstructionInput(project, selected, name, titles, {
        source: t('guid.rea.sourceProject'),
        target: t('guid.rea.targetPath'),
        scope: t('guid.rea.brief'),
        version: t('guid.rea.sourceVersion'),
      });
      const created = await api.createProject(input);
      setVisible(false);
      await onCreated(created);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'FACTORY_STORAGE';
      Message.error(
        t(`guid.production.errors.${code}` as 'guid.production.errors.FACTORY_STORAGE', {
          defaultValue: t('guid.production.requestError'),
        })
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        disabled={Boolean(project.run_id) || project.archived || !eligible.length}
        onClick={() => {
          setName(t('guid.rea.productionName', { name: project.name }));
          setSelected(eligible);
          setVisible(true);
        }}
      >
        {t('guid.rea.toProduction')}
      </Button>
      <Modal
        title={t('guid.rea.toProduction')}
        visible={visible}
        onCancel={() => !busy && setVisible(false)}
        onOk={transfer}
        confirmLoading={busy}
        okText={t('guid.rea.createProduction')}
        okButtonProps={{ disabled: !name.trim() || !selected.length || Boolean(project.run_id) }}
      >
        <div className={styles.form}>
          <Alert content={t('guid.rea.transferHint')} />
          <label className={styles.label}>
            {t('guid.production.name')}
            <Input value={name} maxLength={100} onChange={setName} disabled={busy} />
          </label>
          <span>{t('guid.rea.selectArtifacts')}</span>
          {project.stages.map((stage, index) => (
            <Checkbox
              key={index}
              disabled={busy || !eligible.includes(index)}
              checked={selected.includes(index)}
              onChange={(checked) =>
                setSelected((old) => (checked ? [...old, index] : old.filter((item) => item !== index)))
              }
            >
              {titles[index]} {stage.versions.length ? `· v${stage.versions.length}` : ''}
            </Checkbox>
          ))}
        </div>
      </Modal>
    </>
  );
}
