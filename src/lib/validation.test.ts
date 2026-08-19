import { describe, it, expect } from 'vitest';
import {
  validateProject,
  validateImages,
  validateFilm,
  validateProfile,
  leadOverflowWarning,
  hasErrors,
  type ProjectInput,
} from './validation';

const valid: ProjectInput = {
  title: 'Lincoln Beach Center',
  slug: 'lincoln-beach-center',
  sheet: 'A-101',
  category: 'Cultural',
  year: 2025,
  location: 'New Orleans, Louisiana',
  buildingType: 'Museum expansion',
  area: null,
  status: 'Academic',
  role: 'Designer',
  contribution: 'The whole project.',
  summary: 'A two phase expansion of the Lincoln Beach Center.',
  body: '',
  credit: 'Solo',
  tier: 'lead',
  order: 1,
};

describe('validateProject', () => {
  it('accepts a complete project', () => {
    expect(validateProject(valid)).toEqual({});
    expect(hasErrors(validateProject(valid))).toBe(false);
  });

  it.each([
    ['A-101', true],
    ['A-999', true],
    ['A-1', false],
    ['A-1010', false],
    ['B-101', false],
    ['a-101', false],
    ['', false],
  ])('sheet %s valid: %s', (sheet, ok) => {
    const errors = validateProject({ ...valid, sheet });
    expect('sheet' in errors).toBe(!ok);
  });

  it('requires credit, and says why', () => {
    const errors = validateProject({ ...valid, credit: '   ' });
    expect(errors.credit).toContain('who did the work');
  });

  it('requires alt text once a lead image is set', () => {
    expect(validateProject({ ...valid, leadImageId: 'm1', leadImageAlt: '' }).leadImageAlt).toContain(
      'Alt text is required',
    );
    expect(validateProject({ ...valid, leadImageId: 'm1', leadImageAlt: 'A museum' })).toEqual({});
  });

  it('does not demand alt text when there is no image to describe', () => {
    expect(validateProject({ ...valid, leadImageId: null, leadImageAlt: '' })).toEqual({});
  });

  it('rejects an unknown category, status or tier', () => {
    expect(validateProject({ ...valid, category: 'Nautical' }).category).toBeDefined();
    expect(validateProject({ ...valid, status: 'Imagined' }).status).toBeDefined();
    expect(validateProject({ ...valid, tier: 'featured' }).tier).toBeDefined();
  });

  it.each([1899, 2101, 20.5, Number.NaN])('rejects the year %s', (year) => {
    expect(validateProject({ ...valid, year }).year).toBeDefined();
  });

  it('treats whitespace as absent', () => {
    const errors = validateProject({ ...valid, title: '   ', summary: '\n\t' });
    expect(errors.title).toBeDefined();
    expect(errors.summary).toBeDefined();
  });
});

describe('validateImages', () => {
  it('names the index of every image missing alt text', () => {
    const errors = validateImages([
      { mediaId: 'a', alt: 'Fine' },
      { mediaId: 'b', alt: '' },
      { mediaId: 'c', alt: '  ' },
    ]);
    expect(Object.keys(errors)).toEqual(['images.1.alt', 'images.2.alt']);
  });

  it('accepts an empty set', () => {
    expect(validateImages([])).toEqual({});
  });
});

describe('validateFilm', () => {
  it('needs a source or a YouTube id', () => {
    expect(validateFilm({ sourceMediaIds: [], youtubeId: null }).film).toContain('YouTube id');
  });

  it('accepts a YouTube id alone, with no poster', () => {
    expect(validateFilm({ sourceMediaIds: [], youtubeId: 'abc123' })).toEqual({});
  });

  it('requires a poster once there is an uploaded source', () => {
    expect(validateFilm({ sourceMediaIds: ['m1'], posterMediaId: null }).filmPoster).toBeDefined();
    expect(validateFilm({ sourceMediaIds: ['m1'], posterMediaId: 'p1' })).toEqual({});
  });
});

describe('leadOverflowWarning', () => {
  it.each([0, 1, 2, 3])('says nothing at %i leads', (n) => {
    expect(leadOverflowWarning(n)).toBeNull();
  });

  it('warns about a fourth, in the singular', () => {
    const message = leadOverflowWarning(4);
    expect(message).toContain('1 more is');
    expect(message).toContain('strip');
  });

  it('warns about several, in the plural', () => {
    expect(leadOverflowWarning(6)).toContain('3 more are');
  });
});

describe('validateProfile', () => {
  const profile = {
    name: 'Ahmad Assi',
    discipline: 'Architectural Designer',
    email: 'ahmad@example.ca',
    phone: '613-291-8074',
    location: 'Ottawa, Ontario',
  };

  it('accepts a complete profile', () => {
    expect(validateProfile(profile)).toEqual({});
  });

  it.each(['no-at-sign', 'two@@at.ca', 'trailing@', '@leading.ca', 'spaces in@it.ca'])(
    'rejects the address %s',
    (email) => {
      expect(validateProfile({ ...profile, email }).email).toBeDefined();
    },
  );

  it('says why the email matters when it is missing', () => {
    expect(validateProfile({ ...profile, email: '' }).email).toContain('contact page');
  });
});
