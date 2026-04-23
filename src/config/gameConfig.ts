/**
 * Game Balance and Configuration Constants
 * Centralized location for all hardcoded values to facilitate balancing and scaling.
 */

export const GAME_BALANCE = {
  // NPC Spawn and Limits
  NPC: {
    SPAWN_DELAY_MS: 3000,
    MAX_COUNT: 15,
    MAX_WAITING_CUSTOMERS: 10,
    BOREDOM_TIMEOUT_MS: 45000, // 45 seconds before leaving
    INTENT_CHANCES: {
      PLAY: 0.25, // 25% chance to PLAY
      SELL: 0.05, // 5% chance to SELL (if Level >= 5)
      BUY: 0.70,  // Remaining 70% chance to BUY
    },
    MIN_LEVEL_FOR_SELL: 5,
    STUCK_CHECK_DELAY_MS: 3000, // 3 seconds to check if stuck
  },

  // Player Stats
  PLAYER: {
    BASE_SPEED: 160,
  },

  // Economy & Fees
  ECONOMY: {
    ENTRY_EVENT_FEE: 5,
    BASE_EXP_GAIN: 5,
    MATCH_EXP_GAIN: 50,
    EXCHANGE_RATE_USD_TO_VND: 25000,
  },

  // Gameplay Timings
  TIMING: {
    TICK_MS: 1000, // 1 second real time = 1 minute game time
    MATCH_DURATION_MS: 12000, // 12 seconds per match
    INTERACT_DELAY_MS: 1000,
  },

  // Map & Area
  MAP: {
    SHOP_BOUNDS_PAD: 10,
    TRANSITION_DIST_THRESHOLD: 80,
  },

  // TCGDEX Registry Mapping
  TCGDEX: {
    SERIES_LEVEL_REQUIRED: {
      'base': 1, 'gym': 1, 'neo': 1, 'lc': 1, 'ecard': 1,
      'ex': 11,
      'dp': 21, 'pl': 21, 'hgss': 21, 'col': 21,
      'bw': 31,
      'xy': 41,
      'sm': 51,
      'swsh': 61,
      'sv': 71,
      'tcgp': 80, 'me': 80, 'misc': 80, 'pop': 80, 'tk': 80, 'mc': 80
    } as Record<string, number>,
    SERIES_GENERATION_NAMES: {
      'base': 'GENERATION I',
      'gym': 'GENERATION I',
      'neo': 'GENERATION I',
      'lc': 'GENERATION I',
      'ecard': 'GENERATION I',
      'ex': 'GENERATION III',
      'dp': 'GENERATION IV',
      'pl': 'GENERATION IV',
      'hgss': 'GENERATION IV',
      'col': 'GENERATION IV',
      'bw': 'GENERATION V',
      'xy': 'GENERATION VI',
      'sm': 'GENERATION VII',
      'swsh': 'GENERATION VIII',
      'sv': 'GENERATION IX',
      'tcgp': 'SPECIAL COLLECTIONS'
    } as Record<string, string>
  }
}

export const FALLBACK_ASSETS = {
  CARD_IMAGE: '/src/assets/images/no_image.png',
}
