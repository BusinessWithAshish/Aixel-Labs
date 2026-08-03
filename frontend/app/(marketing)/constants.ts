/** Marketing home SSOT — URLs, labels, brand assets, section anchors, motion. */

const IS_DEV = process.env.NODE_ENV === 'development';

/** SaaS app origin — local tenant vs production. */
export const APP_URL = IS_DEV ? 'http://dev.localhost:3003' : 'https://app.aixellabs.in';
export const APP_HOST = IS_DEV ? 'dev.localhost:3003' : 'app.aixellabs.in';
/** Sign-in always lands on the app (same origin as Start free). */
export const SIGN_IN_URL = APP_URL;
export const CONTACT_EMAIL = 'hello@aixellabs.in' as const;
export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}` as const;

export const WELCOME_CODE = 'WELCOME1000' as const;

export const BOOKING_WEBHOOK_FALLBACK = 'https://hook.eu2.make.com/hydrcl8a20ar8lht6c2kme9beuc8lctr' as const;

export const BOOKING_WEBHOOK = process.env.NEXT_PUBLIC_AIXELLABS_BOOKING_CALL_WEBHOOK ?? BOOKING_WEBHOOK_FALLBACK;

/** Product / source logos used in hero, bento, stats, use-cases. */
export const BRAND_LOGOS = {
    googleMaps: '/brand-logos/google-maps.svg',
    instagram: '/brand-logos/instagram.svg',
    linkedin: '/brand-logos/linkedin.svg',
    facebook: '/brand-logos/facebook.svg',
} as const;

export const GOOGLE_LOGO = '/google-logo.png' as const;

/**
 * Full lockup: stylized A + "ixel Labs" (the mark is the letter A).
 * Prefer this in nav/footer instead of mark + separate text.
 */
export const AIXEL_WORDMARK = '/aixellabs-wordmark.png' as const;

/** Splash intro videos — one is picked at random per page load. */
export const SPLASH_VIDEOS = [
    '/landing-preview/Logo-Assemble.mp4',
    '/landing-preview/Logo-Draw.mp4',
    '/landing-preview/Logo-Orbit.mp4',
] as const;

/**
 * Mid-market / SMB names for the logo strip — teams that actually buy lead gen.
 * Rendered as wordmarks (not famous brand marks).
 */
export const TRUSTED_COMPANIES = [
    'FieldLine HVAC',
    'Harbor Dental Group',
    'Ridgeway Realty',
    'Cobalt Staffing',
    'Meridian Clinics',
    'VoltShift Solar',
    'Quorum Insurance',
    'Northwind Outreach',
    'Pane & Post',
    'Brightline MedSpa',
    'Atlas Home Care',
    'LeadHaus Agency',
] as const;

/** Core lead-gen sources shown across hero, product, pillars, stats. */
export const LEAD_SOURCES = [
    { key: 'maps', src: BRAND_LOGOS.googleMaps, label: 'Google Maps', short: 'Maps' },
    { key: 'instagram', src: BRAND_LOGOS.instagram, label: 'Instagram', short: 'Instagram' },
    { key: 'linkedin', src: BRAND_LOGOS.linkedin, label: 'LinkedIn', short: 'LinkedIn' },
    { key: 'facebook', src: BRAND_LOGOS.facebook, label: 'Facebook', short: 'Facebook' },
] as const;

export const SECTION_IDS = {
    hero: 'hero',
    product: 'product',
    why: 'why',
    consultancy: 'consultancy',
    customers: 'customers',
    getStarted: 'get-started',
} as const;

/** Sections that update the URL hash while scrolling (hero clears the hash). */
export const SCROLL_HASH_SECTIONS = [
    SECTION_IDS.hero,
    SECTION_IDS.why,
    SECTION_IDS.product,
    SECTION_IDS.consultancy,
    SECTION_IDS.customers,
    SECTION_IDS.getStarted,
] as const;

export const NAV_LINKS = [
    { label: 'Product', href: `#${SECTION_IDS.product}` },
    { label: 'Solutions', href: `#${SECTION_IDS.why}` },
    { label: 'Consultancy', href: `#${SECTION_IDS.consultancy}` },
    { label: 'Customers', href: `#${SECTION_IDS.customers}` },
] as const;

export const LABELS = {
    startFree: 'Start free',
    bookCall: 'Book a call with us',
    bookCallShort: 'Book a call',
    saveAndRun: 'Save and Run',
    signIn: 'Sign in',
} as const;

export const TRUST = {
    noCard: 'No credit card required',
    welcomePrefix: '1,000 free leads with',
    codeUnlocks: 'Code unlocks 1,000 free leads',
    agencyAnytime: 'Talk to the agency anytime',
} as const;

export const HERO_TRUST = [
    { label: TRUST.noCard, highlight: null },
    { label: TRUST.welcomePrefix, highlight: WELCOME_CODE },
    { label: TRUST.agencyAnytime, highlight: null },
] as const;

/** Booking drawer options — SSOT for form selects. */
export const BOOKING_TIME_SLOTS = [
    '9:00 AM',
    '9:30 AM',
    '10:00 AM',
    '10:30 AM',
    '11:00 AM',
    '11:30 AM',
    '12:00 PM',
    '12:30 PM',
    '1:00 PM',
    '1:30 PM',
    '2:00 PM',
    '2:30 PM',
    '3:00 PM',
    '3:30 PM',
    '4:00 PM',
    '4:30 PM',
    '5:00 PM',
    '5:30 PM',
] as const;

export const BOOKING_COMPANY_SIZES = [
    '1-10 employees',
    '11-50 employees',
    '51-200 employees',
    '201-500 employees',
    '500+ employees',
] as const;

export const EMPTY_BOOKING_FORM: { name: string; email: string; companySize: string } = {
    name: '',
    email: '',
    companySize: '',
};

/** Shared motion easing used across reveal / hero / section animations. */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/** Shared viewport for section + block reveals. */
export const REVEAL_VIEWPORT = {
    once: true,
    amount: 0.18,
    margin: '0px 0px -12% 0px',
} as const;
