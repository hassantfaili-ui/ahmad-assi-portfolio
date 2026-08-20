/**
 * What the contact page says when Ahmad has not said otherwise.
 *
 * These were literals inside the page, which is why they could not be edited.
 * They live here so the page, the save and the form all fall back to the same
 * words rather than three slightly different sets of them.
 */
export const CONTACT_DEFAULTS = {
  status: 'Available now',
  heading: 'Write to me',
  blurb:
    'Email is best, and it reaches me directly. Attach the brief, the job description or ' +
    'the drawing set and I will reply with whatever is useful, including work that is not ' +
    'on this site.',
} as const;
