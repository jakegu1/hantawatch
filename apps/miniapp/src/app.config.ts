export default defineAppConfig({
  pages: [
    'pages/home/index',
    'pages/events/mv-hondius/index',
    'pages/data/index',
    'pages/wiki/index',
    'pages/guide/index',
    'pages/countries/index',
    'pages/about/index',
    'pages/feedback/index',
    'pages/privacy/index',
    'pages/terms/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#1e40af',
    navigationBarTitleText: '病毒观察',
    navigationBarTextStyle: 'white',
  },
  tabBar: {
    // WeChat caps tabBar at 5 entries. As of 2026-05-15:
    //   首页 / 各国 / 数据 / 百科 / 防护
    // "关于" was demoted to a二级 page (still in `pages` array, reachable
    // from footer links on home and inside other pages). Rationale: country
    // coverage is a daily-use feature for Chinese students/travellers,
    // whereas "关于" is a one-time read.
    color: '#9ca3af',
    selectedColor: '#1e40af',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      { pagePath: 'pages/home/index',      text: '首页' },
      { pagePath: 'pages/countries/index', text: '各国' },
      { pagePath: 'pages/data/index',      text: '数据' },
      { pagePath: 'pages/wiki/index',      text: '百科' },
      { pagePath: 'pages/guide/index',     text: '防护' },
    ],
  },
});
