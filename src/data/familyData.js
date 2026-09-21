// Normalized family data: people are stored once, keyed by id, and every
// relationship references people by id instead of nesting them. See
// specs/people-and-relationships/spec.md for the reasoning.
//
// - `people`: id -> { name, born }
// - `marriages`: an edge between 1-2 person ids (1 = the other spouse is
//   unknown/unrecorded, e.g. a parent whose partner wasn't recorded)
// - `parentage`: which marriage a person was born from — this single
//   relationship is *both* "children of this marriage" and "parents of
//   this person", just read in opposite directions
//
// `src/data/familyGraph.js` turns this into the nested tree
// `FamilyTree.jsx` actually renders.

export const people = {
  'eleanor-whitfield': { name: 'Eleanor Whitfield', born: 1930 },
  'henry-whitfield': { name: 'Henry Whitfield', born: 1928 },

  'margaret-hayes': { name: 'Margaret Hayes', born: 1952 },
  'david-hayes': { name: 'David Hayes', born: 1950 },
  'walter-hayes': { name: 'Walter Hayes', born: 1922 },
  'grace-hayes': { name: 'Grace Hayes', born: 1924 },
  'arthur-bell': { name: 'Arthur Bell', born: 1898 },

  'sophie-hayes': { name: 'Sophie Hayes', born: 1978 },
  'marcus-cook': { name: 'Marcus Cook', born: 1977 },
  'gordon-cook': { name: 'Gordon Cook', born: 1948 },
  'liam-hayes-cook': { name: 'Liam Hayes-Cook', born: 2005 },
  'ava-hayes-cook': { name: 'Ava Hayes-Cook', born: 2008 },

  'daniel-hayes': { name: 'Daniel Hayes', born: 1981 },
  'rachel-hayes': { name: 'Rachel Hayes', born: 1983 },
  'noah-hayes': { name: 'Noah Hayes', born: 2011 },

  'robert-whitfield': { name: 'Robert Whitfield', born: 1955 },
  'susan-whitfield': { name: 'Susan Whitfield', born: 1957 },
  'frank-doyle': { name: 'Frank Doyle', born: 1930 },
  'helen-doyle': { name: 'Helen Doyle', born: 1932 },
  'claire-whitfield': { name: 'Claire Whitfield', born: 1983 },

  'diane-whitfield': { name: 'Diane Whitfield', born: 1962 },
  'james-whitfield': { name: 'James Whitfield', born: 1986 },
  'laura-whitfield': { name: 'Laura Whitfield', born: 1988 },
  'ella-whitfield': { name: 'Ella Whitfield', born: 2014 },
  'mason-whitfield': { name: 'Mason Whitfield', born: 2016 },

  'thomas-whitfield': { name: 'Thomas Whitfield', born: 1958 },
  'patricia-whitfield': { name: 'Patricia Whitfield', born: 1960 },
  'olivia-whitfield': { name: 'Olivia Whitfield', born: 1990 },
}

export const marriages = [
  { id: 'eleanor-henry', spouses: ['eleanor-whitfield', 'henry-whitfield'] },

  { id: 'margaret-david', spouses: ['margaret-hayes', 'david-hayes'] },
  { id: 'walter-grace', spouses: ['walter-hayes', 'grace-hayes'] },
  { id: 'arthur-unknown', spouses: ['arthur-bell'] },

  { id: 'sophie-marcus', spouses: ['sophie-hayes', 'marcus-cook'] },
  { id: 'gordon-unknown', spouses: ['gordon-cook'] },

  { id: 'daniel-rachel', spouses: ['daniel-hayes', 'rachel-hayes'] },

  { id: 'robert-susan', spouses: ['robert-whitfield', 'susan-whitfield'] },
  { id: 'frank-helen', spouses: ['frank-doyle', 'helen-doyle'] },
  { id: 'robert-diane', spouses: ['robert-whitfield', 'diane-whitfield'] },
  { id: 'james-laura', spouses: ['james-whitfield', 'laura-whitfield'] },

  { id: 'thomas-patricia', spouses: ['thomas-whitfield', 'patricia-whitfield'] },
]

export const parentage = [
  { marriageId: 'eleanor-henry', childId: 'margaret-hayes' },
  { marriageId: 'eleanor-henry', childId: 'robert-whitfield' },
  { marriageId: 'eleanor-henry', childId: 'thomas-whitfield' },

  { marriageId: 'margaret-david', childId: 'sophie-hayes' },
  { marriageId: 'margaret-david', childId: 'daniel-hayes' },
  { marriageId: 'walter-grace', childId: 'david-hayes' },
  { marriageId: 'arthur-unknown', childId: 'grace-hayes' },

  { marriageId: 'sophie-marcus', childId: 'liam-hayes-cook' },
  { marriageId: 'sophie-marcus', childId: 'ava-hayes-cook' },
  { marriageId: 'gordon-unknown', childId: 'marcus-cook' },

  { marriageId: 'daniel-rachel', childId: 'noah-hayes' },

  { marriageId: 'robert-susan', childId: 'claire-whitfield' },
  { marriageId: 'frank-helen', childId: 'susan-whitfield' },
  { marriageId: 'robert-diane', childId: 'james-whitfield' },
  { marriageId: 'james-laura', childId: 'ella-whitfield' },
  { marriageId: 'james-laura', childId: 'mason-whitfield' },

  { marriageId: 'thomas-patricia', childId: 'olivia-whitfield' },
]

export const rootId = 'eleanor-whitfield'
