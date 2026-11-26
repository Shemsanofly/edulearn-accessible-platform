import { ArrowRight, ArrowUpRight, Check, Languages, Mail, MapPin, Phone, Send, ShieldCheck, Smartphone, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicFooter, SiteHeader } from '../components/AuthLayout';
import { Alert, Avatar, Button, Field, Input, Textarea } from '../components/ui';
import { api, ApiError, errorMessage } from '../lib/api';
import { useAuth, useSchool } from '../lib/auth';
import { useI18n, useT } from '../lib/i18n';

const M = {
  en: {
    skip: 'Skip to main content',
    navFeatures: 'Features', navHow: 'How it works', navAccess: 'Getting access', navContact: 'Contact',
    goDashboard: 'Go to dashboard',
    heroEyebrow: 'School management · Zanzibar & Tanzania',
    heroTitle: 'Know every student.', heroTitleEm: 'Keep every family informed.',
    heroText: 'Registers, marks, report cards, fees and school news in one system for administrators, teachers, parents and students — on any phone or computer.',
    fact1: 'English and Kiswahili', fact2: 'Fees in Tanzanian Shillings', fact3: 'Works on any phone', fact4: 'Accounts by invitation only',
    pvLabel: 'Parent view', pvChild: 'Ali Juma · Form 2A', pvAttendance: 'Attendance this term', pvAverage: 'Mid-term average',
    pvBalance: 'Fee balance', pvNext: 'Next', pvNextText: 'The mid-term report card is ready to read and print.',
    pvCaption: 'Sample screen — not real school data',
    featuresEyebrow: 'What it covers', featuresTitle: 'The records a school runs on, kept in one place',
    featuresText: 'Replace paper registers, scattered spreadsheets and lost notes with one secure system that every member of the school can use.',
    g1: 'People and classes', g1d: 'Admissions, student profiles and photos, teachers and the subjects they teach, parents linked to each of their children.',
    g1t: 'Students|Teachers|Parents|Classes',
    g2: 'Teaching and results', g2d: 'Take the register in a minute, keep gradebooks, run examinations with automatic grading such as CSEE, and print report cards.',
    g2t: 'Attendance|Gradebook|Examinations|Report cards',
    g3: 'Fees and receipts', g3d: 'Fee structures per level, class invoices without double billing, part payments, numbered receipts and balances in TZS.',
    g3t: 'Invoices|Payments|Receipts|Balances',
    g4: 'Communication and reports', g4d: 'Announcements, messages and notifications for families, with attendance, academic and financial reports for the office.',
    g4t: 'Announcements|Messages|Calendar|Reports',
    howEyebrow: 'How it works', howTitle: 'One system, a clear view for each person',
    howText: 'Everyone signs in to the same school system and sees only what belongs to them.',
    rAdmin: 'School office', rAdminWho: 'Administrators', rAdmin1: 'Set up classes, subjects, terms and fees', rAdmin2: 'Invite teachers, parents and students', rAdmin3: 'Follow attendance, results and fee collection',
    rTeacher: 'Classroom', rTeacherWho: 'Teachers', rTeacher1: 'Take the daily register', rTeacher2: 'Set assignments and enter marks', rTeacher3: 'Share class news with parents',
    rFamily: 'Home', rFamilyWho: 'Parents and students', rFamily1: 'Sign in on any phone', rFamily2: 'See attendance, results and homework', rFamily3: 'Check fee balances and receipts',
    accessEyebrow: 'Getting access', accessTitle: 'Accounts are created by invitation',
    accessText: 'So that every person joins with the right access, the school office invites each parent, student and member of staff. Nobody chooses their own role.',
    access1: 'The school office sends you an invitation link by email or message.',
    access2: 'Open the link, check your details and choose a password.',
    access3: 'Sign in at any time with your email address and password.',
    haveInvite: 'I have an invitation', accessNoInvite: 'No invitation yet?', accessAsk: 'Ask the school office',
    aboutEyebrow: 'Made for local schools', aboutTitle: 'Built around the way schools in Tanzania work',
    aboutText: 'EduLearn helps schools spend less time on paperwork and more on learning, so every parent can follow their child’s progress and the office works from accurate, up-to-date records.',
    a1: 'English and Kiswahili, switchable at any time', a2: 'School fees in Tanzanian Shillings (TZS)',
    a3: 'Terms, academic years and grading such as CSEE', a4: 'Works on any smartphone, tablet or computer',
    a5: 'Larger text, high contrast and screen-reader support', a6: 'Each person sees only what they should',
    aboutNote: 'Payments are recorded by the school bursar (cash, bank or mobile-money references). Online payment collection is not part of the platform.',
    contactEyebrow: 'Contact', contactTitle: 'Questions? Write to the school office',
    contactText: 'Ask about admissions, accounts or the platform. The office replies by email or phone.',
    fullName: 'Full name', schoolName: 'School or organisation', schoolHint: 'Optional', email: 'Email address', phone: 'Phone number', phoneHint: 'Optional — for example 0777 123 456',
    message: 'Message', send: 'Send message', failed: 'We couldn’t send your message',
    errName: 'Enter your full name', errEmail: 'Enter a valid email address', errMessage: 'Write a short message (at least 5 characters)',
    sentTitle: 'Thank you — your message has been sent', sentText: 'The school office will get back to you, usually within one working day.',
    sendAnother: 'Send another message', reachUs: 'Reach the office directly',
  },
  sw: {
    skip: 'Ruka hadi maudhui makuu',
    navFeatures: 'Huduma', navHow: 'Jinsi inavyofanya kazi', navAccess: 'Kupata akaunti', navContact: 'Mawasiliano',
    goDashboard: 'Nenda kwenye dashibodi',
    heroEyebrow: 'Usimamizi wa shule · Zanzibar na Tanzania',
    heroTitle: 'Mjue kila mwanafunzi.', heroTitleEm: 'Ijulishe kila familia.',
    heroText: 'Mahudhurio, alama, ripoti za matokeo, ada na habari za shule katika mfumo mmoja kwa wasimamizi, walimu, wazazi na wanafunzi — kwenye simu au kompyuta yoyote.',
    fact1: 'Kiingereza na Kiswahili', fact2: 'Ada kwa Shilingi za Tanzania', fact3: 'Inafanya kazi kwenye simu yoyote', fact4: 'Akaunti kwa mwaliko tu',
    pvLabel: 'Mwonekano wa mzazi', pvChild: 'Ali Juma · Kidato cha 2A', pvAttendance: 'Mahudhurio muhula huu', pvAverage: 'Wastani wa katikati ya muhula',
    pvBalance: 'Salio la ada', pvNext: 'Inayofuata', pvNextText: 'Ripoti ya matokeo ya katikati ya muhula iko tayari kusomwa na kuchapishwa.',
    pvCaption: 'Mfano wa skrini — si taarifa halisi za shule',
    featuresEyebrow: 'Inachohusisha', featuresTitle: 'Kumbukumbu ambazo shule inazitegemea, mahali pamoja',
    featuresText: 'Badilisha madaftari ya karatasi, majedwali yaliyotawanyika na barua zinazopotea kwa mfumo mmoja salama unaoweza kutumiwa na kila mtu shuleni.',
    g1: 'Watu na madarasa', g1d: 'Usajili, wasifu na picha za wanafunzi, walimu na masomo wanayofundisha, wazazi waliounganishwa na kila mtoto wao.',
    g1t: 'Wanafunzi|Walimu|Wazazi|Madarasa',
    g2: 'Ufundishaji na matokeo', g2d: 'Chukua mahudhurio kwa dakika moja, tunza daftari la alama, endesha mitihani yenye madaraja ya moja kwa moja kama CSEE, na chapisha ripoti.',
    g2t: 'Mahudhurio|Daftari la alama|Mitihani|Ripoti',
    g3: 'Ada na stakabadhi', g3d: 'Viwango vya ada kwa kila ngazi, ankara za darasa bila kurudiwa, malipo ya sehemu, stakabadhi zenye namba na salio kwa TZS.',
    g3t: 'Ankara|Malipo|Stakabadhi|Salio',
    g4: 'Mawasiliano na ripoti', g4d: 'Matangazo, ujumbe na arifa kwa familia, pamoja na ripoti za mahudhurio, taaluma na fedha kwa ofisi.',
    g4t: 'Matangazo|Ujumbe|Kalenda|Ripoti',
    howEyebrow: 'Jinsi inavyofanya kazi', howTitle: 'Mfumo mmoja, mwonekano wazi kwa kila mtu',
    howText: 'Kila mtu anaingia kwenye mfumo mmoja wa shule na kuona taarifa zinazomhusu tu.',
    rAdmin: 'Ofisi ya shule', rAdminWho: 'Wasimamizi', rAdmin1: 'Andaa madarasa, masomo, mihula na ada', rAdmin2: 'Alika walimu, wazazi na wanafunzi', rAdmin3: 'Fuatilia mahudhurio, matokeo na makusanyo ya ada',
    rTeacher: 'Darasani', rTeacherWho: 'Walimu', rTeacher1: 'Chukua mahudhurio ya kila siku', rTeacher2: 'Toa kazi na ingiza alama', rTeacher3: 'Shirikisha wazazi habari za darasa',
    rFamily: 'Nyumbani', rFamilyWho: 'Wazazi na wanafunzi', rFamily1: 'Ingia kupitia simu yoyote', rFamily2: 'Ona mahudhurio, matokeo na kazi za nyumbani', rFamily3: 'Angalia salio la ada na stakabadhi',
    accessEyebrow: 'Kupata akaunti', accessTitle: 'Akaunti hufunguliwa kwa mwaliko',
    accessText: 'Ili kila mtu ajiunge akiwa na ruhusa sahihi, ofisi ya shule humwalika kila mzazi, mwanafunzi na mfanyakazi. Hakuna anayejichagulia nafasi.',
    access1: 'Ofisi ya shule inakutumia kiungo cha mwaliko kwa barua pepe au ujumbe.',
    access2: 'Fungua kiungo, hakiki taarifa zako na uchague nenosiri.',
    access3: 'Ingia wakati wowote kwa barua pepe na nenosiri lako.',
    haveInvite: 'Nina mwaliko', accessNoInvite: 'Bado huna mwaliko?', accessAsk: 'Iombe ofisi ya shule',
    aboutEyebrow: 'Kwa shule za hapa', aboutTitle: 'Imeundwa kulingana na jinsi shule za Tanzania zinavyofanya kazi',
    aboutText: 'EduLearn inasaidia shule kutumia muda mchache kwenye makaratasi na mwingi kwenye ujifunzaji, ili kila mzazi afuatilie maendeleo ya mtoto wake na ofisi ifanye kazi kwa kumbukumbu sahihi na za wakati.',
    a1: 'Kiingereza na Kiswahili, unaweza kubadilisha wakati wowote', a2: 'Ada za shule kwa Shilingi za Tanzania (TZS)',
    a3: 'Mihula, miaka ya masomo na madaraja kama CSEE', a4: 'Inafanya kazi kwenye simu, kishikwambi au kompyuta yoyote',
    a5: 'Maandishi makubwa, utofautishaji mkubwa na visoma skrini', a6: 'Kila mtu anaona taarifa zinazomhusu tu',
    aboutNote: 'Malipo hurekodiwa na mhasibu wa shule (taslimu, benki au namba za kumbukumbu za pesa kwa simu). Ukusanyaji wa malipo mtandaoni si sehemu ya mfumo huu.',
    contactEyebrow: 'Mawasiliano', contactTitle: 'Una swali? Iandikie ofisi ya shule',
    contactText: 'Uliza kuhusu usajili, akaunti au mfumo. Ofisi itajibu kwa barua pepe au simu.',
    fullName: 'Jina kamili', schoolName: 'Shule au taasisi', schoolHint: 'Si lazima', email: 'Barua pepe', phone: 'Namba ya simu', phoneHint: 'Si lazima — kwa mfano 0777 123 456',
    message: 'Ujumbe', send: 'Tuma ujumbe', failed: 'Imeshindikana kutuma ujumbe wako',
    errName: 'Andika jina lako kamili', errEmail: 'Andika barua pepe sahihi', errMessage: 'Andika ujumbe mfupi (angalau herufi 5)',
    sentTitle: 'Asante — ujumbe wako umetumwa', sentText: 'Ofisi ya shule itawasiliana nawe, kwa kawaida ndani ya siku moja ya kazi.',
    sendAnother: 'Tuma ujumbe mwingine', reachUs: 'Wasiliana na ofisi moja kwa moja',
  },
};

