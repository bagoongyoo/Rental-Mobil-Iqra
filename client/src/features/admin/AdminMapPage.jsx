// Peta lokasi driver: komponen peta dari Dev 3, dipusatkan ke Palu.
import { useTranslation } from 'react-i18next';
import { AdminDriverLiveMap } from '../driver';
import { PageHeader } from './ui';

const PALU = [-0.8917, 119.8707];

export function AdminMapPage() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader title={t('admin.nav.map')} subtitle={t('admin.mapHint')} />
      <AdminDriverLiveMap defaultCenter={PALU} defaultZoom={13} />
    </div>
  );
}
