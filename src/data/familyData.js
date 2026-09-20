// Sample family tree data. Each node is a person; `marriages` holds their
// marriage(s), each with a `spouse` ({ name, born }) and the `children`
// born from that marriage. This is the shape FamilyTree expects.
//
// A person can have more than one marriage (e.g. Robert Whitfield below),
// in which case children from different marriages are half-siblings.
// An unmarried person with no descendants simply has no `marriages`.
const familyData = {
  name: 'Eleanor Whitfield',
  born: 1930,
  marriages: [
    {
      spouse: { name: 'Henry Whitfield', born: 1928 },
      children: [
        {
          name: 'Margaret Hayes',
          born: 1952,
          marriages: [
            {
              spouse: { name: 'David Hayes', born: 1950 },
              children: [
                {
                  name: 'Sophie Hayes',
                  born: 1978,
                  marriages: [
                    {
                      spouse: { name: 'Marcus Cook', born: 1977 },
                      children: [
                        { name: 'Liam Hayes-Cook', born: 2005 },
                        { name: 'Ava Hayes-Cook', born: 2008 },
                      ],
                    },
                  ],
                },
                {
                  name: 'Daniel Hayes',
                  born: 1981,
                  marriages: [
                    {
                      spouse: { name: 'Rachel Hayes', born: 1983 },
                      children: [{ name: 'Noah Hayes', born: 2011 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          name: 'Robert Whitfield',
          born: 1955,
          marriages: [
            {
              spouse: { name: 'Susan Whitfield', born: 1957 },
              children: [{ name: 'Claire Whitfield', born: 1983 }],
            },
            {
              spouse: { name: 'Diane Whitfield', born: 1962 },
              children: [
                {
                  name: 'James Whitfield',
                  born: 1986,
                  marriages: [
                    {
                      spouse: { name: 'Laura Whitfield', born: 1988 },
                      children: [
                        { name: 'Ella Whitfield', born: 2014 },
                        { name: 'Mason Whitfield', born: 2016 },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          name: 'Thomas Whitfield',
          born: 1958,
          marriages: [
            {
              spouse: { name: 'Patricia Whitfield', born: 1960 },
              children: [{ name: 'Olivia Whitfield', born: 1990 }],
            },
          ],
        },
      ],
    },
  ],
}

export default familyData