type Key = keyof typeof M.en;
type T = (key: Key, vars?: Record<string, string | number>) => string;
type Go = (id: string) => (e?: React.MouseEvent) => void;

const prefersReducedMotion = () =>
  document.documentElement.dataset.motion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  history.replaceState(null, '', `#${id}`);
  // Move keyboard focus with the scroll so the next Tab continues from the section.
  el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}

export function LandingPage() {
  const t = useT(M);
  const { user } = useAuth();

  // Arriving with #contact etc. in the URL: scroll there once the page has rendered.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) setTimeout(() => scrollToId(id), 50);
  }, []);

  const go: Go = (id) => (e) => {
    e?.preventDefault();
    scrollToId(id);
  };

  return (
    <div className="public">
      <a href="#lp-main" className="skip-link">{t('skip')}</a>
      <SiteHeader
        onSection={go}
        links={[
          { id: 'features', label: t('navFeatures') }, { id: 'how', label: t('navHow') },
          { id: 'access', label: t('navAccess') }, { id: 'contact', label: t('navContact') },
        ]}
      />
      <main id="lp-main">
        <Hero t={t} signedIn={!!user} go={go} />
        <Features t={t} />
        <Roles t={t} />
        <Access t={t} go={go} />
        <About t={t} />
        <Contact t={t} />
      </main>
      <PublicFooter onSection={go} />
    </div>
  );
}

