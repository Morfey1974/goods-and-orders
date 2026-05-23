/**
 * Israeli bank institution codes (קוד בנק / מספר בנק).
 * Source: Bank of Israel / MASAV institution list, WikiSavey, public bank directories (2024–2025).
 */
export type IsraeliBank = {
  code: string;
  nameHe: string;
  nameRu: string;
  nameEn: string;
};

export const ISRAELI_BANKS: IsraeliBank[] = [
  { code: '04', nameHe: 'בנק יהב', nameRu: 'Банк Йахав', nameEn: 'Bank Yahav' },
  { code: '09', nameHe: 'בנק הדואר', nameRu: 'Банк почты Израиля', nameEn: 'Israel Post Bank' },
  { code: '10', nameHe: 'בנק לאומי', nameRu: 'Банк Леуми', nameEn: 'Bank Leumi' },
  { code: '11', nameHe: 'בנק דיסקונט', nameRu: 'Банк Дисконт', nameEn: 'Israel Discount Bank' },
  { code: '12', nameHe: 'בנק הפועלים', nameRu: 'Банк а-Поалим', nameEn: 'Bank Hapoalim' },
  { code: '13', nameHe: 'בנק איגוד', nameRu: 'Банк Игуд', nameEn: 'Union Bank of Israel' },
  { code: '14', nameHe: 'בנק אוצר החייל', nameRu: 'Банк Оцар а-Хаиль', nameEn: 'Bank Otsar Ha-Hayal' },
  { code: '17', nameHe: 'בנק מרכנתיל דיסקונט', nameRu: 'Банк Меркантиль Дисконт', nameEn: 'Mercantile Discount Bank' },
  { code: '18', nameHe: 'וואן זירו / בנק דיגיטלי', nameRu: 'One Zero (цифровой банк)', nameEn: 'One Zero Digital Bank' },
  { code: '20', nameHe: 'בנק מזרחי טפחות', nameRu: 'Банк Мизрахи Тефахот', nameEn: 'Mizrahi Tefahot Bank' },
  { code: '22', nameHe: 'סיטיבנק', nameRu: 'Ситибанк', nameEn: 'Citibank' },
  { code: '23', nameHe: 'HSBC', nameRu: 'HSBC', nameEn: 'HSBC Bank' },
  { code: '26', nameHe: 'יובנק (UBank)', nameRu: 'UBank', nameEn: 'UBank' },
  { code: '31', nameHe: 'הבינלאומי הראשון', nameRu: 'Первый международный банк (FIBI)', nameEn: 'First International Bank of Israel' },
  { code: '34', nameHe: 'בנק ערבי ישראלי', nameRu: 'Арабо-израильский банк', nameEn: 'Arab Israel Bank' },
  { code: '39', nameHe: 'סטייט בנק אוף אינדיה', nameRu: 'State Bank of India', nameEn: 'State Bank of India' },
  { code: '46', nameHe: 'בנק מסד', nameRu: 'Банк Масад', nameEn: 'Bank Massad' },
  { code: '52', nameHe: 'בנק פועלי אגודת ישראל', nameRu: 'Банк Паалей Агудат Исраэль', nameEn: 'Poaley Agudat Israel Bank' },
  { code: '54', nameHe: 'בנק ירושלים', nameRu: 'Банк Иерусалима', nameEn: 'Bank of Jerusalem' },
  { code: '68', nameHe: 'מרכנתיל (לשעבר מוניציפל)', nameRu: 'Меркантиль (бывш. муниципальный)', nameEn: 'Mercantile (ex-Municipal)' },
  { code: '99', nameHe: 'בנק ישראל', nameRu: 'Банк Израиля', nameEn: 'Bank of Israel' },
];

export function normalizeBankCode(code: string): string {
  const digits = code.replace(/\D/g, '');
  if (!digits) return '';
  const n = parseInt(digits, 10);
  if (Number.isNaN(n)) return digits;
  return n.toString().padStart(2, '0');
}

export function findIsraeliBank(code: string): IsraeliBank | undefined {
  const norm = normalizeBankCode(code);
  if (!norm) return undefined;
  return ISRAELI_BANKS.find((b) => b.code === norm);
}

export function bankDisplayName(bank: IsraeliBank, lang: string): string {
  if (lang.startsWith('he')) return bank.nameHe;
  if (lang.startsWith('ru')) return bank.nameRu;
  return bank.nameEn;
}

export function resolveBankNameForCode(code: string, lang: string): string {
  const bank = findIsraeliBank(code);
  return bank ? bankDisplayName(bank, lang) : '';
}
