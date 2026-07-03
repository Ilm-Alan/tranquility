// A small, authored corpus of home design principles. Each entry is a widely
// taught idea summarized in our own words - no invented quotes, no fabricated
// attributions. The studio retrieves from here and cites entries by name, so
// the assistant's design talk is grounded in text a reader can inspect.

export interface DesignPrinciple {
  id: string;
  name: string;
  body: string;
  keywords: string[];
}

export const DESIGN_CORPUS: DesignPrinciple[] = [
  {
    id: 'sixty-thirty-ten',
    name: 'The 60-30-10 color rule',
    body:
      'Hold a room to three color roles: about sixty percent a dominant neutral (walls, large furniture), thirty percent a secondary color (textiles, rugs, curtains), ten percent an accent (art, cushions, small objects). New pieces should join one of the three roles rather than introduce a fourth.',
    keywords: ['color', 'palette', 'accent', 'neutral', 'scheme', 'colorful', 'bold'],
  },
  {
    id: 'layered-lighting',
    name: 'Layered lighting',
    body:
      'Rooms need three layers of light: ambient (overall illumination), task (reading, cooking, working), and accent (art, shelves, texture). A single ceiling fixture flattens a room; adding a floor or table lamp at seating height is usually the fastest visible upgrade.',
    keywords: ['light', 'lighting', 'lamp', 'dark', 'dim', 'bright', 'sconce', 'evening', 'cozy'],
  },
  {
    id: 'warm-cool-light',
    name: 'Warm and cool light',
    body:
      'Warm light (2700-3000K) relaxes and suits living rooms and bedrooms; cooler light suits work surfaces. Mixing temperatures in one sightline reads as a mistake, so keep lamps in a shared space within the same warmth range.',
    keywords: ['warm', 'cool', 'temperature', 'bulb', 'kelvin', 'relax', 'bedroom', 'living'],
  },
  {
    id: 'anchor-piece',
    name: 'The anchor piece',
    body:
      'Every seating area needs one piece that visually anchors it - usually a rug sized so at least the front legs of all seating sit on it, or a large sofa or table. Small pieces floating on bare floor read as unfinished no matter how good each one is.',
    keywords: ['rug', 'sofa', 'anchor', 'floating', 'empty', 'sparse', 'seating', 'unfinished'],
  },
  {
    id: 'negative-space',
    name: 'Negative space',
    body:
      'Empty space is a design material, not a failure to fill. A room reads calmer when surfaces keep about a third of their area clear, and one deliberately bare wall or corner gives the eye a place to rest. Removing one object is often stronger than adding one.',
    keywords: ['empty', 'clutter', 'minimal', 'calm', 'busy', 'crowded', 'space', 'declutter'],
  },
  {
    id: 'rule-of-three',
    name: 'The rule of three',
    body:
      'Objects group best in odd numbers, three especially, with varied heights within the group. A tall piece, a medium piece, and a low piece on a shelf or table reads composed; pairs and rows read staged.',
    keywords: ['shelf', 'styling', 'decor', 'objects', 'vignette', 'group', 'arrangement', 'table'],
  },
  {
    id: 'scale-proportion',
    name: 'Scale and proportion',
    body:
      'Furniture should match the scale of the room and of its neighbors: small rooms take fewer, slightly larger pieces better than many small ones, and side tables should land within a few centimeters of the sofa arm height. When something feels wrong but you cannot name it, it is usually scale.',
    keywords: ['small', 'large', 'size', 'scale', 'proportion', 'fit', 'cramped', 'oversized'],
  },
  {
    id: 'focal-point',
    name: 'One focal point per room',
    body:
      'Each room should have a single visual entry point - a fireplace, a window, a large artwork, a bold piece of furniture - with everything else arranged in support. Two competing focal points split a room; none leaves it aimless.',
    keywords: ['focal', 'artwork', 'wall', 'fireplace', 'statement', 'centerpiece', 'attention'],
  },
  {
    id: 'texture-mixing',
    name: 'Texture over color',
    body:
      'A restrained palette stays interesting through texture: wood against wool, ceramic against linen, matte against glazed. If a room feels flat but you do not want more color, add a contrasting material instead.',
    keywords: ['texture', 'material', 'flat', 'boring', 'wood', 'linen', 'wool', 'ceramic', 'layered'],
  },
  {
    id: 'biophilic',
    name: 'Biophilic design',
    body:
      'People measurably relax around natural materials, plants, and daylight. Wood grain, stone, rattan, linen, and living plants lower the visual temperature of a room; even one large plant or a natural-fiber basket shifts how a corner feels.',
    keywords: ['plant', 'natural', 'green', 'rattan', 'bamboo', 'organic', 'nature', 'daylight'],
  },
  {
    id: 'wabi-sabi',
    name: 'Wabi-sabi',
    body:
      'The Japanese aesthetic of imperfection and age: hand-thrown ceramics, visible grain, patina, asymmetry. It rewards fewer, more honest objects over many perfect ones, and it pairs naturally with negative space.',
    keywords: ['imperfect', 'handmade', 'ceramic', 'patina', 'japanese', 'rustic', 'aged', 'honest'],
  },
  {
    id: 'japandi',
    name: 'Japandi',
    body:
      'The overlap of Japanese restraint and Scandinavian warmth: light woods, low clean-lined furniture, muted earth tones, function first. It suits rooms that want minimalism without coldness.',
    keywords: ['scandinavian', 'japanese', 'minimal', 'light', 'wood', 'muted', 'low', 'clean'],
  },
  {
    id: 'hygge',
    name: 'Hygge',
    body:
      'The Danish idea of lived-in comfort: layered soft textiles, pools of warm lamp light rather than bright overheads, and seating that invites staying. It is built from throws, cushions, candles-height lighting, and materials you want to touch.',
    keywords: ['cozy', 'comfort', 'throw', 'blanket', 'cushion', 'soft', 'winter', 'reading', 'nook'],
  },
  {
    id: 'vertical-space',
    name: 'Use the vertical',
    body:
      'Rooms are designed floor-first but read wall-first. Shelving, art hung at eye level (center around 145-152 cm), and taller plants or lamps pull the eye up and make low rooms feel larger. Bare walls above furniture height are usable space.',
    keywords: ['wall', 'shelf', 'shelving', 'tall', 'height', 'ceiling', 'art', 'hang', 'storage'],
  },
  {
    id: 'traffic-flow',
    name: 'Traffic flow',
    body:
      'Leave clear walking lines through a room - roughly 75-90 cm for main paths, 45 cm between coffee table and sofa. A beautiful piece placed in a path becomes an obstacle within a week; check the walk before the look.',
    keywords: ['flow', 'path', 'walk', 'layout', 'arrangement', 'doorway', 'narrow', 'obstacle'],
  },
  {
    id: 'symmetry-balance',
    name: 'Balance without symmetry',
    body:
      'Perfect symmetry reads formal; total asymmetry reads accidental. Aim for balanced visual weight instead - a large piece on one side answered by a grouping on the other. Match weights, not shapes.',
    keywords: ['symmetry', 'balance', 'formal', 'pairs', 'weight', 'asymmetric', 'composition'],
  },
  {
    id: 'material-honesty',
    name: 'Material honesty',
    body:
      'Materials age best when they are what they look like: real wood, real stone, real fiber. Imitation surfaces read fine on day one and cheap by year three. When budget forces a choice, a smaller honest piece outlasts a larger imitation.',
    keywords: ['quality', 'budget', 'cheap', 'real', 'solid', 'veneer', 'durable', 'invest'],
  },
  {
    id: 'zoning',
    name: 'Zoning open spaces',
    body:
      'Open plans need visible zones: a rug bounds the sitting area, a console or open shelf marks where one function ends, lighting changes signal the next. Furniture placement, not walls, does the room-dividing.',
    keywords: ['open', 'plan', 'zone', 'divide', 'studio', 'multifunction', 'areas', 'console'],
  },
];