function Hero({ t, signedIn, go }: { t: T; signedIn: boolean; go: Go }) {
  const { t: tc } = useI18n();
  const facts: [typeof Languages, Key][] = [[Languages, 'fact1'], [Wallet, 'fact2'], [Smartphone, 'fact3'], [ShieldCheck, 'fact4']];
  return (
    <section className="lp-hero" aria-labelledby="lp-title">
      <div className="wrap lp-hero-grid">
        <div>
          <p className="eyebrow">{t('heroEyebrow')}</p>
          <h1 id="lp-title">{t('heroTitle')} <em>{t('heroTitleEm')}</em></h1>
          <p className="lead">{t('heroText')}</p>
          <div className="lp-ctas">
            {signedIn ? (
              <Link to="/" className="btn btn-lg btn-light">{t('goDashboard')} <ArrowRight size={18} aria-hidden /></Link>
            ) : (
              <>
                <Link to="/register" className="btn btn-lg btn-light">{tc('getStarted')} <ArrowRight size={18} aria-hidden /></Link>
                <Link to="/login" className="btn btn-lg btn-outline">{tc('signIn')}</Link>
              </>
            )}
            <a href="#contact" className="text-link" onClick={go('contact')}>{tc('contactUs')}</a>
          </div>
          <ul className="lp-facts">
            {facts.map(([Icon, k]) => <li key={k}><Icon size={18} aria-hidden />{t(k)}</li>)}
          </ul>
        </div>
        <Preview t={t} />
      </div>
    </section>
  );
}

