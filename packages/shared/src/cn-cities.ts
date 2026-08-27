/** Static mainland China city reference — geographic constants, not outbreak facts. */

export interface CnCity {
  nameZh: string;
  provinceZh: string;
  lat: number;
  lon: number;
}

/** Provincial capitals, municipalities, and major cities (offline-first picker). */
export const CN_CITIES: readonly CnCity[] = [
  // 直辖市
  { nameZh: '北京', provinceZh: '北京市', lat: 39.9042, lon: 116.4074 },
  { nameZh: '天津', provinceZh: '天津市', lat: 39.0842, lon: 117.2008 },
  { nameZh: '上海', provinceZh: '上海市', lat: 31.2304, lon: 121.4737 },
  { nameZh: '重庆', provinceZh: '重庆市', lat: 29.563, lon: 106.5516 },
  // 省会
  { nameZh: '石家庄', provinceZh: '河北省', lat: 38.0428, lon: 114.5149 },
  { nameZh: '太原', provinceZh: '山西省', lat: 37.8706, lon: 112.5489 },
  { nameZh: '呼和浩特', provinceZh: '内蒙古自治区', lat: 40.8183, lon: 111.6708 },
  { nameZh: '沈阳', provinceZh: '辽宁省', lat: 41.8045, lon: 123.4328 },
  { nameZh: '长春', provinceZh: '吉林省', lat: 43.8171, lon: 125.3235 },
  { nameZh: '哈尔滨', provinceZh: '黑龙江省', lat: 45.8038, lon: 126.5349 },
  { nameZh: '南京', provinceZh: '江苏省', lat: 32.0603, lon: 118.7969 },
  { nameZh: '杭州', provinceZh: '浙江省', lat: 30.2741, lon: 120.1551 },
  { nameZh: '合肥', provinceZh: '安徽省', lat: 31.8206, lon: 117.2272 },
  { nameZh: '福州', provinceZh: '福建省', lat: 26.0745, lon: 119.2965 },
  { nameZh: '南昌', provinceZh: '江西省', lat: 28.6829, lon: 115.8581 },
  { nameZh: '济南', provinceZh: '山东省', lat: 36.6519, lon: 117.1205 },
  { nameZh: '郑州', provinceZh: '河南省', lat: 34.7466, lon: 113.6254 },
  { nameZh: '武汉', provinceZh: '湖北省', lat: 30.5928, lon: 114.3055 },
  { nameZh: '长沙', provinceZh: '湖南省', lat: 28.2282, lon: 112.9388 },
  { nameZh: '广州', provinceZh: '广东省', lat: 23.1291, lon: 113.2644 },
  { nameZh: '南宁', provinceZh: '广西壮族自治区', lat: 22.8172, lon: 108.3661 },
  { nameZh: '海口', provinceZh: '海南省', lat: 20.0311, lon: 110.3312 },
  { nameZh: '成都', provinceZh: '四川省', lat: 30.5723, lon: 104.0665 },
  { nameZh: '贵阳', provinceZh: '贵州省', lat: 26.6477, lon: 106.6302 },
  { nameZh: '昆明', provinceZh: '云南省', lat: 24.8801, lon: 102.8329 },
  { nameZh: '拉萨', provinceZh: '西藏自治区', lat: 29.6469, lon: 91.1172 },
  { nameZh: '西安', provinceZh: '陕西省', lat: 34.3416, lon: 108.9398 },
  { nameZh: '兰州', provinceZh: '甘肃省', lat: 36.0611, lon: 103.8343 },
  { nameZh: '西宁', provinceZh: '青海省', lat: 36.6171, lon: 101.7782 },
  { nameZh: '银川', provinceZh: '宁夏回族自治区', lat: 38.4872, lon: 106.2309 },
  { nameZh: '乌鲁木齐', provinceZh: '新疆维吾尔自治区', lat: 43.8256, lon: 87.6168 },
  { nameZh: '台北', provinceZh: '台湾省', lat: 25.033, lon: 121.5654 },
  { nameZh: '香港', provinceZh: '香港特别行政区', lat: 22.3193, lon: 114.1694 },
  { nameZh: '澳门', provinceZh: '澳门特别行政区', lat: 22.1987, lon: 113.5439 },
  // 主要城市
  { nameZh: '深圳', provinceZh: '广东省', lat: 22.5431, lon: 114.0579 },
  { nameZh: '青岛', provinceZh: '山东省', lat: 36.0671, lon: 120.3826 },
  { nameZh: '大连', provinceZh: '辽宁省', lat: 38.914, lon: 121.6147 },
  { nameZh: '厦门', provinceZh: '福建省', lat: 24.4798, lon: 118.0894 },
];

export function findCity(nameZh: string): (typeof CN_CITIES)[number] | undefined {
  return CN_CITIES.find((c) => c.nameZh === nameZh);
}
