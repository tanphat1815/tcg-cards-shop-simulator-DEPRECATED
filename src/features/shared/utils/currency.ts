import { GAME_BALANCE } from '../../../config/gameConfig'

/**
 * Currency and Pricing Utilities
 * Centralized logic for formatting and calculating TCG card prices.
 */

/**
 * Formats a USD price into VND string using a fixed exchange rate.
 * @param priceUsd - The price in US Dollars.
 * @returns A formatted VND currency string.
 */
export const formatVND = (priceUsd: number): string => {
  return new Intl.NumberFormat('vi-VN', { 
    style: 'currency', 
    currency: 'VND',
    maximumFractionDigits: 0
  }).format(priceUsd * GAME_BALANCE.ECONOMY.EXCHANGE_RATE_USD_TO_VND)
}

/**
 * Formats a number as a USD currency string.
 * @param price - The price in US Dollars.
 * @returns A formatted USD string (e.g., "$12.34").
 */
export const formatUSD = (price: number | string): string => {
  const num = typeof price === 'string' ? parseFloat(price) : price
  return `$${num.toFixed(2)}`
}

/**
 * Extracts the most appropriate raw market price from a card's pricing object.
 * Checks TCGPlayer categories (normal, holofoil, etc.) and Cardmarket trends as fallbacks.
 * @param card - The card object containing pricing data.
 * @returns The raw numeric price in USD.
 */
export const getRawPrice = (card: any): number => {
  const tcg = card?.pricing?.tcgplayer
  if (tcg) {
    const categories = ['normal', 'holofoil', 'reverse', 'reverse-holofoil', 'unlimited', 'unlimited-holofoil']
    for (const cat of categories) {
      if (tcg[cat]?.marketPrice) return Number(tcg[cat].marketPrice)
      if (tcg[cat]?.midPrice) return Number(tcg[cat].midPrice)
    }
  }
  
  const cm = card?.pricing?.cardmarket
  if (cm) {
    const val = cm.avg || cm.trend || cm.avg1 || cm.avg7
    if (val) return Number(val)
  }
  
  return 0
}

/**
 * Returns a formatted market price string in USD.
 * @param card - The card object containing pricing data.
 * @returns A USD string or 'N/A' if no price is found.
 */
export const getMarketPrice = (card: any): string => {
  const price = getRawPrice(card)
  return price > 0 ? formatUSD(price) : 'N/A'
}
