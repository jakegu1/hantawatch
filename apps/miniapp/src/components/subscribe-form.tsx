/**
 * Email-based alert subscription form for the miniapp.
 * Sends to the same /api/alert/subscribe endpoint as the web app.
 */

import { View, Text, Input, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';

const API_BASE = 'https://bingduguancha.com/api';

export function SubscribeForm() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const v = email.trim();
    if (!v) {
      Taro.showToast({ title: '请输入邮箱', icon: 'none' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      Taro.showToast({ title: '邮箱格式不正确', icon: 'none' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await Taro.request({
        url: `${API_BASE}/alert/subscribe`,
        method: 'POST',
        data: { email: v, regions: [], serotypes: [], threshold: 60 },
        header: { 'Content-Type': 'application/json' },
      });
      if (res.statusCode >= 200 && res.statusCode < 300) {
        Taro.showToast({ title: '订阅成功', icon: 'success' });
        setEmail('');
      } else {
        Taro.showToast({ title: '订阅失败，请稍后重试', icon: 'none' });
      }
    } catch {
      Taro.showToast({ title: '网络错误', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View>
      <View
        className="flex items-center gap-2"
        style={{
          background: '#fff',
          border: '1rpx solid #e5e7eb',
          borderRadius: '12rpx',
          padding: '8rpx 12rpx',
        }}
      >
        <Input
          type="text"
          value={email}
          placeholder="邮箱地址"
          onInput={(e) => setEmail(e.detail.value)}
          style={{
            flex: 1,
            fontSize: '26rpx',
            color: '#111827',
            padding: '8rpx',
          }}
        />
        <Button
          loading={submitting}
          disabled={submitting}
          onClick={handleSubmit}
          style={{
            background: '#1e40af',
            color: '#fff',
            fontSize: '24rpx',
            padding: '0 20rpx',
            height: '60rpx',
            lineHeight: '60rpx',
            borderRadius: '8rpx',
          }}
        >
          订阅
        </Button>
      </View>
      <Text style={{ fontSize: '20rpx', color: '#9ca3af', display: 'block', marginTop: '8rpx' }}>
        仅在风险等级跨阈值时通知你，不会发送日常推送。
      </Text>
    </View>
  );
}
