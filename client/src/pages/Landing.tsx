import {
  ArrowRight, AtSign, Award, BarChart3, Bell, CheckCircle2, ClipboardCheck, Eye, FileStack, Gauge, Globe, GraduationCap, Languages,
  LayoutDashboard, Mail, MapPin, Menu, MessageSquare, Phone, School, Send, Share2, ShieldCheck, Smartphone, UserRound, Users,
  Wallet, X, Zap,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Field, Input, Segmented, Textarea } from '../components/ui';
import { api, ApiError, errorMessage } from '../lib/api';
import { useAuth, useSchool } from '../lib/auth';
import { LanguageSwitch, useI18n, useT } from '../lib/i18n';

const M = {
  en: {
    skip: 'Skip to main content',
    navHome: 'Home', navFeatures: 'Features', navAbout: 'About us', navHow: 'How it works', navContact: 'Contact',
    login: 'Log in', goDashboard: 'Go to dashboard', requestDemo: 'Request a demo', getStarted: 'Get started',
    openMenu: 'Open menu', closeMenu: 'Close menu', mainNav: 'Main navigation',
    heroEyebrow: 'School management system for Zanzibar & Tanzania',
    heroTitle: 'Smart School Management. Better Communication. Brighter Futures.',
    heroText: 'An all-in-one digital platform that connects school administrators, teachers, and parents while simplifying academic management and school communication.',
    heroPoint1: 'English & Kiswahili', heroPoint2: 'Fees in TZS', heroPoint3: 'Works on any phone',
    previewLabel: 'Illustration with sample data',
    pvAttendance: 'Attendance today', pvPresent: '{n} of {total} students present',
    pvResults: 'Mid-term average by subject', pvFees: 'Fees collected this term', pvOf: 'of {total}',
    pvParent: 'Parent view', pvAverage: 'Average', pvAttendanceShort: 'Attendance', pvBalance: 'Fee balance',
    pvNotice: 'Mid-term results are out', pvChild: 'Ali · Form 2A',
    featuresEyebrow: 'Features', featuresTitle: 'Everything your school needs, in one place',
    featuresText: 'Replace paper registers, scattered spreadsheets and lost notes with one secure system.',
    f1: 'Student management', f1d: 'Admissions, profiles, photos, classes and guardians in one record.',
    f2: 'Teacher management', f2d: 'Staff records and the subjects and classes each teacher is assigned to.',
    f3: 'Attendance tracking', f3d: 'Take the register in a minute. Parents hear about absences the same day.',
    f4: 'Academic performance', f4d: 'Gradebooks, subject averages and progress across every term.',
    f5: 'Examination management', f5d: 'Set exams, enter marks, grade automatically (e.g. CSEE) and print report cards.',
    f6: 'School fees management', f6d: 'Fee structures, invoices, payments, receipts and balances in TZS.',
    f7: 'Parent communication', f7d: 'Announcements, messages and notifications straight to parents’ phones.',
    f8: 'Reports & analytics', f8d: 'Attendance, academic and financial reports ready to print or open in Excel.',
    howEyebrow: 'How it works', howTitle: 'One platform, three simple experiences',
    howText: 'Everyone signs in to the same system and sees only what belongs to them.',
    howAdmin: 'School administrators', howAdmin1: 'Set up classes, subjects, terms and fees', howAdmin2: 'Register students, teachers and parents', howAdmin3: 'Follow attendance, results and fee collection live',
    howTeacher: 'Teachers', howTeacher1: 'Take the daily register', howTeacher2: 'Set assignments and enter marks', howTeacher3: 'Share class news with parents',
    howParent: 'Parents', howParent1: 'Sign in on any phone', howParent2: 'See attendance, results and homework', howParent3: 'Check fee balances and receipts',
    step: 'Step {n}',
    benefitsEyebrow: 'Benefits', benefitsTitle: 'Why schools choose EduLearn',
    b1: 'Less paperwork', b1d: 'Registers, mark sheets and receipts are kept digitally and safely.',
    b2: 'Better school–parent communication', b2d: 'Parents get timely updates instead of waiting for the end of term.',
    b3: 'Easier academic monitoring', b3d: 'Spot students who need help early, by subject and by class.',
    b4: 'Better record management', b4d: 'Every student’s history in one place, from admission to graduation.',
    b5: 'Faster access to information', b5d: 'Find any student, class or report in seconds.',
    b6: 'More transparency', b6d: 'Clear fee balances, published results and a log of important actions.',
    aboutEyebrow: 'About us', aboutTitle: 'Built for schools in Zanzibar and Tanzania',
    aboutText1: 'EduLearn helps schools spend less time on paperwork and more time on learning. Our vision is that every parent can follow their child’s education, and every school can run on accurate, up-to-date information.',
    aboutText2: 'The platform is designed around the way local schools work:',
    a1: 'English and Kiswahili, switchable at any time', a2: 'School fees in Tanzanian Shillings (TZS)',
    a3: 'Configurable terms, academic years and grading such as CSEE', a4: 'Works on any smartphone, tablet or computer',
    a5: 'Accessible design: large text, high contrast and screen-reader support',
    aboutNote: 'Payments are recorded by the school bursar (cash, bank or mobile-money references). Collecting payments online is not part of the platform.',
    statRoles: 'user roles', statLanguages: 'languages', statDevices: 'any device',
    contactEyebrow: 'Contact', contactTitle: 'Let’s talk about your school',
    contactText: 'Ask a question or book a free demonstration for your management team.',
    kindLabel: 'What would you like?', kindContact: 'Ask a question', kindDemo: 'Request a demo',
    fullName: 'Full name', schoolName: 'School name', email: 'Email', phone: 'Phone number', phoneHint: 'e.g. 0777 123 456',
    message: 'Message', messageDemo: 'Tell us about your school and when suits you for a demonstration.', messageContact: 'How can we help?',
    send: 'Send message', sendDemo: 'Request demo', failed: 'We couldn’t send your message',
    errName: 'Enter your full name', errEmail: 'Enter a valid email address', errMessage: 'Write a short message',
    sentTitle: 'Thank you! Your message has been sent.', sentText: 'We’ll get back to you soon, usually within one working day.',
    sendAnother: 'Send another message', reachUs: 'Reach us directly',
    footerTag: 'Smart school management for Zanzibar and Tanzania.', footerLinks: 'Explore', footerContact: 'Contact',
    footerSocial: 'Follow us', socialSoon: 'Social media pages coming soon', rights: 'All rights reserved.',
  },
  sw: {
    skip: 'Ruka hadi maudhui makuu',
    navHome: 'Nyumbani', navFeatures: 'Huduma', navAbout: 'Kuhusu sisi', navHow: 'Jinsi inavyofanya kazi', navContact: 'Wasiliana nasi',
    login: 'Ingia', goDashboard: 'Nenda kwenye dashibodi', requestDemo: 'Omba onyesho', getStarted: 'Anza sasa',
    openMenu: 'Fungua menyu', closeMenu: 'Funga menyu', mainNav: 'Menyu kuu',
    heroEyebrow: 'Mfumo wa usimamizi wa shule kwa Zanzibar na Tanzania',
    heroTitle: 'Usimamizi Bora wa Shule. Mawasiliano Imara. Mustakabali Mwema.',
    heroText: 'Jukwaa moja la kidijitali linalounganisha wasimamizi wa shule, walimu na wazazi, huku likirahisisha usimamizi wa taaluma na mawasiliano ya shule.',
    heroPoint1: 'Kiingereza na Kiswahili', heroPoint2: 'Ada kwa TZS', heroPoint3: 'Inafanya kazi kwenye simu yoyote',
    previewLabel: 'Mfano wenye data za majaribio',
    pvAttendance: 'Mahudhurio ya leo', pvPresent: 'Wanafunzi {n} kati ya {total} wapo',
    pvResults: 'Wastani wa katikati ya muhula kwa somo', pvFees: 'Ada iliyokusanywa muhula huu', pvOf: 'kati ya {total}',
    pvParent: 'Mwonekano wa mzazi', pvAverage: 'Wastani', pvAttendanceShort: 'Mahudhurio', pvBalance: 'Salio la ada',
    pvNotice: 'Matokeo ya katikati ya muhula yametoka', pvChild: 'Ali · Kidato cha 2A',
    featuresEyebrow: 'Huduma', featuresTitle: 'Kila kitu shule yako inahitaji, mahali pamoja',
    featuresText: 'Badilisha madaftari ya karatasi, majedwali yaliyotawanyika na barua zinazopotea kwa mfumo mmoja salama.',
    f1: 'Usimamizi wa wanafunzi', f1d: 'Usajili, wasifu, picha, madarasa na walezi katika kumbukumbu moja.',
    f2: 'Usimamizi wa walimu', f2d: 'Kumbukumbu za walimu pamoja na masomo na madarasa wanayofundisha.',
    f3: 'Ufuatiliaji wa mahudhurio', f3d: 'Chukua mahudhurio kwa dakika moja. Wazazi hujulishwa siku hiyohiyo mtoto asipofika.',
    f4: 'Maendeleo ya kitaaluma', f4d: 'Daftari la alama, wastani wa masomo na maendeleo kila muhula.',
    f5: 'Usimamizi wa mitihani', f5d: 'Andaa mitihani, ingiza alama, pata madaraja moja kwa moja (mf. CSEE) na chapisha ripoti.',
    f6: 'Usimamizi wa ada za shule', f6d: 'Viwango vya ada, ankara, malipo, stakabadhi na salio kwa TZS.',
    f7: 'Mawasiliano na wazazi', f7d: 'Matangazo, ujumbe na arifa moja kwa moja kwenye simu za wazazi.',
    f8: 'Ripoti na uchambuzi', f8d: 'Ripoti za mahudhurio, taaluma na fedha tayari kuchapishwa au kufunguliwa kwa Excel.',
    howEyebrow: 'Jinsi inavyofanya kazi', howTitle: 'Jukwaa moja, matumizi matatu rahisi',
    howText: 'Kila mtu anaingia kwenye mfumo mmoja na kuona taarifa zinazomhusu tu.',
    howAdmin: 'Wasimamizi wa shule', howAdmin1: 'Andaa madarasa, masomo, mihula na ada', howAdmin2: 'Sajili wanafunzi, walimu na wazazi', howAdmin3: 'Fuatilia mahudhurio, matokeo na makusanyo ya ada papo hapo',
    howTeacher: 'Walimu', howTeacher1: 'Chukua mahudhurio ya kila siku', howTeacher2: 'Toa kazi na ingiza alama', howTeacher3: 'Shirikisha wazazi habari za darasa',
    howParent: 'Wazazi', howParent1: 'Ingia kupitia simu yoyote', howParent2: 'Ona mahudhurio, matokeo na kazi za nyumbani', howParent3: 'Angalia salio la ada na stakabadhi',
    step: 'Hatua ya {n}',
    benefitsEyebrow: 'Faida', benefitsTitle: 'Kwa nini shule zinachagua EduLearn',
    b1: 'Makaratasi machache', b1d: 'Mahudhurio, alama na stakabadhi huhifadhiwa kidijitali kwa usalama.',
    b2: 'Mawasiliano bora kati ya shule na wazazi', b2d: 'Wazazi hupata taarifa kwa wakati badala ya kusubiri mwisho wa muhula.',
    b3: 'Ufuatiliaji rahisi wa taaluma', b3d: 'Tambua mapema wanafunzi wanaohitaji msaada, kwa somo na kwa darasa.',
    b4: 'Utunzaji bora wa kumbukumbu', b4d: 'Historia ya kila mwanafunzi mahali pamoja, tangu kujiunga hadi kuhitimu.',
    b5: 'Upatikanaji wa haraka wa taarifa', b5d: 'Pata mwanafunzi, darasa au ripoti yoyote kwa sekunde chache.',
    b6: 'Uwazi zaidi', b6d: 'Salio la ada lililo wazi, matokeo yaliyotangazwa na kumbukumbu za shughuli muhimu.',
    aboutEyebrow: 'Kuhusu sisi', aboutTitle: 'Imejengwa kwa ajili ya shule za Zanzibar na Tanzania',
    aboutText1: 'EduLearn inasaidia shule kutumia muda mchache kwenye makaratasi na muda mwingi zaidi kwenye ujifunzaji. Dira yetu ni kwamba kila mzazi aweze kufuatilia elimu ya mtoto wake, na kila shule iendeshwe kwa taarifa sahihi na za wakati.',
    aboutText2: 'Mfumo umeundwa kulingana na jinsi shule za hapa zinavyofanya kazi:',
    a1: 'Kiingereza na Kiswahili, unaweza kubadilisha wakati wowote', a2: 'Ada za shule kwa Shilingi za Tanzania (TZS)',
    a3: 'Mihula, miaka ya masomo na madaraja yanayoweza kubadilishwa kama CSEE', a4: 'Inafanya kazi kwenye simu janja, kishikwambi au kompyuta yoyote',
    a5: 'Muundo rafiki kwa wote: maandishi makubwa, utofautishaji mkubwa na visoma skrini',
    aboutNote: 'Malipo hurekodiwa na mhasibu wa shule (taslimu, benki au namba za kumbukumbu za pesa kwa simu). Ukusanyaji wa malipo mtandaoni si sehemu ya mfumo huu.',
    statRoles: 'aina za watumiaji', statLanguages: 'lugha', statDevices: 'kifaa chochote',
    contactEyebrow: 'Wasiliana nasi', contactTitle: 'Tuzungumze kuhusu shule yako',
    contactText: 'Uliza swali au omba onyesho la bure kwa timu ya uongozi wa shule yako.',
    kindLabel: 'Ungependa nini?', kindContact: 'Uliza swali', kindDemo: 'Omba onyesho',
    fullName: 'Jina kamili', schoolName: 'Jina la shule', email: 'Barua pepe', phone: 'Namba ya simu', phoneHint: 'mf. 0777 123 456',
    message: 'Ujumbe', messageDemo: 'Tueleze kuhusu shule yako na muda unaokufaa kwa onyesho.', messageContact: 'Tunawezaje kukusaidia?',
    send: 'Tuma ujumbe', sendDemo: 'Omba onyesho', failed: 'Imeshindikana kutuma ujumbe wako',
    errName: 'Andika jina lako kamili', errEmail: 'Andika barua pepe sahihi', errMessage: 'Andika ujumbe mfupi',
    sentTitle: 'Asante! Ujumbe wako umetumwa.', sentText: 'Tutawasiliana nawe hivi karibuni, kwa kawaida ndani ya siku moja ya kazi.',
    sendAnother: 'Tuma ujumbe mwingine', reachUs: 'Wasiliana nasi moja kwa moja',
    footerTag: 'Usimamizi bora wa shule kwa Zanzibar na Tanzania.', footerLinks: 'Gundua', footerContact: 'Mawasiliano',
    footerSocial: 'Tufuate', socialSoon: 'Kurasa za mitandao ya kijamii zinakuja hivi karibuni', rights: 'Haki zote zimehifadhiwa.',
  },
};

