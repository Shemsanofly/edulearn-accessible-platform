import { Compass } from 'lucide-react';
import { ButtonLink, EmptyState } from '../components/ui';
import { useT } from '../lib/i18n';

const M = {
  en: {
    title: 'We couldn’t find that page',
    body: 'The link may be out of date, or this page isn’t available for your account.',
    back: 'Back to dashboard',
  },
  sw: {
    title: 'Hatukupata ukurasa huo',
    body: 'Huenda kiungo kimepitwa na wakati, au ukurasa huu haupatikani kwa akaunti yako.',
    back: 'Rudi kwenye dashibodi',
  },
};

export function NotFoundPage() {
  const t = useT(M);
  return (
    <div className="card" style={{ maxWidth: 560, margin: '40px auto' }}>
      <EmptyState icon={<Compass size={26} />} title={t('title')} action={<ButtonLink to="/" variant="primary">{t('back')}</ButtonLink>}>
        {t('body')}
      </EmptyState>
    </div>
  );
}
