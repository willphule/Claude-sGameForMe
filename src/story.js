// Notes found around the city, per stage, in the order they appear in each level (left to right).

const STAGE1_NOTES = [
  {
    from: 'Wrapped around a pocket watch',
    text: [
      'To whoever finds this watch —',
      'It remembers. Turn the crown and you will stand where I stood, before the water came. What has rotted here still stands there. What fell here has not fallen yet.',
      'Be careful where you stand when you turn it. Two things cannot share one place.',
      '— I. Varga, Clockmaker',
    ],
    unlocksWatch: true,
  },
  {
    from: 'A soaked diary page',
    text: [
      'Day 12 of the rains.',
      'The Council says the Great Bell will save us. When it rings, they say, the sea will remember its place.',
      'They said it in the same voice they used for the seawall.',
    ],
  },
  {
    from: 'Stencilled on a maintenance plate',
    text: [
      'FLOODGATE 7 — EAST CISTERN',
      'Opening this valve diverts the overflow into the eastern shaft.',
      'DO NOT OPEN DURING STORM SEASON.',
    ],
  },
];

const STAGE2_NOTES = [
  // ordered left to right by where they lie on the map: courtyard, tower top, corridor, shrine
  {
    from: 'A Council notice, nailed to a door',
    text: [
      'BY ORDER OF THE COUNCIL',
      'The Great Bell will be rung at midnight. The Bellwright automaton has been wound for the purpose and will not be interfered with.',
      'Citizens are to remain indoors until the sea has been calmed.',
    ],
  },
  {
    from: 'Teodor\'s notes, chalked on the wall',
    text: [
      'The Bellwright. Three things I know:',
      'When it slams its hammer down, it is pulled low and its key shows. That is the moment.',
      'When it tolls, the air of that night shakes itself apart — but fifty years on, nothing stirs. Turn the watch.',
      'The ceiling rings can be reached from the galleries on either side. Do not stand beneath it.',
    ],
  },
  {
    from: 'A page from the clockmaker\'s notebook',
    text: [
      'They asked me for a bell to calm the sea. I told them no bell can do that.',
      'So they asked for one that could call it instead. A bell that rings in two times at once, so the flood that drowns the city can be sent into the past — or the future.',
      'I built it. God forgive me, I built it.',
    ],
  },
  {
    from: 'Tied to the harpoon with twine',
    text: [
      'Ilse —',
      'I have left my harpoon by the gear-pit. Fire it at any ring and the line will hold you. Climb it, swing on it, let go when you are high enough.',
      'The Bellwright wears its key on its crown. You will have to get above it.',
      '— Teodor',
    ],
    ability: 'harpoon',
  },
];

export const STORY = [
  {
    notes: STAGE1_NOTES,
    ending: {
      title: 'The Bell Tower',
      text: 'Above you, something enormous shifts in the dark water — and, very faintly, a bell answers the watch.',
    },
  },
  {
    notes: STAGE2_NOTES,
    ending: {
      title: 'The Great Bell',
      text: 'The Bellwright is silent at last. Above, the Great Bell hangs in the dark — and the watch in your hand has begun to tick backwards.',
    },
  },
];
