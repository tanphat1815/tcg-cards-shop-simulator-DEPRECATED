/**
 * POKEMON CARD RARITY MAPPER
 * Maps TCGdex API rarity strings (and variants) to simeydotme/pokemon-cards-css classes.
 * 
 * @param rarity - The rarity string from the API (e.g. "Ultra Rare", "VMAX")
 * @param isReverse - Whether the card is a reverse holo variant
 */
export function mapRarityToCSS(rarity?: string, isReverse: boolean = false): string {
  // 0. Handle Reverse Holo logic first (for Common/Uncommon cards)
  if (isReverse && (!rarity || 
      rarity.toUpperCase() === 'COMMON' || 
      rarity.toUpperCase() === 'UNCOMMON')) {
    return 'reverse holo';
  }

  if (!rarity) return 'common';

  const r = rarity.toUpperCase();

  // 1. Rainbow Rare / Hyper Rare (Hiệu ứng nhũ cầu vồng pastel)
  if (r.includes('RAINBOW') || r.includes('HYPER')) {
    return 'rainbow rare';
  }

  // 2. Secret Rare / Gold (Hiệu ứng 2 lớp nhũ vàng ngược chiều)
  if (r.includes('GOLD') || r.includes('SECRET')) {
    return 'rare secret'; 
  }

  // 3. VMAX và VSTAR (Tách riêng vì thư viện có CSS riêng)
  if (r.includes('VMAX')) return 'rare holo vmax';
  if (r.includes('VSTAR')) return 'rare holo vstar';

  // 4. Amazing Rare (Hiệu ứng nhũ tràn viền đặc biệt)
  if (r.includes('AMAZING')) {
    return 'amazing rare';
  }

  // 5. Full Art / Alternate Art / V / Ultra
  if (r.includes('ALT ART') || r.includes('ALTERNATE')) {
    // Thư viện có hỗ trợ 'rare holo v alternate art' cho pattern riêng
    return 'rare holo v alternate art'; 
  }
  if (r.includes('FULL ART') || r.includes('ULTRA') || r.includes('ILLUSTRATION')) {
    return 'rare ultra';
  }
  if (r === 'V' || r.includes(' V ')) {
    return 'rare holo v';
  }

  // 6. Trainer Gallery / Galarian Gallery (Ánh kim kim loại)
  if (r.includes('TRAINER GALLERY') || r.includes('GALARIAN GALLERY')) {
    return 'trainer gallery holo';
  }

  // 7. Shiny Vault vs Radiant (Tách riêng theo đúng Document)
  if (r.includes('RADIANT')) {
    return 'radiant rare'; // Criss-cross cầu vồng
  }
  if (r.includes('SHINY')) {
    return 'shiny rare';   // Nền giấy bạc (Silver effect)
  }

  // 8. Cosmos / Galaxy Holo (Thường thấy ở thẻ Promo hoặc đời cũ)
  if (r.includes('PROMO') || r.includes('COSMOS') || r.includes('GALAXY')) {
    return 'rare holo cosmos';
  }

  // 9. Standard Holo / ACE SPEC
  if (r.includes('HOLO') || r.includes('ACE SPEC')) {
    return 'rare holo';
  }

  // 10. Reverse Holo (Nếu string có sẵn chữ Reverse)
  if (r.includes('REVERSE')) {
    return 'reverse holo';
  }

  // 11. Phân biệt Uncommon và Common
  if (r.includes('UNCOMMON')) {
    return 'uncommon';
  }

  // Default fallback
  return 'common';
}
