export type RarityTier = 'common' | 'uncommon' | 'rare' | 'ultra' | 'ghost'

export interface RarityAnimConfig {
  tier: RarityTier
  flipClass: string;     // Class của wrapper để quay nhiều vòng
  duration: number;      // ms
  glowColor: string;
}

export const RARITY_ANIM_CONFIG: Record<RarityTier, RarityAnimConfig> = {
  common: { tier: 'common', flipClass: 'flip-normal', duration: 600, glowColor: 'transparent' },
  uncommon: { tier: 'uncommon', flipClass: 'flip-normal', duration: 600, glowColor: 'rgba(59, 130, 246, 0.4)' },
  rare: { tier: 'rare', flipClass: 'flip-extra-spin', duration: 1200, glowColor: 'rgba(234, 179, 8, 0.6)' },
  ultra: { tier: 'ultra', flipClass: 'flip-multi-spin', duration: 1800, glowColor: 'rgba(168, 85, 247, 0.8)' },
  ghost: { tier: 'ghost', flipClass: 'flip-ghost-spin', duration: 2500, glowColor: 'rgba(236, 72, 153, 1)' }
}

export function getRarityConfig(rarity?: string): RarityAnimConfig {
  if (!rarity) return RARITY_ANIM_CONFIG.common;
  const r = rarity.toLowerCase();
  
  // Ghost / Gold / Hyper Rare
  if (r.includes('ghost') || r.includes('hyper') || r.includes('gold') || r.includes('shiny secret')) {
    return RARITY_ANIM_CONFIG.ghost;
  }
  
  // Ultra / Full Art / Special Illustration
  if (r.includes('ultra') || r.includes('full art') || r.includes('illustration') || r.includes('ex') || r.includes('vmax') || r.includes('vstar')) {
    return RARITY_ANIM_CONFIG.ultra;
  }
  
  // Rare / Holo
  if (r.includes('rare') || r.includes('holo') || r.includes('double')) {
    return RARITY_ANIM_CONFIG.rare;
  }
  
  // Uncommon
  if (r.includes('uncommon')) {
    return RARITY_ANIM_CONFIG.uncommon;
  }
  
  return RARITY_ANIM_CONFIG.common;
}
