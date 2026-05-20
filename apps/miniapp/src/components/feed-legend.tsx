import { View, Text } from '@tarojs/components';
import { getFeedDefinition, type FeedDefinition } from '@hantawatch/shared/feed-definitions';

export function FeedLegend({ feedId }: { feedId: FeedDefinition['id'] }) {
  const def = getFeedDefinition(feedId);
  return (
    <View
      style={{
        borderLeft: '4rpx solid #93c5fd',
        paddingLeft: '12rpx',
        marginBottom: '12rpx',
      }}
    >
      <Text style={{ fontSize: '20rpx', color: '#4b5563', lineHeight: 1.5, display: 'block' }}>
        <Text style={{ fontWeight: 600, color: '#374151' }}>{def.titleZh}：</Text>
        {def.meaningZh}
      </Text>
    </View>
  );
}
