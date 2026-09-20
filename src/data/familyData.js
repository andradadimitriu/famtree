// Sample family tree data. Each node is a person; `children` holds their
// descendants. This is the shape FamilyTree expects.
const familyData = {
  name: 'Eleanor Whitfield',
  born: 1930,
  children: [
    {
      name: 'Margaret Hayes',
      born: 1952,
      children: [
        {
          name: 'Sophie Hayes',
          born: 1978,
          children: [
            { name: 'Liam Hayes-Cook', born: 2005 },
            { name: 'Ava Hayes-Cook', born: 2008 },
          ],
        },
        {
          name: 'Daniel Hayes',
          born: 1981,
          children: [{ name: 'Noah Hayes', born: 2011 }],
        },
      ],
    },
    {
      name: 'Robert Whitfield',
      born: 1955,
      children: [
        { name: 'Claire Whitfield', born: 1983 },
        {
          name: 'James Whitfield',
          born: 1986,
          children: [
            { name: 'Ella Whitfield', born: 2014 },
            { name: 'Mason Whitfield', born: 2016 },
          ],
        },
      ],
    },
    {
      name: 'Thomas Whitfield',
      born: 1958,
      children: [{ name: 'Olivia Whitfield', born: 1990 }],
    },
  ],
}

export default familyData
