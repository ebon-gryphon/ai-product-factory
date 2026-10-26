import React, { useState } from 'react';
import { Alert, Button, Input, Select, Modal, Collapse } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { download, isolatedPreview, prototypeHtml } from './artifacts';
import type { Project, Action } from './types';
import styles from './Factory.module.css';
import ReaEvidence from './ReaEvidence';
type Props = { project: Project; stage: number; busy: boolean; onAction: (action: Action) => Promise<void> };
export default function ArtifactPanel({ project, stage, busy, onAction }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const current = project.stages[stage];
  const latest = current.versions.at(-1);
  const evidenceReadOnly = project.workflow === 'rea' && stage < 2;
  const draftKey = `factory.draft.${project.id}.${stage}.${latest?.id || 'empty'}`;
  const [draft, setDraft] = useState(() =>
    evidenceReadOnly ? (latest?.content ?? '') : (sessionStorage.getItem(draftKey) ?? latest?.content ?? '')
  );
  const [version, setVersion] = useState(latest?.id || '');
  const [preview, setPreview] = useState(false);
  const shown = current.versions.find((v) => v.id === version);
  const historical = Boolean(shown && shown.id !== latest?.id);
  const html = evidenceReadOnly ? null : prototypeHtml(historical ? shown?.content || '' : draft);
  const disabled = busy || Boolean(project.run_id) || project.archived;
  const change = (value: string): void => {
    if (evidenceReadOnly) return;
    setDraft(value);
    sessionStorage.setItem(draftKey, value);
  };
  return (
    <section>
      <div className={styles.row}>
        <Select
          aria-label={t('guid.production.versions')}
          placeholder={t('guid.production.versions')}
          value={version || undefined}
          onChange={setVersion}
          options={current.versions.map((v, i) => ({
            value: v.id,
            label: `v${i + 1} · ${new Date(v.created_at).toLocaleString()}`,
          }))}
        />
        {historical && !evidenceReadOnly && (
          <Button
            disabled={disabled}
            onClick={() => {
              Modal.confirm({
                title: t('guid.production.restore'),
                content: t('guid.production.invalidateHint'),
                onOk: () => onAction({ action: 'restore', stage, version_id: version }),
              });
            }}
          >
            {t('guid.production.restore')}
          </Button>
        )}
        <Button
          disabled={!draft && !shown}
          onClick={() => download(`${project.name}-${stage + 1}.md`, historical ? shown?.content || '' : draft)}
        >
          {t('guid.production.exportStage')}
        </Button>
        {html && <Button onClick={() => setPreview(!preview)}>{t('guid.production.preview')}</Button>}
        {html && (
          <Button onClick={() => download(`${project.name}-prototype.html`, html, 'text/html;charset=utf-8')}>
            {t('guid.production.exportHtml')}
          </Button>
        )}
      </div>
      {current.error && (
        <Alert
          type='error'
          content={t(`guid.production.errors.${current.error}` as 'guid.production.errors.FACTORY_STORAGE', {
            defaultValue: t('guid.production.executionError'),
          })}
        />
      )}
      {current.status === 'stale' && <Alert type='warning' content={t('guid.production.staleHint')} />}
      {preview && html && (
        <>
          <p className={styles.muted}>{t('guid.production.previewHint')}</p>
          <iframe
            title={t('guid.production.preview')}
            className={styles.preview}
            sandbox='allow-scripts allow-forms'
            srcDoc={isolatedPreview(html)}
          />
        </>
      )}
      {evidenceReadOnly ? (
        <>
          {(shown || latest) && (
            <ReaEvidence key={(shown || latest)!.id} artifact={(shown || latest)!} projectId={project.id} />
          )}
          <Collapse>
            <Collapse.Item name='raw-summary' header={t('guid.rea.viewSummary')}>
              <pre className={styles.content}>{historical ? shown?.content : draft}</pre>
            </Collapse.Item>
          </Collapse>
        </>
      ) : historical ? (
        <pre className={styles.content}>{shown?.content}</pre>
      ) : (
        <Input.TextArea
          aria-label={t('guid.production.artifact')}
          value={draft}
          readOnly={disabled}
          autoSize={{ minRows: 12, maxRows: 26 }}
          onChange={change}
        />
      )}
      <p className={styles.muted}>
        {evidenceReadOnly ? t('guid.rea.evidenceReadOnlyHint') : t('guid.production.invalidateHint')}
      </p>
      {!historical && !evidenceReadOnly && (
        <Button
          disabled={disabled || !draft.trim() || draft === latest?.content}
          onClick={() => {
            void onAction({ action: 'save', stage, content: draft })
              .then(() => sessionStorage.removeItem(draftKey))
              .catch(() => {});
          }}
        >
          {t('guid.production.saveVersion')}
        </Button>
      )}
    </section>
  );
}
