/**
 * Escapes the characters that ILIKE treats as wildcards ("%" and "_") and the escape character itself, so the
 * value is matched literally. Use it when ILIKE is only a way to compare without caring about upper/lower case,
 * for example an email: otherwise "ana_1@x.com" would also match "anaX1@x.com".
 */
export const escapeLike = (value: string): string => value.replace(/[\\%_]/g, '\\$&')