type Key = keyof typeof M.en;

const CSS = `
.lp { background: var(--bg); color: var(--text); min-height: 100vh; }
.lp a:hover { text-decoration: none; }
.lp-container { width: 100%; max-width: 1180px; margin: 0 auto; padding: 0 20px; }
.lp-nav { position: sticky; top: 0; z-index: 50; background: color-mix(in srgb, var(--surface) 92%, transparent); backdrop-filter: saturate(180%) blur(12px); border-bottom: 1px solid var(--border); }
.lp-nav-inner { display: flex; align-items: center; gap: 16px; height: 68px; }
.lp-brand { display: flex; align-items: center; gap: 10px; color: var(--text); font-weight: 800; font-size: 1.15rem; }
.lp-brand .mark { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: var(--primary); color: #fff; }
.lp-links { display: flex; gap: 4px; margin-left: 12px; }
.lp-links a { padding: 8px 12px; border-radius: 10px; color: var(--text-muted); font-weight: 600; font-size: 0.92rem; }
.lp-links a:hover { color: var(--text); background: var(--surface-hover); }
.lp-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.lp-burger { display: none; }
.lp-mobile { display: none; border-top: 1px solid var(--border); padding: 12px 20px 20px; background: var(--surface); }
.lp-mobile a { display: block; padding: 12px 8px; border-radius: 10px; color: var(--text); font-weight: 600; }
.lp-mobile a:hover { background: var(--surface-hover); }
.lp-hero { position: relative; overflow: hidden; color: #fff; background: linear-gradient(160deg, var(--hero-from), var(--hero-to)); }
.lp-hero::before { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 85% 20%, color-mix(in srgb, var(--accent) 38%, transparent), transparent 45%); pointer-events: none; }
.lp-hero-grid { position: relative; display: grid; grid-template-columns: 1.05fr 1fr; gap: 48px; align-items: center; padding: 72px 20px 88px; }
.lp-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
.lp-hero .lp-eyebrow { color: #7ee7dc; background: rgba(255,255,255,0.08); padding: 6px 12px; border-radius: 999px; }
.lp-hero h1 { font-size: clamp(2rem, 4.2vw, 3.1rem); line-height: 1.12; letter-spacing: -0.03em; margin: 18px 0 18px; color: #fff; }
.lp-hero p.lead { font-size: 1.1rem; line-height: 1.65; color: rgba(255,255,255,0.86); max-width: 560px; }
.lp-hero-ctas { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }
.lp-hero .btn-light { background: #fff; color: var(--hero-from); border-color: #fff; }
.lp-hero .btn-light:hover:not(:disabled) { background: #eef2f9; }
.lp-hero .btn-outline-light { background: transparent; color: #fff; border-color: rgba(255,255,255,0.45); }
.lp-hero .btn-outline-light:hover:not(:disabled) { background: rgba(255,255,255,0.1); }
.lp-points { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 28px; color: rgba(255,255,255,0.88); font-size: 0.92rem; font-weight: 600; }
.lp-points span { display: inline-flex; align-items: center; gap: 7px; }
.lp-preview { position: relative; margin: 0; }
.lp-preview figcaption { position: absolute; top: -30px; right: 0; font-size: 0.75rem; color: rgba(255,255,255,0.7); display: inline-flex; gap: 6px; align-items: center; }
.lp-board { background: var(--surface); color: var(--text); border-radius: 18px; padding: 18px; box-shadow: 0 30px 60px -20px rgba(0,0,0,0.45); display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.lp-board .tile { background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
.lp-board .tile.wide { grid-column: span 2; }
.lp-board .label { font-size: 0.74rem; color: var(--text-muted); font-weight: 600; }
.lp-board .big { font-size: 1.6rem; font-weight: 800; letter-spacing: -0.02em; }
.lp-bars { display: flex; align-items: flex-end; gap: 8px; height: 84px; margin-top: 10px; }
.lp-bars div { flex: 1; border-radius: 6px 6px 2px 2px; background: var(--primary); opacity: 0.9; }
.lp-bars div:nth-child(even) { background: var(--accent); }
.lp-bar-labels { display: flex; gap: 8px; font-size: 0.65rem; color: var(--text-subtle); margin-top: 4px; }
.lp-bar-labels span { flex: 1; text-align: center; }
.lp-track { height: 8px; border-radius: 4px; background: var(--surface-hover); margin-top: 10px; overflow: hidden; }
.lp-track span { display: block; height: 100%; border-radius: 4px; background: var(--success); }
.lp-phone { position: absolute; right: -18px; bottom: -42px; width: 190px; background: #0b1325; border-radius: 28px; padding: 10px; box-shadow: 0 24px 50px -16px rgba(0,0,0,0.55); }
.lp-phone .screen { background: var(--surface); color: var(--text); border-radius: 20px; padding: 14px 12px; font-size: 0.75rem; }
.lp-phone .notch { width: 60px; height: 6px; border-radius: 3px; background: #1c2742; margin: 0 auto 8px; }
.lp-phone .row2 { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid var(--border); }
.lp-phone .row2:last-child { border-bottom: 0; }
.lp-phone .notice { display: flex; gap: 6px; align-items: flex-start; background: var(--primary-soft); color: var(--primary); padding: 8px; border-radius: 10px; font-weight: 600; margin-top: 8px; }
.lp-section { padding: 88px 0; scroll-margin-top: 68px; }
.lp-section.alt { background: var(--surface); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.lp-head { max-width: 680px; margin: 0 auto 44px; text-align: center; }
.lp-head h2 { font-size: clamp(1.6rem, 3vw, 2.25rem); margin: 10px 0 12px; letter-spacing: -0.02em; }
.lp-head p { color: var(--text-muted); font-size: 1.05rem; line-height: 1.6; }
.lp-grid { display: grid; gap: 18px; }
.lp-grid.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.lp-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.lp-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 22px; transition: border-color var(--dur), box-shadow var(--dur), transform var(--dur); }
.lp-card:hover { border-color: color-mix(in srgb, var(--primary) 35%, var(--border)); box-shadow: var(--shadow); }
.lp-section.alt .lp-card { background: var(--bg); }
.lp-card h3 { font-size: 1.02rem; margin: 14px 0 6px; }
.lp-card p { color: var(--text-muted); font-size: 0.92rem; line-height: 1.6; }
.lp-icon { width: 46px; height: 46px; border-radius: 13px; display: grid; place-items: center; background: var(--primary-soft); color: var(--primary); }
.lp-icon.teal { background: color-mix(in srgb, var(--accent) 14%, var(--surface)); color: var(--accent); }
.lp-steps { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 12px; }
.lp-steps li { display: flex; gap: 12px; align-items: flex-start; }
.lp-steps .num { width: 28px; height: 28px; border-radius: 50%; flex: none; display: grid; place-items: center; background: var(--primary); color: #fff; font-size: 0.8rem; font-weight: 700; }
.lp-steps small { display: block; font-size: 0.72rem; color: var(--text-subtle); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
.lp-about { display: grid; grid-template-columns: 1.1fr 1fr; gap: 48px; align-items: center; }
.lp-about h2 { font-size: clamp(1.6rem, 3vw, 2.2rem); margin: 10px 0 16px; letter-spacing: -0.02em; }
.lp-about p { color: var(--text-muted); line-height: 1.7; }
.lp-checks { list-style: none; padding: 0; margin: 18px 0; display: grid; gap: 10px; }
.lp-checks li { display: flex; gap: 10px; align-items: flex-start; font-weight: 500; }
.lp-checks svg { color: var(--accent); flex: none; margin-top: 2px; }
.lp-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.lp-stat { background: var(--hero-from); color: #fff; border-radius: 16px; padding: 22px 18px; }
.lp-stat strong { display: block; font-size: 2rem; letter-spacing: -0.02em; }
.lp-stat span { color: rgba(255,255,255,0.8); font-size: 0.85rem; }
.lp-contact { display: grid; grid-template-columns: 1fr 1.4fr; gap: 40px; align-items: start; }
.lp-contact-info { display: grid; gap: 14px; margin-top: 22px; }
.lp-contact-info a, .lp-contact-info span { display: flex; gap: 10px; align-items: center; color: var(--text); font-weight: 500; }
.lp-form { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 26px; box-shadow: var(--shadow); }
.lp-honeypot { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
.lp-footer { background: var(--hero-from); color: rgba(255,255,255,0.82); padding: 56px 0 28px; }
.lp-footer h3 { color: #fff; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 14px; }
.lp-footer a { color: rgba(255,255,255,0.82); }
.lp-footer a:hover { color: #fff; }
.lp-footer-grid { display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr; gap: 32px; }
.lp-footer ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; font-size: 0.92rem; }
.lp-social { display: flex; gap: 10px; }
.lp-social span { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.6); cursor: default; }
.lp-copy { border-top: 1px solid rgba(255,255,255,0.12); margin-top: 40px; padding-top: 20px; font-size: 0.85rem; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
@media (max-width: 1060px) {
  .lp-links { display: none; }
  .lp-burger { display: inline-flex; }
  .lp-mobile.open { display: block; }
  .lp-hide-sm { display: none !important; }
  .lp-grid.four { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 900px) {
  .lp-hero-grid, .lp-about, .lp-contact { grid-template-columns: 1fr; }
  .lp-hero-grid { padding: 48px 20px 96px; }
  .lp-grid.three { grid-template-columns: 1fr; }
  .lp-footer-grid { grid-template-columns: 1fr 1fr; }
  .lp-phone { right: 8px; bottom: -64px; width: 168px; }
}
@media (max-width: 560px) {
  .lp-grid.four { grid-template-columns: 1fr; }
  .lp-board { grid-template-columns: 1fr; }
  .lp-board .tile.wide { grid-column: auto; }
  .lp-phone { display: none; }
  .lp-stats { grid-template-columns: 1fr; }
  .lp-footer-grid { grid-template-columns: 1fr; }
  .lp-section { padding: 64px 0; }
  .lp-form { padding: 18px; }
  .lp-actions .lp-login-text { display: none; }
}
`;

