import { ArrowRight, Check, GraduationCap, LayoutDashboard, Mail, MapPin, Menu, Phone, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClassroomPhoto } from '../components/AuthLayout';
import { Alert, Button, Field, Input, Textarea } from '../components/ui';
import { api, ApiError, errorMessage } from '../lib/api';
import { useAuth, useSchool } from '../lib/auth';
import { LanguageSwitch, useI18n, useT } from '../lib/i18n';

const M = {
  en: {
    skip: 'Skip to main content',
    navFeatures: 'Features', navHow: 'How it works', navAccess: 'Getting access', navAbout: 'About', navContact: 'Contact',
    goDashboard: 'Go to dashboard',
    openMenu: 'Open menu', closeMenu: 'Close menu', mainNav: 'Main navigation',
    heroEyebrow: 'School management for Zanzibar and Tanzania',
    heroTitle: 'Run your school with clear records and better communication.',
    heroText: 'One place for administrators, teachers, parents and students to follow attendance, results, timetables, fees and school news.',
    heroPoint1: 'English and Kiswahili', heroPoint2: 'Fees in Tanzanian Shillings', heroPoint3: 'Works on any phone',
    featuresEyebrow: 'Features', featuresTitle: 'Everything the school office and classroom need',
    featuresText: 'Replace paper registers, scattered spreadsheets and lost notes with one secure system.',
    f1: 'Student records', f1d: 'Admissions, profiles, photos, classes and guardians in one record.',
    f2: 'Teaching staff', f2d: 'Staff records and the subjects and classes each teacher is assigned to.',
    f3: 'Attendance', f3d: 'Take the register in a minute. Parents hear about absences the same day.',
    f4: 'Academic progress', f4d: 'Gradebooks, subject averages and progress across every term.',
    f5: 'Examinations', f5d: 'Set exams, enter marks, grade automatically (for example CSEE) and print report cards.',
    f6: 'School fees', f6d: 'Fee structures, invoices, payments, receipts and balances in TZS.',
    f7: 'Parent communication', f7d: 'Announcements, messages and notifications straight to parents’ phones.',
    f8: 'Reports', f8d: 'Attendance, academic and financial reports ready to print or open in Excel.',
    howEyebrow: 'How it works', howTitle: 'One system, a clear view for each person',
    howText: 'Everyone signs in to the same school system and sees only what belongs to them.',
    howAdmin: 'School office', howAdmin1: 'Set up classes, subjects, terms and fees', howAdmin2: 'Invite teachers, parents and students', howAdmin3: 'Follow attendance, results and fee collection',
    howTeacher: 'Teachers', howTeacher1: 'Take the daily register', howTeacher2: 'Set assignments and enter marks', howTeacher3: 'Share class news with parents',
    howParent: 'Parents and students', howParent1: 'Sign in on any phone', howParent2: 'See attendance, results and homework', howParent3: 'Check fee balances and receipts',
    accessEyebrow: 'Getting access', accessTitle: 'Accounts are created by invitation',
    accessText: 'So that every person joins with the right access, the school office invites each parent, student and member of staff. Nobody can choose their own role.',
    access1: 'The school office sends you an invitation link by email or message.',
    access2: 'Open the link, check your details and choose a password.',
    access3: 'Sign in at any time with your email address and password.',
    accessNoInvite: 'No invitation yet? Contact the school office and ask to be invited.',
    haveInvite: 'I have an invitation',
    aboutEyebrow: 'About', aboutTitle: 'Built around the way local schools work',
    aboutText1: 'EduLearn helps schools spend less time on paperwork and more time on learning, so every parent can follow their child’s education and every school can run on accurate, up-to-date information.',
    a1: 'English and Kiswahili, switchable at any time', a2: 'School fees in Tanzanian Shillings (TZS)',
    a3: 'Configurable terms, academic years and grading such as CSEE', a4: 'Works on any smartphone, tablet or computer',
    a5: 'Accessible: larger text, high contrast and screen-reader support',
    aboutNote: 'Payments are recorded by the school bursar (cash, bank or mobile-money references). Online payment collection is not part of the platform.',
    contactEyebrow: 'Contact', contactTitle: 'Questions? Write to the school office',
    contactText: 'Ask about admissions, accounts or the platform. The office replies by email or phone.',
    fullName: 'Full name', schoolName: 'School or organisation', schoolHint: 'Optional', email: 'Email address', phone: 'Phone number', phoneHint: 'Optional — for example 0777 123 456',
    message: 'Message',
    send: 'Send message', failed: 'We couldn’t send your message',
    errName: 'Enter your full name', errEmail: 'Enter a valid email address', errMessage: 'Write a short message (at least 5 characters)',
    sentTitle: 'Thank you — your message has been sent', sentText: 'The school office will get back to you, usually within one working day.',
    sendAnother: 'Send another message', reachUs: 'Reach the office directly',
    footerTag: 'School management for Zanzibar and Tanzania.', footerLinks: 'Explore', footerAccount: 'Account', footerContact: 'Contact',
    rights: 'All rights reserved.', forgot: 'Forgot password',
  },
  sw: {
    skip: 'Ruka hadi maudhui makuu',
    navFeatures: 'Huduma', navHow: 'Jinsi inavyofanya kazi', navAccess: 'Kupata akaunti', navAbout: 'Kuhusu', navContact: 'Mawasiliano',
    goDashboard: 'Nenda kwenye dashibodi',
    openMenu: 'Fungua menyu', closeMenu: 'Funga menyu', mainNav: 'Menyu kuu',
    heroEyebrow: 'Usimamizi wa shule kwa Zanzibar na Tanzania',
    heroTitle: 'Endesha shule yako kwa kumbukumbu sahihi na mawasiliano bora.',
    heroText: 'Mahali pamoja kwa wasimamizi, walimu, wazazi na wanafunzi kufuatilia mahudhurio, matokeo, ratiba, ada na habari za shule.',
    heroPoint1: 'Kiingereza na Kiswahili', heroPoint2: 'Ada kwa Shilingi za Tanzania', heroPoint3: 'Inafanya kazi kwenye simu yoyote',
    featuresEyebrow: 'Huduma', featuresTitle: 'Kila kitu ofisi ya shule na darasa vinahitaji',
    featuresText: 'Badilisha madaftari ya karatasi, majedwali yaliyotawanyika na barua zinazopotea kwa mfumo mmoja salama.',
    f1: 'Kumbukumbu za wanafunzi', f1d: 'Usajili, wasifu, picha, madarasa na walezi katika kumbukumbu moja.',
    f2: 'Walimu', f2d: 'Kumbukumbu za walimu pamoja na masomo na madarasa wanayofundisha.',
    f3: 'Mahudhurio', f3d: 'Chukua mahudhurio kwa dakika moja. Wazazi hujulishwa siku hiyohiyo mtoto asipofika.',
    f4: 'Maendeleo ya kitaaluma', f4d: 'Daftari la alama, wastani wa masomo na maendeleo kila muhula.',
    f5: 'Mitihani', f5d: 'Andaa mitihani, ingiza alama, pata madaraja moja kwa moja (mf. CSEE) na chapisha ripoti.',
    f6: 'Ada za shule', f6d: 'Viwango vya ada, ankara, malipo, stakabadhi na salio kwa TZS.',
    f7: 'Mawasiliano na wazazi', f7d: 'Matangazo, ujumbe na arifa moja kwa moja kwenye simu za wazazi.',
    f8: 'Ripoti', f8d: 'Ripoti za mahudhurio, taaluma na fedha tayari kuchapishwa au kufunguliwa kwa Excel.',
    howEyebrow: 'Jinsi inavyofanya kazi', howTitle: 'Mfumo mmoja, mwonekano wazi kwa kila mtu',
    howText: 'Kila mtu anaingia kwenye mfumo mmoja wa shule na kuona taarifa zinazomhusu tu.',
    howAdmin: 'Ofisi ya shule', howAdmin1: 'Andaa madarasa, masomo, mihula na ada', howAdmin2: 'Alika walimu, wazazi na wanafunzi', howAdmin3: 'Fuatilia mahudhurio, matokeo na makusanyo ya ada',
    howTeacher: 'Walimu', howTeacher1: 'Chukua mahudhurio ya kila siku', howTeacher2: 'Toa kazi na ingiza alama', howTeacher3: 'Shirikisha wazazi habari za darasa',
    howParent: 'Wazazi na wanafunzi', howParent1: 'Ingia kupitia simu yoyote', howParent2: 'Ona mahudhurio, matokeo na kazi za nyumbani', howParent3: 'Angalia salio la ada na stakabadhi',
    accessEyebrow: 'Kupata akaunti', accessTitle: 'Akaunti hufunguliwa kwa mwaliko',
    accessText: 'Ili kila mtu ajiunge akiwa na ruhusa sahihi, ofisi ya shule humwalika kila mzazi, mwanafunzi na mfanyakazi. Hakuna anayeweza kujichagulia nafasi.',
    access1: 'Ofisi ya shule inakutumia kiungo cha mwaliko kwa barua pepe au ujumbe.',
    access2: 'Fungua kiungo, hakiki taarifa zako na uchague nenosiri.',
    access3: 'Ingia wakati wowote kwa barua pepe na nenosiri lako.',
    accessNoInvite: 'Bado huna mwaliko? Wasiliana na ofisi ya shule uombe kualikwa.',
    haveInvite: 'Nina mwaliko',
    aboutEyebrow: 'Kuhusu', aboutTitle: 'Imeundwa kulingana na jinsi shule za hapa zinavyofanya kazi',
    aboutText1: 'EduLearn inasaidia shule kutumia muda mchache kwenye makaratasi na muda mwingi kwenye ujifunzaji, ili kila mzazi afuatilie elimu ya mtoto wake na kila shule iendeshwe kwa taarifa sahihi na za wakati.',
    a1: 'Kiingereza na Kiswahili, unaweza kubadilisha wakati wowote', a2: 'Ada za shule kwa Shilingi za Tanzania (TZS)',
    a3: 'Mihula, miaka ya masomo na madaraja yanayoweza kubadilishwa kama CSEE', a4: 'Inafanya kazi kwenye simu janja, kishikwambi au kompyuta yoyote',
    a5: 'Rafiki kwa wote: maandishi makubwa, utofautishaji mkubwa na visoma skrini',
    aboutNote: 'Malipo hurekodiwa na mhasibu wa shule (taslimu, benki au namba za kumbukumbu za pesa kwa simu). Ukusanyaji wa malipo mtandaoni si sehemu ya mfumo huu.',
    contactEyebrow: 'Mawasiliano', contactTitle: 'Una swali? Iandikie ofisi ya shule',
    contactText: 'Uliza kuhusu usajili, akaunti au mfumo. Ofisi itajibu kwa barua pepe au simu.',
    fullName: 'Jina kamili', schoolName: 'Shule au taasisi', schoolHint: 'Si lazima', email: 'Barua pepe', phone: 'Namba ya simu', phoneHint: 'Si lazima — kwa mfano 0777 123 456',
    message: 'Ujumbe',
    send: 'Tuma ujumbe', failed: 'Imeshindikana kutuma ujumbe wako',
    errName: 'Andika jina lako kamili', errEmail: 'Andika barua pepe sahihi', errMessage: 'Andika ujumbe mfupi (angalau herufi 5)',
    sentTitle: 'Asante — ujumbe wako umetumwa', sentText: 'Ofisi ya shule itawasiliana nawe, kwa kawaida ndani ya siku moja ya kazi.',
    sendAnother: 'Tuma ujumbe mwingine', reachUs: 'Wasiliana na ofisi moja kwa moja',
    footerTag: 'Usimamizi wa shule kwa Zanzibar na Tanzania.', footerLinks: 'Gundua', footerAccount: 'Akaunti', footerContact: 'Mawasiliano',
    rights: 'Haki zote zimehifadhiwa.', forgot: 'Umesahau nenosiri',
  },
};

