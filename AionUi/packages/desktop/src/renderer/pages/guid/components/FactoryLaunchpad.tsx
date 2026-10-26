import React from 'react';
import { Button } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import styles from '../index.module.css';

type FactoryLaunchpadProps = {
  disabled: boolean;
  selectedPrompt?: string;
  onSelect: (prompt: string) => void;
};

const stages = ['requirements', 'content', 'research', 'review'] as const;

/** Select the production brief that replaces the conversation draft. */
const FactoryLaunchpad: React.FC<FactoryLaunchpadProps> = ({ disabled, selectedPrompt, onSelect }) => {
  const { t } = useTranslation();
  return (
    <section className={styles.factoryLaunchpad}>
      <div className={styles.factoryGrid}>
        {stages.map((stage, index) => (
          <Button
            key={stage}
            className={styles.factoryCard}
            disabled={disabled}
            aria-pressed={selectedPrompt === t(`guid.factory.${stage}.prompt`)}
            onClick={() => onSelect(t(`guid.factory.${stage}.prompt`))}
          >
            <span className={styles.factoryCardContent}>
              <span className={styles.factoryNumber}>{String(index + 1).padStart(2, '0')}</span>
              <strong>{t(`guid.factory.${stage}.title`)}</strong>
              <span className={styles.factoryDescription}>{t(`guid.factory.${stage}.description`)}</span>
            </span>
          </Button>
        ))}
      </div>
      <p className={styles.factoryHint}>{t('guid.factory.hint')}</p>
    </section>
  );
};

export default FactoryLaunchpad;
