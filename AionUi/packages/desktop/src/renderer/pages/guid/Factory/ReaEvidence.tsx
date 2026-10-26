import React, { useState } from 'react';
import { Alert, Button, Descriptions, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { download } from './artifacts';
import * as api from './client';
import type { Artifact } from './types';
import styles from './Factory.module.css';

type Props = { artifact: Artifact; projectId: string };
const metricKeys = [
  'files',
  'nodes',
  'edges',
  'unknowns',
  'matched_seeds',
  'traced_nodes',
  'traced_edges',
  'terminal_paths',
  'observed_facts',
  'inferred_facts',
  'unknown_facts',
  'unavailable_facts',
  'parsed_files',
  'skipped_files',
  'parse_failures',
  'browser_windows',
  'preload_entrypoints',
  'context_bridge_apis',
] as const;
const metricAliases: Record<string, string> = {
  relevant_files: 'files',
  parsed_javascript_files: 'parsed_files',
  skipped_javascript_files: 'skipped_files',
  file_count: 'files',
  module_count: 'modules',
  node_count: 'nodes',
  edge_count: 'edges',
  unknown_count: 'unknowns',
};
function numbers(summary: Record<string, unknown>): [string, number][] {
  const values = {
    ...(typeof summary.statistics === 'object' && summary.statistics !== null ? summary.statistics : {}),
    ...summary,
  };
  return Object.entries(values).flatMap(([key, value]) => {
    const normalized = metricAliases[key] || key;
    return typeof value === 'number' && metricKeys.includes(normalized as (typeof metricKeys)[number])
      ? [[normalized, value] as [string, number]]
      : [];
  });
}
function coverageStatus(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'status' in value && typeof value.status === 'string')
    return value.status;
  return 'unknown';
}

/** Present actual retained tool facts without converting static coverage into runtime proof. */
export default function ReaEvidence({ artifact, projectId }: Props): React.JSX.Element | null {
  const { t } = useTranslation();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const evidence = artifact.rea;
  if (!evidence) return <Alert type='warning' content={t('guid.rea.legacyEvidence')} />;
  const isTrace = evidence.operation === 'trace_application_feature';
  const savedSeed = evidence.summary.seed;
  const savedSeedId =
    typeof savedSeed === 'object' && savedSeed !== null && 'value' in savedSeed && typeof savedSeed.value === 'string'
      ? savedSeed.value
      : null;
  const savedCandidate = evidence.candidates.find((candidate) => candidate.node_id === savedSeedId);
  const savedDirection = evidence.summary.direction;
  const savedSource =
    typeof evidence.summary.source_evidence_id === 'string' ? evidence.summary.source_evidence_id : null;
  const coverage = evidence.coverage;
  const statuses =
    typeof coverage === 'object' && coverage !== null && ('application' in coverage || 'semantic' in coverage)
      ? Object.entries(coverage).filter(([key]) => ['application', 'semantic'].includes(key))
      : [['application', coverage]];
  const fetchOriginal = async (): Promise<void> => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const blob = await api.evidence(projectId, artifact.id);
      download(evidence.file_name, blob, 'application/json');
    } catch (error) {
      const code = error instanceof Error ? error.message : 'FACTORY_STORAGE';
      setDownloadError(
        t(`guid.production.errors.${code}` as 'guid.production.errors.FACTORY_STORAGE', {
          defaultValue: t('guid.rea.downloadFailed'),
        })
      );
    } finally {
      setDownloading(false);
    }
  };
  return (
    <section className={styles.evidenceCard} aria-label={t('guid.rea.evidenceDetails')}>
      <div className={styles.row}>
        <Tag>
          {t(evidence.operation === 'trace_application_feature' ? 'guid.rea.traceEvidence' : 'guid.rea.staticEvidence')}
        </Tag>
        <Button
          loading={downloading}
          onClick={() => {
            void fetchOriginal();
          }}
        >
          {t('guid.rea.downloadEvidence')}
        </Button>
      </div>
      {downloadError && <Alert type='error' content={downloadError} />}
      <Descriptions
        column={1}
        data={[
          { label: t('guid.rea.evidenceId'), value: <code className={styles.breakText}>{evidence.evidence_id}</code> },
          { label: t('guid.rea.evidenceBytes'), value: evidence.bytes.toLocaleString() },
          { label: t('guid.rea.sha256'), value: <code className={styles.breakText}>{evidence.sha256}</code> },
          ...(isTrace
            ? [
                {
                  label: t('guid.rea.savedTraceAnchor'),
                  value: savedSeedId ? (
                    <div>
                      {savedCandidate && (
                        <span>
                          {savedCandidate.label} · {savedCandidate.kind}
                        </span>
                      )}
                      <code className={styles.breakText}>{savedSeedId}</code>
                    </div>
                  ) : (
                    t('guid.rea.coverage.unknown')
                  ),
                },
                {
                  label: t('guid.rea.savedTraceDirection'),
                  value:
                    typeof savedDirection === 'string' && ['incoming', 'outgoing', 'both'].includes(savedDirection)
                      ? t(`guid.rea.directions.${savedDirection}` as 'guid.rea.directions.both')
                      : t('guid.rea.coverage.unknown'),
                },
                {
                  label: t('guid.rea.sourceOverview'),
                  value: savedSource ? (
                    <code className={styles.breakText}>{savedSource}</code>
                  ) : (
                    t('guid.rea.coverage.unknown')
                  ),
                },
              ]
            : []),
        ]}
      />
      <div className={styles.metrics}>
        {numbers(evidence.summary).map(([key, value]) => (
          <div key={key} className={styles.metric}>
            <strong>{value.toLocaleString()}</strong>
            <span>{t(`guid.rea.metrics.${key}` as 'guid.rea.metrics.files')}</span>
          </div>
        ))}
      </div>
      <div className={styles.row}>
        {statuses.map(([key, value]) => {
          const status = coverageStatus(value);
          return (
            <Tag key={String(key)}>
              {t(key === 'semantic' ? 'guid.rea.semanticCoverage' : 'guid.rea.applicationCoverage')} ·{' '}
              {t(`guid.rea.coverage.${status}` as 'guid.rea.coverage.unknown', {
                defaultValue: t('guid.rea.coverage.unknown'),
              })}
            </Tag>
          );
        })}
      </div>
      <Alert
        type='info'
        content={t(
          evidence.operation === 'trace_application_feature' ? 'guid.rea.traceBoundary' : 'guid.rea.overviewBoundary'
        )}
      />
      {evidence.limitations.length > 0 && (
        <div className={styles.limitations}>
          <h4>{t('guid.rea.limitations')}</h4>
          <ul>
            {evidence.limitations.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
