'use client';

import { useState } from 'react';
import { ArrowLeft, Send, CheckCircle, AlertCircle } from 'lucide-react';

export default function FeedbackPage() {
  const [type, setType] = useState('suggestion');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [honeypot, setHoneypot] = useState(''); // hidden field
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || message.length > 2000) return;

    setStatus('submitting');
    try {
      const res = await fetch('/api/feedback/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, message: message.trim(), contact: contact.trim() || undefined, website: honeypot }),
      });

      if (res.ok) {
        setStatus('success');
        setMessage('');
        setContact('');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="container-page py-12">
        <div className="card max-w-lg mx-auto text-center">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">提交成功</h1>
          <p className="text-sm text-gray-600 mb-6">感谢你的反馈，我们会认真查看每一条建议。</p>
          <a href="/" className="text-sm text-brand-500 hover:underline">← 返回首页</a>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <a href="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-500 mb-6">
        <ArrowLeft className="h-4 w-4" /> 返回首页
      </a>

      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold mb-2">反馈建议</h1>
        <p className="text-sm text-gray-500 mb-6">匿名提交，帮助我们改进病毒观察。你的反馈不会被关联到任何个人信息。</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">反馈类型</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
            >
              <option value="suggestion">💡 功能建议</option>
              <option value="bug">🐛 报告问题</option>
              <option value="other">💬 其他</option>
            </select>
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              反馈内容 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={2000}
              required
              placeholder="请详细描述你的建议或遇到的问题..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none resize-y"
            />
            <p className="text-xs text-gray-400 mt-1">{message.length}/2000</p>
          </div>

          {/* Contact (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">联系方式（选填）</label>
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="邮箱或手机号，方便我们回复"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
            />
          </div>

          {/* Honeypot — hidden from humans, visible to bots */}
          <div className="absolute opacity-0 pointer-events-none" aria-hidden="true">
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>

          {/* Error */}
          {status === 'error' && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              提交失败，请稍后重试。如果问题持续，请通过其他渠道联系我们。
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={status === 'submitting' || !message.trim()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
            {status === 'submitting' ? '提交中...' : '匿名提交'}
          </button>
        </form>
      </div>
    </div>
  );
}
