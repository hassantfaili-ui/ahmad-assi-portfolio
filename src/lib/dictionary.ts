import type { Locale } from '@/lib/i18n';

/**
 * The words the site says for itself, as opposed to the words Ahmad writes.
 *
 * Navigation, headings, buttons and the small print. These are not in the
 * database because they are not his content: they belong to the site, they
 * change when the site changes, and asking him to translate the word Resume in
 * an editor would be work for its own sake.
 *
 * French here is Canadian French, which is what a practice in Ottawa and
 * Gatineau reads.
 */
const DICTIONARY = {
  en: {
    skipToContent: 'Skip to content',
    home: 'Home',
    architecture: 'Architecture',
    resume: 'Resume',
    contact: 'Contact',
    selectedWork: 'Selected work',
    fullSheet: 'Full sheet',
    close: 'Close',
    pages: 'Pages',
    playTheFilm: 'Play the walkthrough film',
    scrollLeft: 'Scroll projects left',
    scrollRight: 'Scroll projects right',
    restOfTheSet: 'The rest of the set',
    alsoInTheArchive: 'Also in the archive',
    about: 'About',
    getInTouch: 'Get in touch',
    interestedInCollaborating: 'Interested in collaborating?',
    contactPage: 'Contact page',
    walkthrough: 'Walkthrough',
    drawings: 'Drawings',
    projectType: 'Project type',
    location: 'Location',
    status: 'Status',
    area: 'Area',
    role: 'Role',
    year: 'Year',
    previous: 'Previous',
    next: 'Next',
    availableNow: 'Available now',
    writeToMe: 'Write to me',
    email: 'Email',
    phone: 'Phone',
    basedIn: 'Based in',
    elsewhere: 'Elsewhere',
    portfolioPdf: 'Portfolio PDF',
    resumePdf: 'Resume PDF',
    references: 'References',
    theme: 'Dark',
    languageName: 'English',
    switchLanguage: 'Voir en français',
    /* The wording the site has always used. French is a translation of it, not
       an occasion to rewrite the English. */
    errorLabel: 'Error',
    notFoundTitle: 'Off the map',
    notFoundBody: 'That page does not exist, or it has moved.',
    viewPortfolio: 'View the portfolio',
  },
  fr: {
    skipToContent: 'Aller au contenu',
    home: 'Accueil',
    architecture: 'Architecture',
    resume: 'Curriculum vitae',
    contact: 'Contact',
    selectedWork: 'Projets choisis',
    fullSheet: 'Planche complète',
    close: 'Fermer',
    pages: 'Pages',
    playTheFilm: 'Lire la visite filmée',
    scrollLeft: 'Faire défiler les projets vers la gauche',
    scrollRight: 'Faire défiler les projets vers la droite',
    restOfTheSet: 'Le reste de la série',
    alsoInTheArchive: 'Aussi dans les archives',
    about: 'À propos',
    getInTouch: 'Me joindre',
    interestedInCollaborating: 'Envie de collaborer?',
    contactPage: 'Page contact',
    walkthrough: 'Visite',
    drawings: 'Dessins',
    projectType: 'Type de projet',
    location: 'Lieu',
    status: 'Statut',
    area: 'Superficie',
    role: 'Rôle',
    year: 'Année',
    previous: 'Précédent',
    next: 'Suivant',
    availableNow: 'Disponible maintenant',
    writeToMe: 'Écrivez-moi',
    email: 'Courriel',
    phone: 'Téléphone',
    basedIn: 'Établi à',
    elsewhere: 'Ailleurs',
    portfolioPdf: 'Portfolio PDF',
    resumePdf: 'CV PDF',
    references: 'Références',
    theme: 'Sombre',
    languageName: 'Français',
    switchLanguage: 'View in English',
    errorLabel: 'Erreur',
    /* Hors plan, which an architect reads the way an English one reads off the
       map: the thing is not on the drawing. */
    notFoundTitle: 'Hors plan',
    notFoundBody: "Cette page n'existe pas, ou elle a été déplacée.",
    viewPortfolio: 'Voir le portfolio',
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type Phrase = keyof (typeof DICTIONARY)['en'];

/** Every phrase, as plain strings: the literals matter to the compiler only for
    checking that both languages carry the same keys. */
export type Words = { readonly [K in Phrase]: string };

/** The site's own words in one language. */
export function words(locale: Locale): Words {
  return DICTIONARY[locale];
}

/**
 * The categories and statuses a project is filed under.
 *
 * Stored as fixed values rather than free text, so they are the site's
 * vocabulary rather than Ahmad's writing and belong here with the rest of it.
 */
export const CATEGORY_WORDS: Record<Locale, Record<string, string>> = {
  en: {
    Residential: 'Residential',
    Cultural: 'Cultural',
    Commercial: 'Commercial',
    Academic: 'Academic',
    Competition: 'Competition',
  },
  fr: {
    Residential: 'Résidentiel',
    Cultural: 'Culturel',
    Commercial: 'Commercial',
    Academic: 'Universitaire',
    Competition: 'Concours',
  },
};

export const STATUS_WORDS: Record<Locale, Record<string, string>> = {
  en: {
    Built: 'Built',
    UnderConstruction: 'Under construction',
    DesignDevelopment: 'Design development',
    Unbuilt: 'Unbuilt',
    Competition: 'Competition',
    Academic: 'Academic',
  },
  fr: {
    Built: 'Construit',
    UnderConstruction: 'En construction',
    DesignDevelopment: 'Conception détaillée',
    Unbuilt: 'Non construit',
    Competition: 'Concours',
    Academic: 'Universitaire',
  },
};
