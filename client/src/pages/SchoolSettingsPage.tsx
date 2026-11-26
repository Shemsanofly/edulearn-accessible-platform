import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, GraduationCap, ImageUp, Save, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Language, SchoolSettings, SchoolSettingsInput } from '../../../shared/types';
import { useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import { Button, Card, CardHeader, CardSkeleton, ErrorState, Field, Input, PageHeader, Select, Textarea } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { levelName, money } from '../lib/format';
import { useI18n, useT } from '../lib/i18n';
import { resizeImage } from '../lib/export';

const CURRENCIES = ['TZS', 'USD', 'KES', 'UGX', 'EUR', 'GBP'];
const LEVEL_LABELS = ['Form', 'Standard', 'Grade', 'Class'];

const M = {
  en: {
    desc: 'Your school’s name, contact details, currency and how class levels are named. These appear on report cards, receipts and the website.',
    identity: 'School identity', contact: 'Contact details', regional: 'Currency, language & levels',
    name: 'School name', motto: 'Motto', mottoPh: 'e.g. Elimu ni Mwanga', address: 'Address', addressPh: 'P.O. Box, street, town',
    phone: 'Phone', phoneHint: 'Tanzanian numbers like 0777 123 456 are saved as +255 777 123 456', email: 'Email', website: 'Website',
    currency: 'Currency', currencyHint: 'Example: {example}', defaultLanguage: 'Default language', defaultLanguageHint: 'For new users and the public website. Each person can still switch.',
    english: 'English', kiswahili: 'Kiswahili', levelLabel: 'Class levels are called', levelLabelHint: 'Shown as e.g. “{example}”', custom: 'Other…',
    customLabel: 'Custom label', save: 'Save settings', saved: 'School settings saved', nameErr: 'Enter the school name (at least 2 characters)',
    emailErr: 'Enter a valid email address', customErr: 'Enter what levels are called',
    logo: 'School logo', logoDesc: 'Shown in the app, on report cards and receipts. PNG, JPEG, WebP or SVG, up to 2 MB.',
    upload: 'Upload logo', replace: 'Replace logo', remove: 'Remove logo', removeTitle: 'Remove the school logo?',
    removeMsg: 'Report cards and receipts will show the default icon instead.', logoSaved: 'Logo updated', logoRemoved: 'Logo removed',
    badType: 'Choose a PNG, JPEG, WebP or SVG image', tooBig: 'The logo must be smaller than 2 MB', noLogo: 'No logo yet',
  },
  sw: {
    desc: 'Jina la shule, mawasiliano, sarafu na jinsi madarasa yanavyoitwa. Haya huonekana kwenye ripoti za matokeo, stakabadhi na tovuti.',
    identity: 'Utambulisho wa shule', contact: 'Mawasiliano', regional: 'Sarafu, lugha na madarasa',
    name: 'Jina la shule', motto: 'Kauli mbiu', mottoPh: 'mf. Elimu ni Mwanga', address: 'Anwani', addressPh: 'S.L.P., mtaa, mji',
    phone: 'Simu', phoneHint: 'Namba kama 0777 123 456 huhifadhiwa kama +255 777 123 456', email: 'Barua pepe', website: 'Tovuti',
    currency: 'Sarafu', currencyHint: 'Mfano: {example}', defaultLanguage: 'Lugha ya msingi', defaultLanguageHint: 'Kwa watumiaji wapya na tovuti ya umma. Kila mtu bado anaweza kubadilisha.',
    english: 'Kiingereza', kiswahili: 'Kiswahili', levelLabel: 'Madarasa yanaitwa', levelLabelHint: 'Huonekana kama “{example}”', custom: 'Nyingine…',
    customLabel: 'Jina maalum', save: 'Hifadhi mipangilio', saved: 'Mipangilio ya shule imehifadhiwa', nameErr: 'Weka jina la shule (angalau herufi 2)',
    emailErr: 'Weka barua pepe sahihi', customErr: 'Andika jinsi madarasa yanavyoitwa',
    logo: 'Nembo ya shule', logoDesc: 'Huonekana kwenye programu, ripoti za matokeo na stakabadhi. PNG, JPEG, WebP au SVG, hadi MB 2.',
    upload: 'Pakia nembo', replace: 'Badilisha nembo', remove: 'Ondoa nembo', removeTitle: 'Ondoa nembo ya shule?',
    removeMsg: 'Ripoti za matokeo na stakabadhi zitaonyesha alama ya kawaida badala yake.', logoSaved: 'Nembo imesasishwa', logoRemoved: 'Nembo imeondolewa',
    badType: 'Chagua picha ya PNG, JPEG, WebP au SVG', tooBig: 'Nembo lazima iwe chini ya MB 2', noLogo: 'Bado hakuna nembo',
  },
};

interface Form {
  name: string; motto: string; address: string; phone: string; email: string; website: string;
  currency: string; defaultLanguage: Language; levelChoice: string; customLevel: string;
}

const toForm = (s: SchoolSettings): Form => ({
  name: s.name, motto: s.motto ?? '', address: s.address ?? '', phone: s.phone ?? '', email: s.email ?? '', website: s.website ?? '',
  currency: s.currency, defaultLanguage: s.defaultLanguage,
  levelChoice: LEVEL_LABELS.includes(s.levelLabel) ? s.levelLabel : 'custom', customLevel: LEVEL_LABELS.includes(s.levelLabel) ? '' : s.levelLabel,
});

export function SchoolSettingsPage() {
  const t = useT(M);
  const { t: tc } = useI18n();
  const q = useQuery({ queryKey: ['school'], queryFn: () => api.get<SchoolSettings>('/school') });

  return (
    <>
      <PageHeader title={tc('schoolSettings')} description={t('desc')} />
      {q.isLoading ? (
        <CardSkeleton rows={8} />
      ) : q.error || !q.data ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : (
        <>
          <div className="grid grid-main" style={{ alignItems: 'start' }}>
            <SettingsForm settings={q.data} />
            <LogoCard settings={q.data} />
          </div>
        </>
      )}
    </>
  );
}

function SettingsForm({ settings }: { settings: SchoolSettings }) {
  const t = useT(M);
  const toast = useToast();
  const qc = useQueryClient();
  const { setSchool } = useAuth();
  const [form, setForm] = useState<Form>(() => toForm(settings));
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => setForm(toForm(settings)), [settings]);

  const levelLabel = form.levelChoice === 'custom' ? form.customLevel.trim() : form.levelChoice;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const save = useMutation({
    mutationFn: (body: SchoolSettingsInput) => api.put<SchoolSettings>('/school', body),
    onSuccess: (updated) => {
      setSchool(updated);
      qc.setQueryData(['school'], updated);
      setErrors({});
      toast.success(t('saved'));
    },
    onError: (err) => {
      if (err instanceof ApiError && err.details) setErrors(err.details);
      toast.error(err);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = t('nameErr');
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = t('emailErr');
    if (!levelLabel) errs.levelLabel = t('customErr');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    save.mutate({
      name: form.name.trim(),
      motto: form.motto.trim() || null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      website: form.website.trim() || null,
      currency: form.currency,
      defaultLanguage: form.defaultLanguage,
      levelLabel,
    });
  };

  let currencyExample = '';
  try {
    currencyExample = new Intl.NumberFormat('en-GB', { style: 'currency', currency: form.currency, maximumFractionDigits: 0 }).format(450000);
  } catch {
    currencyExample = money(450000);
  }

  return (
    <form onSubmit={submit} noValidate className="stack" style={{ gap: 20 }}>
      <Card>
        <CardHeader title={t('identity')} />
        <div className="card-body form-grid">
          <Field label={t('name')} required error={errors.name} className="span-2">
            <Input value={form.name} maxLength={120} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label={t('motto')} error={errors.motto} className="span-2">
            <Input value={form.motto} maxLength={160} placeholder={t('mottoPh')} onChange={(e) => set('motto', e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title={t('contact')} />
        <div className="card-body form-grid">
          <Field label={t('address')} error={errors.address} className="span-2">
            <Textarea value={form.address} maxLength={300} placeholder={t('addressPh')} style={{ minHeight: 70 }} onChange={(e) => set('address', e.target.value)} />
          </Field>
          <Field label={t('phone')} error={errors.phone} hint={t('phoneHint')}>
            <Input type="tel" value={form.phone} maxLength={40} autoComplete="tel" onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label={t('email')} error={errors.email}>
            <Input type="email" value={form.email} maxLength={160} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label={t('website')} error={errors.website} className="span-2">
            <Input value={form.website} maxLength={160} placeholder="https://" onChange={(e) => set('website', e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title={t('regional')} />
        <div className="card-body form-grid">
          <Field label={t('currency')} error={errors.currency} hint={t('currencyHint', { example: currencyExample })}>
            <Select value={form.currency} onChange={(e) => set('currency', e.target.value)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label={t('defaultLanguage')} error={errors.defaultLanguage} hint={t('defaultLanguageHint')}>
            <Select value={form.defaultLanguage} onChange={(e) => set('defaultLanguage', e.target.value as Language)}>
              <option value="en">{t('english')}</option>
              <option value="sw">{t('kiswahili')}</option>
            </Select>
          </Field>
          <Field label={t('levelLabel')} error={form.levelChoice === 'custom' ? undefined : errors.levelLabel} hint={levelLabel ? t('levelLabelHint', { example: levelName(2, levelLabel) }) : undefined}>
            <Select value={form.levelChoice} onChange={(e) => set('levelChoice', e.target.value)}>
              {LEVEL_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
              <option value="custom">{t('custom')}</option>
            </Select>
          </Field>
          {form.levelChoice === 'custom' && (
            <Field label={t('customLabel')} required error={errors.levelLabel}>
              <Input value={form.customLevel} maxLength={30} onChange={(e) => set('customLevel', e.target.value)} />
            </Field>
          )}
        </div>
      </Card>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button type="submit" variant="primary" icon={<Save size={16} />} loading={save.isPending}>{t('save')}</Button>
      </div>
    </form>
  );
}

function LogoCard({ settings }: { settings: SchoolSettings }) {
  const t = useT(M);
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { setSchool } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const done = (updated: SchoolSettings, message: string) => {
    setSchool(updated);
    qc.setQueryData(['school'], updated);
    toast.success(message);
  };

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const svg = file.type === 'image/svg+xml';
      const blob = svg ? file : await resizeImage(file, 400, 0.9);
      return api.upload<SchoolSettings>('PUT', '/school/logo', blob, svg ? 'image/svg+xml' : 'image/jpeg');
    },
    onSuccess: (updated) => done(updated, t('logoSaved')),
    onError: (err) => toast.error(err),
  });

  const remove = useMutation({
    mutationFn: () => api.del<SchoolSettings>('/school/logo'),
    onSuccess: (updated) => done(updated, t('logoRemoved')),
    onError: (err) => toast.error(err),
  });

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) return toast.error(t('badType'));
    if (file.size > 2 * 1024 * 1024) return toast.error(t('tooBig'));
    upload.mutate(file);
  };

  return (
    <Card>
      <CardHeader title={t('logo')} subtitle={t('logoDesc')} />
      <div className="card-body stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        <div
          style={{
            width: 140, height: 140, borderRadius: 20, border: '1px dashed var(--border-strong)', display: 'grid', placeItems: 'center',
            background: 'var(--surface-2)', overflow: 'hidden',
          }}
        >
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt={t('logo')} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', background: '#fff' }} />
          ) : (
            <span className="muted small stack-sm" style={{ alignItems: 'center' }}>
              <GraduationCap size={36} aria-hidden />
              {t('noLogo')}
            </span>
          )}
        </div>
        <div className="bold row" style={{ gap: 6 }}><Building2 size={16} aria-hidden /> {settings.name}</div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={onFile} aria-label={t('upload')} tabIndex={-1} />
        <div className="row row-wrap" style={{ gap: 8, justifyContent: 'center' }}>
          <Button variant="primary" icon={<ImageUp size={16} />} loading={upload.isPending} onClick={() => fileRef.current?.click()}>
            {settings.logoUrl ? t('replace') : t('upload')}
          </Button>
          {settings.logoUrl && (
            <Button
              variant="ghost"
              icon={<Trash2 size={16} />}
              loading={remove.isPending}
              onClick={async () => {
                if (await confirm({ title: t('removeTitle'), message: t('removeMsg'), confirmLabel: t('remove'), danger: true })) remove.mutate();
              }}
            >
              {t('remove')}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
