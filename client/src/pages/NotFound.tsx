import { Compass } from 'lucide-react';
import { ButtonLink, EmptyState } from '../components/ui';

export function NotFoundPage() {
  return (
    <div className="card" style={{ maxWidth: 560, margin: '40px auto' }}>
      <EmptyState icon={<Compass size={26} />} title="We couldn't find that page" action={<ButtonLink to="/" variant="primary">Back to dashboard</ButtonLink>}>
        The link may be out of date, or this page isn't available for your account.
      </EmptyState>
    </div>
  );
}
