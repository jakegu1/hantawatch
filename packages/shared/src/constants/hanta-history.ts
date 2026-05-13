/**
 * Curated historical milestones in hantavirus discovery, outbreaks and policy.
 * Sourced from CDC / WHO / peer-reviewed reviews. Add new entries with full
 * citation in the description field.
 */

export interface HantaHistoryEvent {
  /** ISO date string. Use YYYY for year-only events. */
  date: string;
  year: number;
  /** Event category for color coding. */
  type: 'discovery' | 'outbreak' | 'policy' | 'science';
  titleZh: string;
  descriptionZh: string;
  serotypeId?: string;
  /** Optional source citation. */
  source?: string;
}

export const HANTA_HISTORY: HantaHistoryEvent[] = [
  {
    date: '1951',
    year: 1951,
    type: 'outbreak',
    titleZh: '朝鲜战争中的"未明热病"',
    descriptionZh:
      '朝鲜战争期间，联合国军中爆发约 3,000 例不明原因发热伴肾衰竭，病死率约 10%。这是 HFRS 在国际上首次大规模被记录，但当时病原体未知。',
  },
  {
    date: '1976',
    year: 1976,
    type: 'discovery',
    titleZh: '韩国汉滩河首次分离汉滩病毒',
    descriptionZh:
      '李镐汪团队从黑线姬鼠肺组织中分离出导致 HFRS 的病原体，命名为汉滩病毒（Hantaan virus）。汉坦病毒科自此命名。',
    serotypeId: 'hantaan',
  },
  {
    date: '1980',
    year: 1980,
    type: 'science',
    titleZh: '中国确认 HFRS 由汉滩病毒引起',
    descriptionZh:
      '中国研究者在国内 HFRS 病例中分离到汉滩病毒，并确认为本国 HFRS 主要病原体。HFRS 此后纳入中国法定报告传染病。',
    serotypeId: 'hantaan',
  },
  {
    date: '1982',
    year: 1982,
    type: 'discovery',
    titleZh: '汉城型病毒在城市褐家鼠中发现',
    descriptionZh:
      '研究者从褐家鼠中分离出汉城病毒，揭示 HFRS 不只是农村疾病，城市居民也面临风险。',
    serotypeId: 'seoul',
  },
  {
    date: '1993',
    year: 1993,
    type: 'outbreak',
    titleZh: '美国"四角地区"HPS 暴发',
    descriptionZh:
      '美国西南部四角地区出现急性呼吸衰竭聚集病例，CDC 分离出新病毒并命名为辛诺柏（Sin Nombre），首次确认汉坦病毒可引起肺综合征（HPS），病死率 30-40%。',
    serotypeId: 'sin_nombre',
  },
  {
    date: '1994',
    year: 1994,
    type: 'policy',
    titleZh: '中国汉滩/汉城型双价疫苗上市',
    descriptionZh:
      '中国成为全球首个推出大规模 HFRS 灭活疫苗的国家，针对汉滩型和汉城型双价。在高发省份高风险人群中推广接种。',
  },
  {
    date: '1995',
    year: 1995,
    type: 'discovery',
    titleZh: '阿根廷首次分离安第斯病毒',
    descriptionZh:
      '从巴塔哥尼亚地区 HPS 患者中分离出安第斯（Andes）病毒。1996 年 El Bolsón 暴发提示该病毒可在密切接触者间传播。',
    serotypeId: 'andes',
  },
  {
    date: '1996',
    year: 1996,
    type: 'science',
    titleZh: '安第斯型确认人际传播',
    descriptionZh:
      '阿根廷 El Bolsón 镇 HPS 暴发的流行病学和分子证据均指向人际传播链。安第斯型成为目前唯一确认可人传人的汉坦病毒。',
    serotypeId: 'andes',
  },
  {
    date: '2008',
    year: 2008,
    type: 'policy',
    titleZh: '中国 HFRS 报告病例进入持续低位',
    descriptionZh:
      '受灭活疫苗推广和爱国卫生运动影响，中国 HFRS 年报告病例从 1980 年代峰值（约 10 万例）回落至每年 1-2 万例区间，并在此后保持稳定。',
  },
  {
    date: '2018',
    year: 2018,
    type: 'science',
    titleZh: '泛美卫生组织发布 HPS 应对指南',
    descriptionZh:
      'PAHO 综合阿根廷/智利/巴西多年监测数据，发布 HPS 临床和实验室应对指南，标准化诊断和报告流程。',
  },
  {
    date: '2026-05',
    year: 2026,
    type: 'outbreak',
    titleZh: 'MV Hondius 邮轮 Andes 聚集疫情',
    descriptionZh:
      '南美洲海域 MV Hondius 邮轮上出现 Andes 病毒聚集性病例，7 例确诊 3 例死亡。WHO/CDC/ECDC 一致评估对公众风险为低，无邮轮外社区传播。',
    serotypeId: 'andes',
    source: 'WHO Disease Outbreak News, 2026-05',
  },
];

export const HANTA_HISTORY_TYPE_META: Record<
  HantaHistoryEvent['type'],
  { labelZh: string; color: string }
> = {
  discovery: { labelZh: '病毒发现', color: '#0891b2' },
  outbreak: { labelZh: '疫情事件', color: '#dc2626' },
  policy: { labelZh: '政策/疫苗', color: '#16a34a' },
  science: { labelZh: '科学进展', color: '#7c3aed' },
};
