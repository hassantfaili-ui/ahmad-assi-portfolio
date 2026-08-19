import type { Project } from './data';

/**
 * Split the projects into the three tiers the home page and the portfolio PDF
 * both lay out from.
 *
 * This lives in one place because the two used to derive it separately and had
 * already drifted: the home page took the first three leads and dropped the
 * rest, while the PDF took every project marked lead. A fourth lead therefore
 * vanished from the home page altogether, since it was sliced out of the leads
 * but its tier kept it out of the strip and the index too, and at the same time
 * it appeared as a full spread in the PDF. Nothing warned about either.
 *
 * That matters because marking a fourth project as a lead is an obvious thing to
 * try, and losing a project off the front page with no error is the worst
 * possible answer to it.
 *
 * So: only three can lead, and any beyond that fall through into the strip in
 * their normal order rather than disappearing. Worst case he gets a layout he
 * did not quite intend, which is visible and can be undone, instead of a project
 * that is silently gone.
 *
 * An unset tier reads as 'set', matching what the editor offers as the default,
 * so a project created and saved before Ahmad reaches that field lands in the
 * strip rather than nowhere.
 */
export function tiers(projects: Project[]) {
  const order = (p: Project) => p.order ?? 99;
  const tier = (p: Project) => p.tier || 'set';
  const byOrder = [...projects].sort((a, b) => order(a) - order(b));

  const marked = byOrder.filter((p) => tier(p) === 'lead');
  const leads = marked.slice(0, 3);
  const overflow = marked.slice(3);

  const set = byOrder
    .filter((p) => tier(p) === 'set')
    .concat(overflow)
    .sort((a, b) => order(a) - order(b));

  const index = byOrder.filter((p) => tier(p) === 'index');

  return { leads, set, index };
}
