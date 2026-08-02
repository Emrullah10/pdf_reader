import { normalize } from './normalize.js';

describe('normalize', () => {
  it('lowercases plain ASCII text', () => {
    expect(normalize('Hello World')).toBe('hello world');
  });

  it('correctly lowercases Turkish dotted I (İ) to dotless i, not i-with-combining-dot', () => {
    expect(normalize('İstanbul')).toBe('istanbul');
  });

  it('correctly lowercases Turkish dotless I to ı, then folds it to i for matching', () => {
    expect(normalize('IŞIK')).toBe('isik');
  });

  it('lowercases other Turkish letters correctly', () => {
    expect(normalize('ŞEHİR ÜNİVERSİTESİ ÇOCUK GÜNEŞ ÖĞRETMEN')).toBe('sehir universitesi cocuk gunes ogretmen');
  });

  it('strips diacritics from non-Turkish accented characters', () => {
    expect(normalize('café')).toBe('cafe');
  });

  it('collapses multiple whitespace characters into a single space', () => {
    expect(normalize('hello    world\t\ntest')).toBe('hello world test');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalize('  hello  ')).toBe('hello');
  });

  it('returns an empty string for an empty input', () => {
    expect(normalize('')).toBe('');
  });
});
