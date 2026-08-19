/**
 * Every region of the site that can be edited on the page, in one list.
 *
 * This is what makes the editing inline rather than beside. Each entry says how
 * to fetch a document, which component draws it, and what element wraps it. When
 * Ahmad types in the admin, the bridge posts the draft to /tina-island/<name>,
 * this registry picks the entry, the component is rendered on the server with
 * the unsaved values, and the result replaces that element in the page he is
 * looking at. No rebuild, no refresh, and no second preview template that can
 * disagree with the real one.
 *
 * The wrapper tag has to match the element the page put the island in, because
 * that element is what gets swapped. Getting it wrong nests a section inside
 * itself on the first keystroke, which is why both sides read it from here
 * rather than each writing it out.
 *
 * Adding an editable region is one entry here plus one <TinaIsland> on the page.
 * The route in src/pages/tina-island/[name].ts needs no change.
 */
import type { QueryResult } from '@tinacms/astro/data';
import type { IslandRegistry } from '@tinacms/astro/experimental';

import ProjectBody from '../components/islands/ProjectBody.astro';
import ResumeBody from '../components/islands/ResumeBody.astro';
import ContactBody from '../components/islands/ContactBody.astro';
import HomeAbout from '../components/islands/HomeAbout.astro';
import { getProject, getResume } from './data';
import type { ProjectsQuery, ResumeQuery } from '../../tina/__generated__/types';

const project = (data: unknown) => (data as QueryResult<ProjectsQuery>).data?.projects;
const resume = (data: unknown) => (data as QueryResult<ResumeQuery>).data?.resume;

export const islands: IslandRegistry = {
  project: {
    fetch: (_request, params) => getProject(params.get('slug') ?? ''),
    component: ProjectBody,
    wrapper: { tag: 'article' },
    propsFromData: (data) => ({ data: project(data) }),
  },
  resume: {
    fetch: () => getResume(),
    component: ResumeBody,
    wrapper: { tag: 'div' },
    propsFromData: (data) => ({ data: resume(data) }),
  },
  contact: {
    fetch: () => getResume(),
    component: ContactBody,
    wrapper: { tag: 'div' },
    propsFromData: (data) => ({ data: resume(data) }),
  },
  'home-about': {
    fetch: () => getResume(),
    component: HomeAbout,
    wrapper: { tag: 'section', className: 'band closing' },
    propsFromData: (data) => ({ data: resume(data) }),
  },
};
