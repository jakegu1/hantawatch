import './index.scss';
import { View, Text, Input, Textarea, Button, Picker } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { submitFeedback, trackPageView } from '@/utils/api';

const FEEDBACK_TYPES = [
  { key: 'suggestion', label: '💡 功能建议' },
  { key: 'bug', label: '🐛 报告问题' },
  { key: 'other', label: '💬 其他' },
];

export default function FeedbackPage() {
  const [typeIndex, setTypeIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useLoad(() => {
    trackPageView('pages/feedback/index');
  });

  async function handleSubmit() {
    const v = message.trim();
    if (!v) {
      Taro.showToast({ title: '请填写反馈内容', icon: 'none' });
      return;
    }
    if (v.length > 2000) {
      Taro.showToast({ title: '内容过长（>2000字）', icon: 'none' });
      return;
    }
    setSubmitting(true);
    try {
      await submitFeedback({
        type: FEEDBACK_TYPES[typeIndex].key,
        message: v,
        contact: contact.trim() || undefined,
      });
      setSuccess(true);
      setMessage('');
      setContact('');
    } catch {
      Taro.showToast({ title: '提交失败，请稍后重试', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <View className="page">
        <View className="card" style={{ textAlign: 'center', marginTop: '64rpx' }}>
          <Text style={{ fontSize: '64rpx', display: 'block' }}>✅</Text>
          <Text style={{ fontSize: '32rpx', fontWeight: 700, color: '#111827', display: 'block', marginTop: '8rpx' }}>
            提交成功
          </Text>
          <Text style={{ fontSize: '24rpx', color: '#6b7280', marginTop: '8rpx', display: 'block', lineHeight: 1.6 }}>
            感谢你的反馈，我们会认真查看每一条建议。
          </Text>
          <View
            className="mt-3"
            onClick={() => Taro.switchTab({ url: '/pages/home/index' })}
            style={{ marginTop: '16rpx' }}
          >
            <Text style={{ fontSize: '24rpx', color: '#1e40af' }}>← 返回首页</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="page">
      <View style={{ padding: '24rpx 24rpx 0 24rpx' }}>
        <Text style={{ fontSize: '40rpx', fontWeight: 700, display: 'block' }}>反馈建议</Text>
        <Text style={{ fontSize: '22rpx', color: '#6b7280', marginTop: '4rpx', display: 'block', lineHeight: 1.6 }}>
          匿名提交，帮助我们改进病毒观察。你的反馈不会被关联到任何个人信息。
        </Text>
      </View>

      <View className="card">
        {/* 类型 */}
        <Text style={{ fontSize: '24rpx', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6rpx' }}>
          反馈类型
        </Text>
        <Picker
          mode="selector"
          range={FEEDBACK_TYPES.map((t) => t.label)}
          value={typeIndex}
          onChange={(e) => setTypeIndex(Number(e.detail.value))}
        >
          <View
            style={{
              border: '1rpx solid #d1d5db',
              borderRadius: '12rpx',
              padding: '16rpx 18rpx',
              fontSize: '26rpx',
              color: '#111827',
              background: '#fff',
            }}
          >
            {FEEDBACK_TYPES[typeIndex].label} ▾
          </View>
        </Picker>

        {/* 内容 */}
        <View className="mt-3">
          <Text style={{ fontSize: '24rpx', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6rpx' }}>
            反馈内容 <Text style={{ color: '#ef4444' }}>*</Text>
          </Text>
          <Textarea
            value={message}
            onInput={(e) => setMessage(e.detail.value)}
            placeholder="请详细描述你的建议或遇到的问题..."
            maxlength={2000}
            autoHeight
            style={{
              width: '100%',
              minHeight: '180rpx',
              border: '1rpx solid #d1d5db',
              borderRadius: '12rpx',
              padding: '16rpx',
              fontSize: '26rpx',
              color: '#111827',
              boxSizing: 'border-box',
              background: '#fff',
            }}
          />
          <Text style={{ fontSize: '20rpx', color: '#9ca3af', marginTop: '4rpx', display: 'block' }}>
            {message.length}/2000
          </Text>
        </View>

        {/* 联系方式 */}
        <View className="mt-3">
          <Text style={{ fontSize: '24rpx', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6rpx' }}>
            联系方式（选填）
          </Text>
          <Input
            type="text"
            value={contact}
            onInput={(e) => setContact(e.detail.value)}
            placeholder="邮箱或手机号，方便我们回复"
            style={{
              border: '1rpx solid #d1d5db',
              borderRadius: '12rpx',
              padding: '16rpx',
              fontSize: '26rpx',
              color: '#111827',
              background: '#fff',
            }}
          />
        </View>

        {/* 提交 */}
        <Button
          loading={submitting}
          disabled={submitting || !message.trim()}
          onClick={handleSubmit}
          style={{
            background: '#1e40af',
            color: '#fff',
            fontSize: '28rpx',
            fontWeight: 500,
            borderRadius: '12rpx',
            marginTop: '24rpx',
            opacity: submitting || !message.trim() ? 0.5 : 1,
          }}
        >
          {submitting ? '提交中...' : '匿名提交'}
        </Button>

        <Text style={{ fontSize: '20rpx', color: '#9ca3af', marginTop: '12rpx', display: 'block', lineHeight: 1.6 }}>
          提交后，仅站点维护者可见。我们不会公开你的反馈，也不会与第三方共享。
        </Text>
      </View>
    </View>
  );
}
