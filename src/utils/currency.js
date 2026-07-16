/**
 * Helper function to extract the currency symbol from workspace settings.
 * @param {object|string} settings - The settings JSON string or parsed object from the workspace.
 * @returns {string} The currency symbol (e.g. '$', '₹', '€', '£').
 */
export function getCurrencySymbol(settings) {
  if (!settings) return '$';
  
  try {
    const parsedSettings = typeof settings === 'string'
      ? JSON.parse(settings)
      : settings;
      
    const currencyString = parsedSettings?.currency;
    if (!currencyString) return '$';
    
    if (currencyString.includes('₹') || currencyString.toLowerCase().includes('inr')) return '₹';
    if (currencyString.includes('€') || currencyString.toLowerCase().includes('eur')) return '€';
    if (currencyString.includes('£') || currencyString.toLowerCase().includes('gbp')) return '£';
  } catch (error) {
    console.error('Error parsing currency settings:', error);
  }
  
  return '$';
}