/** Built from the app's own components with invented sample values; captioned so nobody mistakes it for live data. */
function Preview({ t }: { t: T }) {
  const { locale } = useI18n();
  const tzs = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
  return (
    <figure className="lp-preview">
      <div className="screen" aria-hidden>
        <div className="screen-head">
          <Avatar name="Ali Juma" color="var(--role-student)" />
          <div>
            <small>{t('pvLabel')}</small>
            <strong>{t('pvChild')}</strong>
          </div>
        </div>
        <dl>
          <div><dt>{t('pvAttendance')}</dt><dd style={{ color: 'var(--success)' }}>95%</dd></div>
          <div><dt>{t('pvAverage')}</dt><dd>72% · B</dd></div>
          <div><dt>{t('pvBalance')}</dt><dd style={{ color: 'var(--warning)' }}>{tzs(180_000)}</dd></div>
        </dl>
        <div className="next"><small>{t('pvNext')}</small>{t('pvNextText')}</div>
      </div>
      <figcaption>{t('pvCaption')}</figcaption>
    </figure>
  );
}

function Features({ t }: { t: T }) {
  const groups: [Key, Key, Key][] = [['g1', 'g1d', 'g1t'], ['g2', 'g2d', 'g2t'], ['g3', 'g3d', 'g3t'], ['g4', 'g4d', 'g4t']];
  return (
    <section id="features" className="lp-section" aria-labelledby="lp-features">
      <div className="wrap lp-split">
        <div>
          <p className="eyebrow">{t('featuresEyebrow')}</p>
          <h2 id="lp-features">{t('featuresTitle')}</h2>
          <p>{t('featuresText')}</p>
        </div>
        <ol className="lp-rows">
          {groups.map(([title, text, tags], i) => (
            <li key={title}>
              <span className="n" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3>{t(title)}</h3>
                <p>{t(text)}</p>
                <div className="tags">{t(tags).split('|').map((tag) => <span key={tag} className="chip">{tag}</span>)}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Roles({ t }: { t: T }) {
  const roles: [Key, Key, Key[]][] = [
    ['rAdmin', 'rAdminWho', ['rAdmin1', 'rAdmin2', 'rAdmin3']],
    ['rTeacher', 'rTeacherWho', ['rTeacher1', 'rTeacher2', 'rTeacher3']],
    ['rFamily', 'rFamilyWho', ['rFamily1', 'rFamily2', 'rFamily3']],
  ];
  return (
    <section id="how" className="lp-section white" aria-labelledby="lp-how">
      <div className="wrap">
        <div className="lp-intro">
          <div>
            <p className="eyebrow">{t('howEyebrow')}</p>
            <h2 id="lp-how">{t('howTitle')}</h2>
          </div>
          <p>{t('howText')}</p>
        </div>
        <div className="lp-roles">
          {roles.map(([title, who, steps]) => (
            <div key={title}>
              <p className="who">{t(who)}</p>
              <h3>{t(title)}</h3>
              <ol>{steps.map((s) => <li key={s}>{t(s)}</li>)}</ol>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Access({ t, go }: { t: T; go: Go }) {
  const { t: tc } = useI18n();
  return (
    <section id="access" className="lp-section" aria-labelledby="lp-access">
      <div className="wrap">
        <div className="lp-access">
          <div>
            <p className="eyebrow">{t('accessEyebrow')}</p>
            <h2 id="lp-access">{t('accessTitle')}</h2>
            <p>{t('accessText')}</p>
          </div>
          <div>
            <ol>
              <li>{t('access1')}</li>
              <li>{t('access2')}</li>
              <li>{t('access3')}</li>
            </ol>
            <div className="row">
              <Link to="/register" className="btn btn-lg btn-light">{t('haveInvite')} <ArrowUpRight size={18} aria-hidden /></Link>
              <Link to="/login" className="btn btn-lg btn-outline">{tc('signIn')}</Link>
            </div>
            <p className="note">{t('accessNoInvite')} <a href="#contact" onClick={go('contact')}>{t('accessAsk')}</a></p>
          </div>
        </div>
      </div>
    </section>
  );
}

function About({ t }: { t: T }) {
  const points: Key[] = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
  return (
    <section id="about" className="lp-section white" aria-labelledby="lp-about">
      <div className="wrap lp-split">
        <div>
          <p className="eyebrow">{t('aboutEyebrow')}</p>
          <h2 id="lp-about">{t('aboutTitle')}</h2>
          <p>{t('aboutText')}</p>
        </div>
        <div>
          <ul className="lp-checks">{points.map((p) => <li key={p}><Check size={18} aria-hidden /> {t(p)}</li>)}</ul>
          <p className="lp-note">{t('aboutNote')}</p>
        </div>
      </div>
    </section>
  );
}

interface ContactForm {
  fullName: string;
  schoolName: string;
  email: string;
  phone: string;
  message: string;
  website: string;
}
const EMPTY: ContactForm = { fullName: '', schoolName: '', email: '', phone: '', message: '', website: '' };

function Contact({ t }: { t: T }) {
  const school = useSchool();
  const [form, setForm] = useState<ContactForm>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k: keyof ContactForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors(({ [k]: _drop, ...rest }) => rest);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (form.fullName.trim().length < 2) errs.fullName = t('errName');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = t('errEmail');
    if (form.message.trim().length < 5) errs.message = t('errMessage');
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.querySelector<HTMLElement>(`#contact [name="${Object.keys(errs)[0]}"]`)?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/contact', {
        fullName: form.fullName.trim(),
        schoolName: form.schoolName.trim() || null,
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        message: form.message.trim(),
        website: form.website,
      });
      setSent(true);
      setForm(EMPTY);
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(err.details);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="contact" className="lp-section" aria-labelledby="lp-contact">
      <div className="wrap lp-split">
        <div>
          <p className="eyebrow">{t('contactEyebrow')}</p>
          <h2 id="lp-contact">{t('contactTitle')}</h2>
          <p>{t('contactText')}</p>
          {(school.email || school.phone || school.address) && (
            <div className="lp-contact-info">
              <strong>{t('reachUs')}</strong>
              {school.phone && <a href={`tel:${school.phone.replace(/\s/g, '')}`}><Phone size={17} aria-hidden /> {school.phone}</a>}
              {school.email && <a href={`mailto:${school.email}`}><Mail size={17} aria-hidden /> {school.email}</a>}
              {school.address && <span><MapPin size={17} aria-hidden /> {school.address}</span>}
            </div>
          )}
        </div>
        <div className="lp-form">
          {sent ? (
            <div role="status" style={{ padding: '8px 2px' }}>
              <span className="empty-icon" style={{ margin: '0 0 14px', background: 'var(--success-soft)', color: 'var(--success)' }} aria-hidden>
                <Check size={26} />
              </span>
              <h3 style={{ fontSize: '1.15rem' }}>{t('sentTitle')}</h3>
              <p className="muted" style={{ margin: '8px 0 18px' }}>{t('sentText')}</p>
              <Button onClick={() => setSent(false)}>{t('sendAnother')}</Button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="stack" aria-busy={busy}>
              {error && <Alert tone="danger" title={t('failed')}>{error}</Alert>}
              <div className="form-grid">
                <Field label={t('fullName')} error={errors.fullName} required>
                  <Input name="fullName" value={form.fullName} onChange={set('fullName')} autoComplete="name" />
                </Field>
                <Field label={t('email')} error={errors.email} required>
                  <Input name="email" type="email" inputMode="email" value={form.email} onChange={set('email')} autoComplete="email" />
                </Field>
                <Field label={t('phone')} error={errors.phone} hint={t('phoneHint')}>
                  <Input name="phone" type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
                </Field>
                <Field label={t('schoolName')} error={errors.schoolName} hint={t('schoolHint')}>
                  <Input name="schoolName" value={form.schoolName} onChange={set('schoolName')} autoComplete="organization" />
                </Field>
                <Field label={t('message')} error={errors.message} required className="span-2">
                  <Textarea name="message" rows={5} value={form.message} onChange={set('message')} />
                </Field>
              </div>
              {/* Honeypot: hidden from people and screen readers; bots that fill it are rejected. */}
              <div className="lp-honeypot" aria-hidden="true">
                <label>
                  Website
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
                </label>
              </div>
              <div>
                <Button type="submit" variant="primary" size="lg" loading={busy} icon={<Send size={18} />}>{t('send')}</Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
