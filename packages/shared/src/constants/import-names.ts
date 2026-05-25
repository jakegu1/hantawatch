/**
 * ISO2 → Chinese country name (MV Hondius import / ArcGIS ledger).
 * Keep in sync with `IMPORT_NAME_ZH` in services/collector/.../builder.py.
 */
export const IMPORT_NAME_ZH: Record<string, string> = {
  AR: '阿根廷',
  CL: '智利',
  BR: '巴西',
  US: '美国',
  CA: '加拿大',
  ES: '西班牙',
  FR: '法国',
  DE: '德国',
  IT: '意大利',
  GB: '英国',
  UK: '英国',
  NL: '荷兰',
  PT: '葡萄牙',
  CH: '瑞士',
  AU: '澳大利亚',
  NZ: '新西兰',
  JP: '日本',
  KR: '韩国',
  TH: '泰国',
  IN: '印度',
  ZA: '南非',
  MX: '墨西哥',
  BE: '比利时',
  GR: '希腊',
  IE: '爱尔兰',
  SG: '新加坡',
  TR: '土耳其',
};

export function importNameZh(iso2: string): string {
  const key = iso2.toUpperCase();
  return IMPORT_NAME_ZH[key] ?? key;
}
