/**
 * Ánh xạ độ hiếm (Rarity) từ dữ liệu TCG sang các CSS class tương ứng 
 * dựa trên logic chuẩn từ thư viện simeydotme/pokemon-cards-css.
 */
export const mapRarityToCSS = (rarity: string = '', subtypes: string[] | string | undefined = [], name: string = '', number: string = '', setId: string = ''): string => {
  let r = (rarity || '').toLowerCase();
  const n = (name || '').toUpperCase();
  const sub = Array.isArray(subtypes) 
    ? subtypes.map(s => s.toUpperCase()) 
    : (typeof subtypes === 'string' ? [subtypes.toUpperCase()] : []);
  const num = (number || '').toLowerCase();
  const sid = (setId || '').toLowerCase();

  // 1. Định nghĩa các nhóm thẻ đặc biệt (theo bản gốc Svelte)
  const isShiny = num.startsWith('sv');
  const isGallery = !!num.match(/^[tg]g/i);
  const isPromo = sid === 'swshp';

  // 2. Logic xử lý Rarity cho bộ sưu tập Gallery (TG/GG)
  if (isGallery) {
    r = r.replace(/trainer gallery\s*/g, '');
    if (r.includes('rare holo v') && sub.includes('VMAX')) r = 'rare holo vmax';
    if (r.includes('rare holo v') && sub.includes('VSTAR')) r = 'rare holo vstar';
  }

  // 3. Logic xử lý Rarity cho bộ thẻ Promo
  if (isPromo) {
    const fullId = `${sid}-${num.toUpperCase()}`;
    if (fullId === 'swshp-SWSH076' || fullId === 'swshp-SWSH077') {
      r = 'rare secret';
    } else if (sub.includes('V')) {
      r = 'rare holo v';
    } else if (sub.includes('V-UNION')) {
      r = 'rare holo vunion';
    } else if (sub.includes('VMAX')) {
      r = 'rare holo vmax';
    } else if (sub.includes('VSTAR')) {
      r = 'rare holo vstar';
    } else if (sub.includes('RADIANT')) {
      r = 'radiant rare';
    }
  }

  // 4. Nếu là VSTAR/VMAX nhưng rarity gốc không ghi (fallback)
  if (sub.includes('VSTAR')) return 'rare holo vstar';
  if (sub.includes('VMAX')) return 'rare holo vmax';
  if (sub.includes('V-UNION')) return 'rare holo vunion';
  if (sub.includes('RADIANT')) return 'radiant rare';
  if (n.includes('VSTAR')) return 'rare holo vstar';
  if (n.includes('VMAX')) return 'rare holo vmax';

  // 5. Ánh xạ các trường hợp Rarity chuẩn
  if (r.includes('amazing')) return 'amazing rare';
  if (r.includes('rainbow') || r.includes('hyper')) return 'rare rainbow';
  if (r.includes('secret') || r.includes('gold')) return 'rare secret';
  if (r.includes('radiant')) return 'radiant rare';
  if (r.includes('shiny')) {
    if (r.includes('vmax')) return 'rare shiny vmax';
    if (r.includes('v')) return 'rare shiny v';
    return 'rare shiny';
  }
  if (r.includes('ultra') || r.includes('full art') || r.includes('illustration')) return 'rare ultra';
  if (r.includes('vmax')) return 'rare holo vmax';
  if (r.includes('vstar')) return 'rare holo vstar';
  if (r.includes('holo v')) return 'rare holo v';
  if (r.includes('cosmos') || r.includes('galaxy')) return 'rare holo cosmos';
  if (r.includes('reverse')) return 'reverse holo';
  if (r.includes('holo')) return 'rare holo';

  return r || 'common';
};

/**
 * Logic tạo đường dẫn Mask/Foil từ CDN (Dựa trên hàm foilMaskImage của Svelte)
 */
export const getFoilMaskURL = (card: any, rarityClass: string, type: 'foils' | 'masks' = 'foils'): string => {
  if (!card) return '';
  const server = 'https://poke-holo.b-cdn.net';
  
  const subtypes = Array.isArray(card.subtypes) ? card.subtypes.map((s: string) => s.toUpperCase()) : [];
  const number = String(card.number || '').toLowerCase();
  const set = String(card.set?.id || card.set_id || card.set || '').toLowerCase();
  
  // 1. Chuẩn hóa mã thẻ và mã bộ
  const fNumber = number.replace('swsh', '').padStart(3, '0');
  let fSet = set.replace(/(tg|gg|sv)/g, '').replace('.', 'pt');
  
  // Đặc biệt cho Shining Fates (swsh4.5 -> swsh45)
  if (fSet === 'swsh4pt5') fSet = 'swsh45';
  
  const isShiny = number.startsWith('sv');
  const isGallery = !!number.match(/^[tg]g/i);

  let etch = 'holo';
  let style = 'reverse';

  // 2. Logic phân loại dựa trên Rarity Class (Dựa trên bản gốc Svelte - dùng Sequential IF để ghi đè)
  const fRarity = rarityClass.toLowerCase();

  if (fRarity === 'rare holo') {
    style = 'swholo';
  } 
  
  if (fRarity === 'rare holo cosmos') {
    style = 'cosmos';
  } 
  
  if (fRarity === 'radiant rare') {
    etch = 'etched';
    style = 'radiantholo';
  } 
  
  if (fRarity.includes('vunion') || fRarity.includes('basic v') || fRarity === 'rare holo v') {
    etch = 'holo';
    style = 'sunpillar';
  } 
  
  if (fRarity.includes('vmax') || fRarity.includes('vstar') || fRarity === 'rare ultra') {
    etch = 'etched';
    style = 'sunpillar';
  } 
  
  if (fRarity === 'amazing rare' || fRarity.includes('rainbow') || fRarity.includes('secret')) {
    etch = 'etched';
    style = 'swsecret';
  }

  // 3. Ghi đè logic cho thẻ Shiny Vault
  if (isShiny) {
    etch = 'etched';
    style = 'sunpillar';
    if (fRarity.includes('vmax')) {
      style = 'swsecret';
    }
  }

  // 4. Ghi đè logic cho thẻ Gallery
  if (isGallery) {
    etch = 'holo';
    style = 'rainbow';
    // Mọi loại thẻ V trong Gallery đều dùng sunpillar
    if (fRarity.includes(' v ') || fRarity.includes('vmax') || fRarity.includes('vstar') || fRarity.includes('ultra')) {
      etch = 'etched';
      style = 'sunpillar';
    }
    if (fRarity.includes('secret')) {
      etch = 'etched';
      style = 'swsecret';
    }
  }

  // 5. Ghép URL hoàn chỉnh
  return `${server}/foils/${fSet}/${type}/upscaled/${fNumber}_foil_${etch}_${style}_2x.webp`;
};
