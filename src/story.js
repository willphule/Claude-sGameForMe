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

const STAGE3_NOTES = [
  {
    from: 'A Treasury ledger, swollen with seawater',
    text: [
      'COUNCIL OF CARILLON — ACCOUNTS FOR THE GREAT BELL',
      'To I. Varga, for the casting of the Great Bell: 1,200 crowns. Paid.',
      'To I. Varga, for a second bell, small, of silver, "to be carried": refused. The Council has no need of a pocket watch.',
    ],
  },
  {
    from: 'Teodor\'s notes, scratched into a beam',
    text: [
      'At the test ringing I heard the Great Bell twice. Once here in the tower — and once very far off, thin and blue, as if from under the sea.',
      'Ilse went white. "That is where it will send the water," she said. "Not away. Only later."',
      'The ballast blocks down here still slide, if you put your back into it.',
    ],
  },
  {
    from: 'A page from the clockmaker\'s notebook',
    text: [
      'A bell that rings in two times can only be stilled in two times.',
      'There are three dampers on the frame, worked by levers on the galleries and the beam. Drop all three while it rings.',
      'Gold is the night I live in. Blue is the morning you live in. When it rings gold, stand in your time. When it rings blue, stand in mine.',
    ],
  },
  {
    from: 'Pinned to the door of the bell chamber',
    text: [
      'Midnight. The Council\'s men are on the stairs and Teodor has gone up to the Bellwright.',
      'I cannot reach the dampers in time. So I am giving the watch to the water. The sea will carry it to you, fifty years on, and you will carry it back.',
      'Do not let it ring in either time. — I.',
    ],
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
  {
    notes: STAGE3_NOTES,
    ending: {
      title: 'Carillon',
      text: [
        'Fifty years ago, on the last night of the rains, the Great Bell of Carillon did not ring.',
        'The storm broke against the seawall and went no further. In the morning the Council took the credit.',
        'You turned the watch one last time, and the water was gone. Gulls. Wet slate roofs. A bell tower standing straight against a pale sky, and streets full of people who never drowned.',
        'The watch has stopped. As far as anyone can tell, you are the only one who remembers the sea.',
      ],
    },
  },
];

// The letter you only find if you have read every note in the city.
export const LAST_LETTER = {
  from: 'Inside the watch case, folded very small',
  text: [
    'If you have found this, you have read every word I left. Then you know what I never told the Council:',
    'the bell never called the sea. It only remembered it, the way this watch remembers me.',
    'By the time you read this I will be an old woman, in your morning, still listening for a bell that never rings. Come and find me on Varga Street. I will put the kettle on.',
    '— Ilse',
  ],
};