type Key = keyof typeof M.en;
type T = (key: Key, vars?: Record<string, string | number>) => string;

const NAV_LINKS: { id: string; key: Key }[] = [
  { id: 'features', key: 'navFeatures' },
  { id: 'how', key: 'navHow' },
  { id: 'access', key: 'navAccess' },
  { id: 'about', key: 'navAbout' },
  { id: 'contact', key: 'navContact' },
];

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
  const { t: tc } = useI18n();
  const { user } = useAuth();
  const school = useSchool();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  // Arriving with #contact etc. in the URL: scroll there once the page has rendered.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) setTimeout(() => scrollToId(id), 50);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const go = (id: string) => (e?: React.MouseEvent) => {
    e?.preventDefault();
    setMenuOpen(false);
    scrollToId(id);
  };

  return (
    <div className="lp">
      <a href="#lp-main" className="skip-link">{t('skip')}</a>

      <header className="site-header">
        <div className="site-header-inner lp-container">
          <Link to="/home" className="brand" style={{ padding: 0 }}>
            <span className="brand-logo">{school.logoUrl ? <img src={school.logoUrl} alt="" /> : <GraduationCap size={20} aria-hidden />}</span>
            <span style={{ minWidth: 0 }}>
              <span className="brand-name truncate" style={{ display: 'block', maxWidth: '44vw' }}>{school.name}</span>
              <span className="brand-sub" style={{ display: 'block' }}>EduLearn</span>
            </span>
          </Link>
          <nav className="lp-links" aria-label={t('mainNav')}>
            {NAV_LINKS.map((l) => <a key={l.id} href={`#${l.id}`} onClick={go(l.id)}>{t(l.key)}</a>)}
          </nav>
          <div className="lp-actions">
            <span className="lp-hide-md"><LanguageSwitch compact /></span>
            {user ? (
              <Link to="/" className="btn btn-sm btn-primary"><LayoutDashboard size={16} aria-hidden /> {t('goDashboard')}</Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-sm btn-ghost">{tc('signIn')}</Link>
                <Link to="/register" className="btn btn-sm btn-primary lp-hide-sm">{tc('createAccount')}</Link>
              </>
            )}
            <Button
              ref={menuButton}
              variant="ghost"
              iconOnly
              className="lp-burger"
              aria-label={menuOpen ? t('closeMenu') : t('openMenu')}
              aria-expanded={menuOpen}
              aria-controls="lp-mobile-menu"
              onClick={() => setMenuOpen((o) => !o)}
              icon={menuOpen ? <X size={22} /> : <Menu size={22} />}
            />
          </div>
        </div>
        <nav id="lp-mobile-menu" className={`lp-mobile${menuOpen ? ' open' : ''}`} aria-label={t('mainNav')} hidden={!menuOpen}>
          {NAV_LINKS.map((l) => <a key={l.id} href={`#${l.id}`} onClick={go(l.id)}>{t(l.key)}</a>)}
          <div className="row row-wrap" style={{ gap: 10, marginTop: 12 }}>
            <LanguageSwitch />
            {!user && <Link to="/register" className="btn btn-primary">{tc('createAccount')}</Link>}
          </div>
        </nav>
      </header>

      <main id="lp-main">
        <Hero t={t} signedIn={!!user} go={go} />
        <Features t={t} />
        <HowItWorks t={t} />
        <Access t={t} go={go} />
        <About t={t} />
        <Contact t={t} />
      </main>

      <Footer t={t} go={go} />
    </div>
  );
}

