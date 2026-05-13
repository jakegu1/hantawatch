import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container-page py-16 text-center">
      <p className="text-6xl font-extrabold text-gray-200 mb-4">404</p>
      <h1 className="text-xl font-bold text-gray-800 mb-2">页面不存在</h1>
      <p className="text-sm text-gray-500 mb-8">
        你访问的页面可能已被移除、链接错误，或暂时不可用。
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          返回首页
        </Link>
        <Link
          href="/wiki"
          className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          查看百科
        </Link>
      </div>
    </div>
  );
}
