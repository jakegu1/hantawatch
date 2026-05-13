'use client';

import { useState } from 'react';
import { Download, Copy, Check } from 'lucide-react';

/**
 * Client-side share controls. Splits "save image" vs "copy link"
 * so we can use the Web Share API where available and fall back to
 * a direct download link otherwise.
 */
export function ShareActions() {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://bingduguancha.com';
  const posterUrl = '/api/poster?variant=dark';

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(posterUrl);
      if (!res.ok) throw new Error(`Poster fetch failed: ${res.status}`);
      const blob = await res.blob();

      // Prefer Web Share API on mobile (lets user share to RED book / WeChat directly).
      if (navigator.canShare && navigator.canShare({ files: [new File([blob], 'hantawatch.png', { type: 'image/png' })] })) {
        const file = new File([blob], `hantawatch-${new Date().toISOString().slice(0, 10)}.png`, { type: 'image/png' });
        try {
          await navigator.share({
            files: [file],
            title: '汉坦观察 · 每日态势卡',
            text: '了解，而非恐慌。',
          });
          return;
        } catch (err) {
          // User cancelled the share sheet — fall through to download.
          if ((err as Error).name === 'AbortError') return;
        }
      }

      // Fallback: trigger a regular download.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hantawatch-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('保存失败，请长按图片另存。');
    } finally {
      setDownloading(false);
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(siteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('复制失败，请手动复制地址栏链接。');
    }
  }

  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Download className="h-4 w-4" />
        {downloading ? '生成中…' : '保存 / 分享'}
      </button>
      <button
        type="button"
        onClick={handleCopyLink}
        className="rounded-xl border border-gray-200 bg-white text-gray-800 px-4 py-2.5 text-sm font-medium hover:bg-gray-50 flex items-center justify-center gap-2 transition-colors"
      >
        {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        {copied ? '已复制' : '复制链接'}
      </button>
    </div>
  );
}
