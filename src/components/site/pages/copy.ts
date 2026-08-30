import { CONTACT_DEFAULTS } from '@/lib/contact-defaults';
import type { Locale } from '@/lib/i18n';

/**
 * The words these five pages say for themselves, in both languages.
 *
 * src/lib/dictionary.ts is where they belong, and where they should end up. They
 * are here because every English string below is the string the page prints
 * today, and the dictionary's nearest entries are worded differently: folding
 * them in one at a time would either change English copy that is already
 * published and indexed, or leave two English wordings of the same heading
 * living side by side. Move the whole block across in one pass instead, once
 * somebody has decided which wording wins.
 *
 * French here is Canadian French, matching the dictionary's voice, because an
 * Ottawa and Gatineau practice is who reads it.
 */
const PAGE_COPY = {
  en: {
    /* The home page's heading over the grid, and the portfolio page's title. */
    projects: 'Projects',
    architectureAndUrbanism: 'Architecture and urbanism',
    projectsIntro: 'A selection of my work. Explore the projects to learn more about what I do.',
    education: 'Education',
    experience: 'Experience',
    /* The volunteering section. Named for what it is about rather than for the
       database section it reads from. */
    community: 'Community',
    skills: 'Skills',
    languages: 'Languages',
    fullResumePdf: 'Full resume, PDF',
    /* What stands in for a year nobody filled in. */
    completed: 'Completed',
    ongoing: 'Ongoing',
    otherProjects: 'Other projects',
    error: 'Error',
    pageNotFound: 'Page not found',
    /* The subject line a visitor's mail client opens with. */
    enquirySubject: 'Enquiry from your portfolio',
    /* Only ever seen against a database with nothing in it: the real words are
       the contact fields Ahmad edits. English is the module the whole site
       falls back to, so it is taken from there rather than written again. */
    contactBlurb: CONTACT_DEFAULTS.blurb,
  },
  fr: {
    projects: 'Projets',
    architectureAndUrbanism: 'Architecture et urbanisme',
    projectsIntro:
      'Une sélection de mes travaux. Parcourez les projets pour en savoir plus sur ce que je fais.',
    education: 'Formation',
    experience: 'Expérience',
    community: 'Engagement communautaire',
    skills: 'Compétences',
    languages: 'Langues',
    fullResumePdf: 'Curriculum vitae complet, PDF',
    completed: 'Terminé',
    ongoing: 'En cours',
    otherProjects: 'Autres projets',
    error: 'Erreur',
    pageNotFound: 'Page introuvable',
    enquirySubject: 'Demande à partir de votre portfolio',
    contactBlurb:
      'Le courriel est la meilleure façon de me joindre, et il me parvient directement. ' +
      'Joignez le mandat, la description de poste ou le jeu de dessins et je répondrai avec ' +
      'ce qui vous sera utile, y compris des travaux qui ne sont pas sur ce site.',
  },
} as const satisfies Record<Locale, Record<string, string>>;

/** Every phrase as a plain string: the literals only matter to the compiler,
    which uses them to check that both languages carry the same keys. */
export type PageWords = { readonly [K in keyof (typeof PAGE_COPY)['en']]: string };

/** These pages' own words in one language. */
export function pageWords(locale: Locale): PageWords {
  return PAGE_COPY[locale];
}

/**
 * "de" or "d'", in front of a name.
 *
 * French elides the vowel before a word that starts with one, so "Curriculum
 * vitae de Ahmad" is wrong where the English shape gives no trouble at all.
 * The h is included because the names this actually meets are h muet, and
 * because "d'Hassan" is right far more often than "de Hassan".
 */
export function frenchOf(name: string): string {
  return /^[aàâeéèêëiîïoôuùûüyh]/i.test(name) ? `d'${name}` : `de ${name}`;
}

/**
 * "17 projects" / "17 projets", with the singular each language wants.
 *
 * The English page printed "1 projects" for a portfolio with one project in it.
 * Nobody saw it, because there are seventeen, but it is a sentence the site can
 * say and so it is one the site should say properly.
 */
export function projectCount(locale: Locale, count: number): string {
  if (locale === 'fr') return count === 1 ? '1 projet' : `${count} projets`;
  return count === 1 ? '1 project' : `${count} projects`;
}

/* -------------------------------------------------------- page descriptions --
   The sentence under each page's title in a search result. They take the name
   rather than repeating it so that a profile edited in the editing area is the
   one thing that decides what the site calls him. */

export function homeDescription(locale: Locale, name: string): string {
  if (locale === 'fr') return `Portfolio ${frenchOf(name)}, concepteur en architecture à Ottawa, en Ontario.`;
  return `Portfolio of ${name}, architectural designer in Ottawa, Ontario.`;
}

export function architectureDescription(locale: Locale, name: string): string {
  if (locale === 'fr') {
    return `Travaux d'architecture et d'urbanisme ${frenchOf(name)}, dont le Lincoln Beach Center et La Casa Aranas.`;
  }
  return `Architectural and urbanism work by ${name}, including the Lincoln Beach Center and La Casa Aranas.`;
}

export function resumeDescription(
  locale: Locale,
  name: string,
  discipline: string,
  location: string,
): string {
  if (locale === 'fr') return `Curriculum vitae ${frenchOf(name)}, ${discipline} à ${location}.`;
  return `Curriculum vitae for ${name}, ${discipline} in ${location}.`;
}

export function contactDescription(locale: Locale, name: string, location: string): string {
  if (locale === 'fr') return `Joindre ${name} à ${location}.`;
  return `Get in touch with ${name} in ${location}.`;
}