const NAV_LINKS: { id: string; key: Key }[] = [
  { id: 'home', key: 'navHome' },
  { id: 'features', key: 'navFeatures' },
  { id: 'how', key: 'navHow' },
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
}

export function LandingPage() {
  const t = useT(M);
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [kind, setKind] = useState<'contact' | 'demo'>('contact');
  const menuButton = useRef<HTMLButtonElement>(null);

  // Arriving with #features etc. in the URL: scroll there once the page has rendered.
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

  const requestDemo = (e?: React.MouseEvent) => {
    setKind('demo');
    go('contact')(e);
  };

  return (
    <div className="lp">
      <style>{CSS}</style>
      <a href="#lp-main" className="skip-link">{t('skip')}</a>

      <header className="lp-nav">
        <div className="lp-container lp-nav-inner">
          <a href="#home" className="lp-brand" onClick={go('home')}>
            <span className="mark" aria-hidden><GraduationCap size={21} /></span>
            EduLearn
          </a>
          <nav className="lp-links" aria-label={t('mainNav')}>
            {NAV_LINKS.map((l) => (
              <a key={l.id} href={`#${l.id}`} onClick={go(l.id)}>{t(l.key)}</a>
            ))}
          </nav>
          <div className="lp-actions">
            <span className="lp-hide-sm"><LanguageSwitch compact /></span>
            {user ? (
              <Link to="/" className="btn btn-sm"><LayoutDashboard size={16} aria-hidden /> <span className="lp-login-text">{t('goDashboard')}</span></Link>
            ) : (
              <Link to="/login" className="btn btn-sm btn-ghost">{t('login')}</Link>
            )}
            <a href="#contact" className="btn btn-sm btn-primary lp-hide-sm" onClick={requestDemo}>{t('requestDemo')}</a>
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
          {NAV_LINKS.map((l) => (
            <a key={l.id} href={`#${l.id}`} onClick={go(l.id)}>{t(l.key)}</a>
          ))}
          <div className="row row-wrap" style={{ gap: 10, marginTop: 12 }}>
            <LanguageSwitch />
            <a href="#contact" className="btn btn-primary" onClick={requestDemo}>{t('requestDemo')}</a>
          </div>
        </nav>
      </header>

      <main id="lp-main">
        <Hero t={t} onDemo={requestDemo} signedIn={!!user} />
        <Features t={t} />
        <HowItWorks t={t} />
        <Benefits t={t} />
        <About t={t} />
        <Contact t={t} kind={kind} setKind={setKind} />
      </main>

      <Footer t={t} go={go} />
    </div>
  );
}

