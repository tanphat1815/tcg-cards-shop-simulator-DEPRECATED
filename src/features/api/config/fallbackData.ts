import type { TcgSetSummary } from '../../inventory/store/apiStore';

export const FALLBACK_SETS: TcgSetSummary[] = [
  {
    id: 'base1',
    name: 'Base Set (Legacy)',
    serie: { id: 'base', name: 'Base' },
    cardCount: 102,
    evPrice: 5.5,
    boosters: []
  },
  {
    id: 'base2',
    name: 'Jungle (Legacy)',
    serie: { id: 'base', name: 'Base' },
    cardCount: 64,
    evPrice: 4.2,
    boosters: []
  }
];

export const FALLBACK_CARDS: Record<string, any[]> = {
  'base1': [
    { id: 'base1-1', name: 'Alakazam', rarity: 'Rare Holo', supertype: 'Pokémon', types: ['Psychic'], pricing: { tcgplayer: { normal: { marketPrice: 25.0 } } } },
    { id: 'base1-2', name: 'Blastoise', rarity: 'Rare Holo', supertype: 'Pokémon', types: ['Water'], pricing: { tcgplayer: { normal: { marketPrice: 85.0 } } } },
    { id: 'base1-3', name: 'Chansey', rarity: 'Rare Holo', supertype: 'Pokémon', types: ['Colorless'], pricing: { tcgplayer: { normal: { marketPrice: 15.0 } } } },
    { id: 'base1-4', name: 'Charizard', rarity: 'Rare Holo', supertype: 'Pokémon', types: ['Fire'], pricing: { tcgplayer: { normal: { marketPrice: 350.0 } } } },
    { id: 'base1-44', name: 'Farfetch\'d', rarity: 'Uncommon', supertype: 'Pokémon', types: ['Colorless'], pricing: { tcgplayer: { normal: { marketPrice: 1.5 } } } },
    { id: 'base1-70', name: 'Clefairy Doll', rarity: 'Rare', supertype: 'Trainer', pricing: { tcgplayer: { normal: { marketPrice: 2.0 } } } }
  ]
};
