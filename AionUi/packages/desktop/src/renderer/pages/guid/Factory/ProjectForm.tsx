import React, { useState } from 'react';
import { Button, Input, Select, Alert } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { ProjectInput, Assistant, ModelOption, Workflow } from './types';
import styles from './Factory.module.css';
type Props = {
  initial?: ProjectInput;
  workflow?: Workflow;
  assistants: Assistant[];
  models: ModelOption[];
  busy: boolean;
  onSave: (value: ProjectInput) => Promise<void>;
};
export default function ProjectForm({
  initial,
  workflow = 'production',
  assistants,
  models,
  busy,
  onSave,
}: Props): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const isRea = workflow === 'rea';
  const [value, setValue] = useState<ProjectInput>(
    initial || { name: '', brief: '', assistant_id: '', workspace: '', model: null, workflow, target_path: '' }
  );
  const set = (key: keyof ProjectInput, text: string): void => setValue((old) => ({ ...old, [key]: text }));
  return (
    <div className={styles.form}>
      <label className={styles.label}>
        {t('guid.production.name')}
        <Input value={value.name} maxLength={100} onChange={(v) => set('name', v)} />
      </label>
      {isRea && (
        <label className={styles.label}>
          {t('guid.rea.targetPath')}
          <Input
            value={value.target_path || ''}
            placeholder={t('guid.rea.targetPlaceholder')}
            maxLength={4096}
            onChange={(v) => set('target_path', v)}
          />
          <span className={styles.muted}>{t('guid.rea.targetHint')}</span>
        </label>
      )}
      <label className={styles.label}>
        {isRea ? t('guid.rea.brief') : t('guid.production.brief')}
        <Input.TextArea
          value={value.brief}
          placeholder={isRea ? t('guid.rea.questionExample') : undefined}
          maxLength={10000}
          autoSize={{ minRows: 5, maxRows: 12 }}
          onChange={(v) => set('brief', v)}
        />
      </label>
      {isRea && <Alert type='info' content={t('guid.rea.questionHint')} />}
      <label className={styles.label}>
        {t('guid.production.assistant')}
        <Select
          allowClear
          value={value.assistant_id || undefined}
          onChange={(v: string | undefined) => set('assistant_id', v || '')}
          options={assistants
            .filter((a) => a.enabled)
            .map((a) => ({ value: a.id, label: a.name_i18n?.[i18n.language] || a.name }))}
        />
      </label>
      <label className={styles.label}>
        {t('guid.production.model')}
        <Select
          allowClear
          placeholder={t('guid.production.defaultModel')}
          value={value.model ? JSON.stringify([value.model.provider_id, value.model.model]) : undefined}
          onChange={(v: string | undefined) => {
            const target = v ? (JSON.parse(v) as [string, string]) : null;
            setValue((old) => ({ ...old, model: target ? { provider_id: target[0], model: target[1] } : null }));
          }}
          options={models.map((m) => ({
            value: JSON.stringify([m.provider_id, m.model]),
            label: `${m.provider_name} / ${m.model}`,
          }))}
        />
      </label>
      <label className={styles.label}>
        {t('guid.production.workspace')}
        <Input value={value.workspace} onChange={(v) => set('workspace', v)} />
      </label>
      <Alert type='info' content={isRea ? t('guid.rea.credentialsHint') : t('guid.production.credentialsHint')} />
      <Button
        type='primary'
        loading={busy}
        disabled={!value.name.trim() || !value.brief.trim() || (isRea && !value.target_path?.trim())}
        onClick={() => {
          void onSave({ ...value, workflow });
        }}
      >
        {t('guid.production.saveProject')}
      </Button>
    </div>
  );
}