type T = (key: Key, vars?: Record<string, string | number>) => string;

function Hero({ t, onDemo, signedIn }: { t: T; onDemo: (e?: React.MouseEvent) => void; signedIn: boolean }) {
  return (
    <section id="home" className="lp-hero" style={{ scrollMarginTop: 68 }}>
      <div className="lp-container lp-hero-grid">
        <div>
          <span className="lp-eyebrow"><School size={15} aria-hidden /> {t('heroEyebrow')}</span>
          <h1>{t('heroTitle')}</h1>
          <p className="lead">{t('heroText')}</p>
          <div className="lp-hero-ctas">
            <Link to={signedIn ? '/' : '/login'} className="btn btn-lg btn-light">
              {signedIn ? t('goDashboard') : t('getStarted')} <ArrowRight size={18} aria-hidden />
            </Link>
            <a href="#contact" className="btn btn-lg btn-outline-light" onClick={onDemo}>{t('requestDemo')}</a>
          </div>
          <div className="lp-points">
            <span><Languages size={17} aria-hidden /> {t('heroPoint1')}</span>
            <span><Wallet size={17} aria-hidden /> {t('heroPoint2')}</span>
            <span><Smartphone size={17} aria-hidden /> {t('heroPoint3')}</span>
          </div>
        </div>
        <DashboardPreview t={t} />
      </div>
    </section>
  );
}

