/**
 * Normalizes text by removing accents/diacritics and converting to lowercase
 * @param text - The text to normalize
 * @returns Normalized text without accents
 */
export function normalizeText(text: string): string {
    return text
        .normalize('NFD') // Decompose combined characters
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .toLowerCase()
        .trim()
}