function Hero({ t, signedIn, go }: { t: T; signedIn: boolean; go: (id: string) => (e?: React.MouseEvent) => void }) {
  const { t: tc } = useI18n();
  return (
    <section className="lp-hero" aria-labelledby="lp-title">
      <div className="lp-container lp-hero-grid">
        <div>
          <p className="lp-eyebrow">{t('heroEyebrow')}</p>
          <h1 id="lp-title">{t('heroTitle')}</h1>
          <p className="lead">{t('heroText')}</p>
          <div className="lp-hero-ctas">
            {signedIn ? (
              <Link to="/" className="btn btn-lg btn-primary">{t('goDashboard')} <ArrowRight size={18} aria-hidden /></Link>
            ) : (
              <>
                <Link to="/register" className="btn btn-lg btn-primary">{tc('getStarted')} <ArrowRight size={18} aria-hidden /></Link>
                <Link to="/login" className="btn btn-lg">{tc('signIn')}</Link>
              </>
            )}
            <a href="#contact" className="btn btn-lg btn-ghost" onClick={go('contact')}>{tc('contactUs')}</a>
          </div>
          <ul className="lp-points">
            <li><Check size={16} aria-hidden /> {t('heroPoint1')}</li>
            <li><Check size={16} aria-hidden /> {t('heroPoint2')}</li>
            <li><Check size={16} aria-hidden /> {t('heroPoint3')}</li>
          </ul>
        </div>
        <ClassroomPhoto variant="wide" className="lp-photo" />
      </div>
    </section>
  );
}

