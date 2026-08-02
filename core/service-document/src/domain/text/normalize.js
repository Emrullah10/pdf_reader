const TURKISH_UPPER_TO_LOWER = {
  İ: 'i',
  I: 'ı',
  Ş: 'ş',
  Ğ: 'ğ',
  Ü: 'ü',
  Ö: 'ö',
  Ç: 'ç',
};

const TURKISH_TO_ASCII_FOLD = {
  ı: 'i',
  ş: 's',
  ğ: 'g',
  ü: 'u',
  ö: 'o',
  ç: 'c',
};

const applyTurkishCasing = (text) =>
  text.replace(/[İIŞĞÜÖÇ]/g, (ch) => TURKISH_UPPER_TO_LOWER[ch] ?? ch.toLowerCase());

const foldTurkishToAscii = (text) =>
  text.replace(/[ışğüöç]/g, (ch) => TURKISH_TO_ASCII_FOLD[ch] ?? ch);

const stripDiacritics = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '');

export const normalize = (text) => {
  const turkishLowercased = applyTurkishCasing(text);
  const restLowercased = turkishLowercased.toLowerCase();
  const folded = foldTurkishToAscii(restLowercased);
  const stripped = stripDiacritics(folded);
  return stripped.replace(/\s+/g, ' ').trim();
};
