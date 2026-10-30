import { notFound } from 'next/navigation';

/**
 * Any French address the site does not have.
 *
 * Without this, /fr/anything matches no route at all and Next answers with the
 * boundary at the root of the tree, which is the English 404: a French reader
 * who mistypes an address would be told in English that it does not exist. A
 * catch all is the one thing that turns "no route matched" into a route, and a
 * route can call notFound() and be caught by ../not-found.tsx.
 *
 * It shadows nothing. Next matches a named segment before a catch all, so every
 * real page under /fr is still its own file, and only what is left over
 * arrives here.
 */
export default function FrenchUnmatched(): never {
  notFound();
}