/** A hand-built mock of the product (not live data), clearly captioned as an illustration. */
function DashboardPreview({ t }: { t: T }) {
  const { locale } = useI18n();
  const tzs = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
  const bars = [
    { s: 'MATH', v: 62 }, { s: 'ENG', v: 71 }, { s: 'KISW', v: 84 }, { s: 'BIO', v: 66 }, { s: 'CHEM', v: 58 }, { s: 'GEO', v: 74 },
  ];
  return (
    <figure className="lp-preview">
      <figcaption><Eye size={13} aria-hidden /> {t('previewLabel')}</figcaption>
      <div className="lp-board" aria-hidden>
        <div className="tile">
          <div className="label">{t('pvAttendance')}</div>
          <div className="big" style={{ color: 'var(--success)' }}>96.4%</div>
          <div className="tiny muted">{t('pvPresent', { n: 112, total: 117 })}</div>
        </div>
        <div className="tile">
          <div className="label">{t('pvFees')}</div>
          <div className="big" style={{ fontSize: '1.15rem', marginTop: 4 }}>{tzs(31_450_000)}</div>
          <div className="tiny muted">{t('pvOf', { total: tzs(42_000_000) })}</div>
          <div className="lp-track"><span style={{ width: '75%' }} /></div>
        </div>
        <div className="tile wide">
          <div className="label">{t('pvResults')}</div>
          <div className="lp-bars">{bars.map((b) => <div key={b.s} style={{ height: `${b.v}%` }} />)}</div>
          <div className="lp-bar-labels">{bars.map((b) => <span key={b.s}>{b.s}</span>)}</div>
        </div>
      </div>
      <div className="lp-phone" aria-hidden>
        <div className="screen">
          <div className="notch" />
          <div className="tiny muted bold" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('pvParent')}</div>
          <div className="bold" style={{ fontSize: '0.85rem', margin: '4px 0 6px' }}>{t('pvChild')}</div>
          <div className="row2"><span className="muted">{t('pvAverage')}</span><strong style={{ color: 'var(--success)' }}>72% · B</strong></div>
          <div className="row2"><span className="muted">{t('pvAttendanceShort')}</span><strong>95%</strong></div>
          <div className="row2"><span className="muted">{t('pvBalance')}</span><strong style={{ color: 'var(--warning)' }}>{tzs(180_000)}</strong></div>
          <div className="notice"><Bell size={13} style={{ flex: 'none', marginTop: 1 }} /> {t('pvNotice')}</div>
        </div>
      </div>
    </figure>
  );
}

