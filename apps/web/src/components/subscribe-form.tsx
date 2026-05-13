'use client';

import { useState } from 'react';
import { Bell, Loader2, Check, AlertCircle, Mail, Smartphone } from 'lucide-react';

type Status = 'idle' | 'loading' | 'success' | 'error';
type Channel = 'email' | 'phone';

interface SubscribeFormProps {
  /** Visual variant: 'inline' (1-line, used in CTA card) or 'compact' (button-only). */
  variant?: 'inline' | 'compact';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 11-digit CN mainland mobile, first digit 1, second digit 3-9.
const PHONE_RE = /^1[3-9]\d{9}$/;

/**
 * Subscription form — POSTs to /api/alert/subscribe with either an email
 * OR a phone number (user picks one channel). We only collect contacts;
 * no email/SMS is actually sent yet.
 */
export function SubscribeForm({ variant = 'inline' }: SubscribeFormProps) {
  const [channel, setChannel] = useState<Channel>('email');
  const [contact, setContact] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  const placeholder = channel === 'email' ? '邮箱地址' : '手机号（11 位）';
  const inputType = channel === 'email' ? 'email' : 'tel';
  const inputMode = channel === 'email' ? ('email' as const) : ('numeric' as const);
  const autoComplete = channel === 'email' ? 'email' : 'tel';

  const validate = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return channel === 'email' ? '请输入邮箱' : '请输入手机号';
    if (channel === 'email' && !EMAIL_RE.test(trimmed)) return '邮箱格式不正确';
    if (channel === 'phone') {
      const normalised = trimmed.replace(/[\s\-()]/g, '').replace(/^\+?86/, '');
      if (!PHONE_RE.test(normalised)) return '手机号格式不正确（仅支持中国大陆 11 位）';
    }
    return null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate(contact);
    if (err) {
      setStatus('error');
      setMessage(err);
      return;
    }
    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch('/api/alert/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          contact: contact.trim(),
          regions: ['*'],
          serotypes: ['*'],
          threshold: 'crossing',
          source: 'web',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '订阅失败');
      setStatus('success');
      setMessage(data.message || '订阅成功');
      setContact('');
    } catch (err: unknown) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : '订阅失败，请稍后重试');
    }
  };

  // Switch channel: clear field + reset status (less confusing than keeping
  // a stale email when user switches to phone).
  const switchChannel = (next: Channel) => {
    if (next === channel) return;
    setChannel(next);
    setContact('');
    setStatus('idle');
    setMessage('');
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      {/* Channel toggle */}
      <div className="inline-flex self-start rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
        <button
          type="button"
          onClick={() => switchChannel('email')}
          className={`flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors ${
            channel === 'email'
              ? 'bg-brand-500 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
          aria-pressed={channel === 'email'}
        >
          <Mail className="h-3 w-3" />
          邮箱
        </button>
        <button
          type="button"
          onClick={() => switchChannel('phone')}
          className={`flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors ${
            channel === 'phone'
              ? 'bg-brand-500 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
          aria-pressed={channel === 'phone'}
        >
          <Smartphone className="h-3 w-3" />
          手机
        </button>
      </div>

      {/* Contact input + submit */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type={inputType}
          inputMode={inputMode}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          disabled={status === 'loading'}
          maxLength={channel === 'email' ? 254 : 20}
          className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={status === 'loading' || status === 'success'}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 transition-colors whitespace-nowrap"
        >
          {status === 'loading' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : status === 'success' ? (
            <Check className="h-4 w-4" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          {status === 'success' ? '已订阅' : '订阅预警'}
        </button>
      </div>

      {message && (
        <div
          className={`flex items-center gap-1 text-xs ${
            status === 'success' ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {status === 'success' ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
          <span>{message}</span>
        </div>
      )}

      {variant === 'inline' && status !== 'success' && (
        <p className="text-[11px] text-gray-500 leading-relaxed">
          仅在以下情况通知：HPI 跨越阈值 / 聚集地距离圈层变化 / 官方发布新通报。
          <br />
          <span className="text-gray-400">
            当前阶段仅收集信息，邮件 / 短信发送功能上线后会再次提示你确认。
          </span>
        </p>
      )}
    </form>
  );
}