function SectionHead({ id, eyebrow, title, text }: { id: string; eyebrow: string; title: string; text?: string }) {
  return (
    <div className="lp-head">
      <p className="lp-eyebrow">{eyebrow}</p>
      <h2 id={id}>{title}</h2>
      {text && <p>{text}</p>}
    </div>
  );
}

function Features({ t }: { t: T }) {
  const features: [Key, Key][] = [['f1', 'f1d'], ['f3', 'f3d'], ['f4', 'f4d'], ['f5', 'f5d'], ['f6', 'f6d'], ['f7', 'f7d'], ['f2', 'f2d'], ['f8', 'f8d']];
  return (
    <section id="features" className="lp-section" aria-labelledby="lp-features">
      <div className="lp-container">
        <SectionHead id="lp-features" eyebrow={t('featuresEyebrow')} title={t('featuresTitle')} text={t('featuresText')} />
        <dl className="lp-features">
          {features.map(([title, text]) => (
            <div key={title}>
              <dt>{t(title)}</dt>
              <dd>{t(text)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function HowItWorks({ t }: { t: T }) {
  const roles: { title: Key; steps: Key[] }[] = [
    { title: 'howAdmin', steps: ['howAdmin1', 'howAdmin2', 'howAdmin3'] },
    { title: 'howTeacher', steps: ['howTeacher1', 'howTeacher2', 'howTeacher3'] },
    { title: 'howParent', steps: ['howParent1', 'howParent2', 'howParent3'] },
  ];
  return (
    <section id="how" className="lp-section alt" aria-labelledby="lp-how">
      <div className="lp-container">
        <SectionHead id="lp-how" eyebrow={t('howEyebrow')} title={t('howTitle')} text={t('howText')} />
        <div className="lp-columns">
          {roles.map((r) => (
            <div key={r.title}>
              <h3>{t(r.title)}</h3>
              <ol className="lp-steps">
                {r.steps.map((s) => <li key={s}>{t(s)}</li>)}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Access({ t, go }: { t: T; go: (id: string) => (e?: React.MouseEvent) => void }) {
  const { t: tc } = useI18n();
  return (
    <section id="access" className="lp-section" aria-labelledby="lp-access">
      <div className="lp-container lp-split">
        <div>
          <p className="lp-eyebrow">{t('accessEyebrow')}</p>
          <h2 id="lp-access">{t('accessTitle')}</h2>
          <p className="muted">{t('accessText')}</p>
        </div>
        <div className="lp-panel">
          <ol className="lp-steps numbered">
            <li>{t('access1')}</li>
            <li>{t('access2')}</li>
            <li>{t('access3')}</li>
          </ol>
          <div className="row row-wrap" style={{ gap: 10, marginTop: 20 }}>
            <Link to="/register" className="btn btn-primary">{t('haveInvite')} <ArrowRight size={17} aria-hidden /></Link>
            <Link to="/login" className="btn">{tc('signIn')}</Link>
          </div>
          <p className="small muted" style={{ marginTop: 16 }}>
            {t('accessNoInvite')} <a href="#contact" onClick={go('contact')} className="bold">{tc('contactUs')}</a>
          </p>
        </div>
      </div>
    </section>
  );
}

function About({ t }: { t: T }) {
  const points: Key[] = ['a1', 'a2', 'a3', 'a4', 'a5'];
  return (
    <section id="about" className="lp-section alt" aria-labelledby="lp-about">
      <div className="lp-container lp-split">
        <div>
          <p className="lp-eyebrow">{t('aboutEyebrow')}</p>
          <h2 id="lp-about">{t('aboutTitle')}</h2>
          <p className="muted">{t('aboutText1')}</p>
        </div>
        <div>
          <ul className="lp-checks">
            {points.map((p) => <li key={p}><Check size={18} aria-hidden /> {t(p)}</li>)}
          </ul>
          <p className="small muted lp-note">{t('aboutNote')}</p>
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
      <div className="lp-container lp-split">
        <div>
          <p className="lp-eyebrow">{t('contactEyebrow')}</p>
          <h2 id="lp-contact">{t('contactTitle')}</h2>
          <p className="muted">{t('contactText')}</p>
          {(school.email || school.phone || school.address) && (
            <div className="lp-contact-info">
              <strong className="small">{t('reachUs')}</strong>
              {school.phone && <a href={`tel:${school.phone.replace(/\s/g, '')}`}><Phone size={17} aria-hidden /> {school.phone}</a>}
              {school.email && <a href={`mailto:${school.email}`}><Mail size={17} aria-hidden /> {school.email}</a>}
              {school.address && <span><MapPin size={17} aria-hidden /> {school.address}</span>}
            </div>
          )}
        </div>
        <div className="lp-panel">
          {sent ? (
            <div role="status" style={{ padding: '12px 4px' }}>
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

function Footer({ t, go }: { t: T; go: (id: string) => (e?: React.MouseEvent) => void }) {
  const school = useSchool();
  const { t: tc } = useI18n();
  const year = new Date().getFullYear();
  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer-grid">
          <div>
            <strong style={{ color: 'var(--text)' }}>{school.name}</strong>
            <p style={{ marginTop: 8, maxWidth: 320 }}>{t('footerTag')}</p>
          </div>
          <nav aria-label={t('footerLinks')}>
            <h2>{t('footerLinks')}</h2>
            <ul>{NAV_LINKS.map((l) => <li key={l.id}><a href={`#${l.id}`} onClick={go(l.id)}>{t(l.key)}</a></li>)}</ul>
          </nav>
          <nav aria-label={t('footerAccount')}>
            <h2>{t('footerAccount')}</h2>
            <ul>
              <li><Link to="/login">{tc('signIn')}</Link></li>
              <li><Link to="/register">{tc('createAccount')}</Link></li>
              <li><Link to="/forgot-password">{t('forgot')}</Link></li>
            </ul>
          </nav>
          <div>
            <h2>{t('footerContact')}</h2>
            <ul>
              {school.phone && <li><a href={`tel:${school.phone.replace(/\s/g, '')}`}>{school.phone}</a></li>}
              {school.email && <li><a href={`mailto:${school.email}`}>{school.email}</a></li>}
              {school.address && <li>{school.address}</li>}
              <li><a href="#contact" onClick={go('contact')}>{tc('contactUs')}</a></li>
            </ul>
          </div>
        </div>
        <div className="lp-copy">
          <span>© {year} {school.name}. {t('rights')}</span>
          <LanguageSwitch compact />
        </div>
      </div>
    </footer>
  );
}