function SectionHead({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="lp-head">
      <span className="lp-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </div>
  );
}

function Features({ t }: { t: T }) {
  const features: { icon: ReactNode; title: Key; text: Key; teal?: boolean }[] = [
    { icon: <GraduationCap size={22} />, title: 'f1', text: 'f1d' },
    { icon: <UserRound size={22} />, title: 'f2', text: 'f2d', teal: true },
    { icon: <ClipboardCheck size={22} />, title: 'f3', text: 'f3d' },
    { icon: <BarChart3 size={22} />, title: 'f4', text: 'f4d', teal: true },
    { icon: <Award size={22} />, title: 'f5', text: 'f5d' },
    { icon: <Wallet size={22} />, title: 'f6', text: 'f6d', teal: true },
    { icon: <MessageSquare size={22} />, title: 'f7', text: 'f7d' },
    { icon: <FileStack size={22} />, title: 'f8', text: 'f8d', teal: true },
  ];
  return (
    <section id="features" className="lp-section">
      <div className="lp-container">
        <SectionHead eyebrow={t('featuresEyebrow')} title={t('featuresTitle')} text={t('featuresText')} />
        <div className="lp-grid four">
          {features.map((f) => (
            <article key={f.title} className="lp-card">
              <span className={`lp-icon${f.teal ? ' teal' : ''}`} aria-hidden>{f.icon}</span>
              <h3>{t(f.title)}</h3>
              <p>{t(f.text)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks({ t }: { t: T }) {
  const roles: { icon: ReactNode; title: Key; steps: Key[] }[] = [
    { icon: <School size={22} />, title: 'howAdmin', steps: ['howAdmin1', 'howAdmin2', 'howAdmin3'] },
    { icon: <UserRound size={22} />, title: 'howTeacher', steps: ['howTeacher1', 'howTeacher2', 'howTeacher3'] },
    { icon: <Users size={22} />, title: 'howParent', steps: ['howParent1', 'howParent2', 'howParent3'] },
  ];
  return (
    <section id="how" className="lp-section alt">
      <div className="lp-container">
        <SectionHead eyebrow={t('howEyebrow')} title={t('howTitle')} text={t('howText')} />
        <div className="lp-grid three">
          {roles.map((r, i) => (
            <article key={r.title} className="lp-card">
              <span className={`lp-icon${i === 1 ? ' teal' : ''}`} aria-hidden>{r.icon}</span>
              <h3>{t(r.title)}</h3>
              <ol className="lp-steps">
                {r.steps.map((s, n) => (
                  <li key={s}>
                    <span className="num" aria-hidden>{n + 1}</span>
                    <span>
                      <small>{t('step', { n: n + 1 })}</small>
                      {t(s)}
                    </span>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Benefits({ t }: { t: T }) {
  const items: { icon: ReactNode; title: Key; text: Key }[] = [
    { icon: <FileStack size={20} />, title: 'b1', text: 'b1d' },
    { icon: <MessageSquare size={20} />, title: 'b2', text: 'b2d' },
    { icon: <Gauge size={20} />, title: 'b3', text: 'b3d' },
    { icon: <ShieldCheck size={20} />, title: 'b4', text: 'b4d' },
    { icon: <Zap size={20} />, title: 'b5', text: 'b5d' },
    { icon: <Eye size={20} />, title: 'b6', text: 'b6d' },
  ];
  return (
    <section className="lp-section" aria-labelledby="lp-benefits">
      <div className="lp-container">
        <div className="lp-head">
          <span className="lp-eyebrow">{t('benefitsEyebrow')}</span>
          <h2 id="lp-benefits">{t('benefitsTitle')}</h2>
        </div>
        <div className="lp-grid three">
          {items.map((b) => (
            <article key={b.title} className="lp-card" style={{ display: 'flex', gap: 16 }}>
              <span className="lp-icon teal" aria-hidden style={{ flex: 'none' }}>{b.icon}</span>
              <div>
                <h3 style={{ marginTop: 2 }}>{t(b.title)}</h3>
                <p>{t(b.text)}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function About({ t }: { t: T }) {
  const points: Key[] = ['a1', 'a2', 'a3', 'a4', 'a5'];
  return (
    <section id="about" className="lp-section alt">
      <div className="lp-container lp-about">
        <div>
          <span className="lp-eyebrow">{t('aboutEyebrow')}</span>
          <h2>{t('aboutTitle')}</h2>
          <p>{t('aboutText1')}</p>
          <p style={{ marginTop: 14 }}>{t('aboutText2')}</p>
          <ul className="lp-checks">
            {points.map((p) => (
              <li key={p}><CheckCircle2 size={19} aria-hidden /> {t(p)}</li>
            ))}
          </ul>
          <p className="small" style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 12 }}>{t('aboutNote')}</p>
        </div>
        <div className="lp-stats">
          <div className="lp-stat"><strong>4</strong><span>{t('statRoles')}</span></div>
          <div className="lp-stat" style={{ background: 'var(--accent)' }}><strong>2</strong><span>{t('statLanguages')}</span></div>
          <div className="lp-stat"><strong><Smartphone size={30} aria-hidden /></strong><span>{t('statDevices')}</span></div>
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

function Contact({ t, kind, setKind }: { t: T; kind: 'contact' | 'demo'; setKind: (k: 'contact' | 'demo') => void }) {
  const school = useSchool();
  const [form, setForm] = useState<ContactForm>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k: keyof ContactForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (form.fullName.trim().length < 2) errs.fullName = t('errName');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = t('errEmail');
    if (form.message.trim().length < 5) errs.message = t('errMessage');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/contact', {
        kind,
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
    <section id="contact" className="lp-section">
      <div className="lp-container lp-contact">
        <div>
          <span className="lp-eyebrow">{t('contactEyebrow')}</span>
          <h2 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', margin: '10px 0 12px', letterSpacing: '-0.02em' }}>{t('contactTitle')}</h2>
          <p className="muted" style={{ lineHeight: 1.65 }}>{t('contactText')}</p>
          {(school.email || school.phone || school.address) && (
            <div className="lp-contact-info">
              <strong className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('reachUs')}</strong>
              {school.phone && <a href={`tel:${school.phone.replace(/\s/g, '')}`}><Phone size={18} aria-hidden /> {school.phone}</a>}
              {school.email && <a href={`mailto:${school.email}`}><Mail size={18} aria-hidden /> {school.email}</a>}
              {school.address && <span><MapPin size={18} aria-hidden /> {school.address}</span>}
            </div>
          )}
        </div>
        <div className="lp-form">
          {sent ? (
            <div role="status" style={{ textAlign: 'center', padding: '24px 8px' }}>
              <span className="empty-icon" style={{ background: 'var(--success-soft)', color: 'var(--success)' }} aria-hidden>
                <CheckCircle2 size={28} />
              </span>
              <h3 style={{ fontSize: '1.2rem' }}>{t('sentTitle')}</h3>
              <p className="muted" style={{ margin: '8px 0 18px' }}>{t('sentText')}</p>
              <Button onClick={() => setSent(false)}>{t('sendAnother')}</Button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="stack">
              <div className="row row-wrap between" style={{ gap: 10 }}>
                <span className="bold small">{t('kindLabel')}</span>
                <Segmented<'contact' | 'demo'>
                  label={t('kindLabel')}
                  value={kind}
                  onChange={setKind}
                  options={[{ value: 'contact', label: t('kindContact') }, { value: 'demo', label: t('kindDemo') }]}
                />
              </div>
              {error && <Alert tone="danger" title={t('failed')}>{error}</Alert>}
              <div className="form-grid">
                <Field label={t('fullName')} error={errors.fullName} required>
                  <Input value={form.fullName} onChange={set('fullName')} autoComplete="name" />
                </Field>
                <Field label={t('schoolName')} error={errors.schoolName}>
                  <Input value={form.schoolName} onChange={set('schoolName')} autoComplete="organization" />
                </Field>
                <Field label={t('email')} error={errors.email} required>
                  <Input type="email" value={form.email} onChange={set('email')} autoComplete="email" />
                </Field>
                <Field label={t('phone')} error={errors.phone} hint={t('phoneHint')}>
                  <Input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
                </Field>
                <Field label={t('message')} error={errors.message} required className="span-2">
                  <Textarea value={form.message} onChange={set('message')} placeholder={kind === 'demo' ? t('messageDemo') : t('messageContact')} />
                </Field>
              </div>
              {/* Honeypot: hidden from people and screen readers; bots that fill it are rejected. */}
              <div className="lp-honeypot" aria-hidden="true">
                <label>
                  Website
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
                </label>
              </div>
              <Button type="submit" variant="primary" size="lg" loading={busy} icon={<Send size={18} />}>
                {kind === 'demo' ? t('sendDemo') : t('send')}
              </Button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function Footer({ t, go }: { t: T; go: (id: string) => (e?: React.MouseEvent) => void }) {
  const school = useSchool();
  const year = new Date().getFullYear();
  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer-grid">
          <div>
            <div className="lp-brand" style={{ color: '#fff' }}>
              <span className="mark" aria-hidden style={{ background: 'var(--accent)' }}><GraduationCap size={21} /></span>
              EduLearn
            </div>
            <p style={{ marginTop: 14, maxWidth: 320 }}>{t('footerTag')}</p>
          </div>
          <div>
            <h3>{t('footerLinks')}</h3>
            <ul>
              {NAV_LINKS.map((l) => (
                <li key={l.id}><a href={`#${l.id}`} onClick={go(l.id)}>{t(l.key)}</a></li>
              ))}
              <li><Link to="/login">{t('login')}</Link></li>
            </ul>
          </div>
          <div>
            <h3>{t('footerContact')}</h3>
            <ul>
              {school.phone && <li><a href={`tel:${school.phone.replace(/\s/g, '')}`}>{school.phone}</a></li>}
              {school.email && <li><a href={`mailto:${school.email}`}>{school.email}</a></li>}
              {school.address && <li>{school.address}</li>}
              <li><a href="#contact" onClick={go('contact')}>{t('navContact')}</a></li>
            </ul>
          </div>
          <div>
            <h3>{t('footerSocial')}</h3>
            <div className="lp-social" role="group" aria-label={t('socialSoon')}>
              <span title={t('socialSoon')} aria-hidden><Globe size={18} /></span>
              <span title={t('socialSoon')} aria-hidden><Share2 size={18} /></span>
              <span title={t('socialSoon')} aria-hidden><AtSign size={18} /></span>
            </div>
            <p className="small" style={{ marginTop: 10 }}>{t('socialSoon')}</p>
          </div>
        </div>
        <div className="lp-copy">
          <span>© {year} EduLearn. {t('rights')}</span>
          <LanguageSwitch compact />
        </div>
      </div>
    </footer>
  );
}
