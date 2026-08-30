import { describe, expect, it } from 'vitest';

import { frenchOf, projectCount, resumeDescription } from './copy';

describe('French in front of a name', () => {
  it('elides before a vowel', () => {
    expect(frenchOf('Ahmad Assi')).toBe("d'Ahmad Assi");
  });

  it('elides before an h, which is what the names here actually start with', () => {
    expect(frenchOf('Hassan')).toBe("d'Hassan");
  });

  it('does not elide before a consonant', () => {
    expect(frenchOf('Marc Tremblay')).toBe('de Marc Tremblay');
  });

  it('reaches the description a search engine shows', () => {
    expect(resumeDescription('fr', 'Ahmad Assi', 'concepteur en architecture', 'Ottawa')).toBe(
      "Curriculum vitae d'Ahmad Assi, concepteur en architecture à Ottawa.",
    );
  });
});

describe('counting the projects', () => {
  it('keeps the plural in both languages', () => {
    expect(projectCount('en', 17)).toBe('17 projects');
    expect(projectCount('fr', 17)).toBe('17 projets');
  });

  it('says one project rather than one projects', () => {
    /* The portfolio has seventeen, so nobody ever saw this, but it is a
       sentence the page can say and so it is one it should say properly. */
    expect(projectCount('en', 1)).toBe('1 project');
    expect(projectCount('fr', 1)).toBe('1 projet');
  });
});
