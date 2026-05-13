'use client';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container-page py-12 text-center">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">页面加载出错</h1>
      <p className="text-sm text-gray-500 mb-6">
        {error.message || '发生了意外错误，请稍后重试。'}
      </p>
      <button
        onClick={reset}
        className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
      >
        重新加载
      </button>
      <p className="mt-4 text-xs text-gray-400">
        如果问题持续，请通过 <a href="/feedback" className="text-brand-500 underline">反馈页</a> 向我们报告。
      </p>
    </div>
  );
}
