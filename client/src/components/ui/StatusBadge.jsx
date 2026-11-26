import { useTranslation } from 'react-i18next';
import { Badge } from './Badge';
import { STATUS_TONE } from '../../lib/constants';

export function StatusBadge({ status }) {
  const { t } = useTranslation();
  return <Badge tone={STATUS_TONE[status]}>{t(`status.${status}`)}</Badge>;
}
