/** The sheet index. Navigation is by sheet number, as in a drawing set. */
export const SHEETS = [
  { sheet: 'A-000', short: 'Cover', title: 'Cover sheet', href: '/' },
  { sheet: 'A-100', short: 'Work', title: 'Project index', href: '/work' },
  { sheet: 'A-900', short: 'Bio', title: 'Curriculum vitae', href: '/about' },
  { sheet: 'A-990', short: 'Contact', title: 'Contact', href: '/contact' },
] as const;
