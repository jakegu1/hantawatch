import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '隐私政策',
  description: '病毒观察隐私政策。我们不追踪个人身份，仅在你主动订阅时收集邮箱用于发送预警通知。',
};

// Single source of truth: bump on every material change.
const VERSION = '1.0';
const EFFECTIVE_DATE = '2026-05-13';

export default function PrivacyPage() {
  return (
    <div className="container-page py-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">隐私政策</h1>
      <p className="text-xs text-gray-500 mb-8">
        版本 {VERSION} · 生效日期 {EFFECTIVE_DATE}
      </p>

      <div className="prose prose-sm text-gray-700 leading-relaxed space-y-6">
        <section>
          <h2 className="font-semibold text-base text-gray-900">一、我们的承诺</h2>
          <p>
            病毒观察（以下简称“本站”）是一个面向中文用户的病毒疫情预警与信息聚合平台，当前重点监测汉坦病毒。
            我们坚信良好的公共健康信息服务<strong>不需要以牺牲用户隐私为代价</strong>。
            本站默认不收集任何个人身份信息（PII），不使用追踪 cookie，不向第三方出售或共享数据。
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base text-gray-900">二、我们收集什么</h2>

          <h3 className="font-medium text-sm text-gray-800 mt-3">2.1 你主动提交的信息</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>邮箱地址</strong>：仅当你主动填写"订阅预警通知"表单时收集，用于发送 HPI 阈值变化、聚集地距离圈层变化、官方发布新通报等触发式预警邮件。
              你可以随时通过任意一封通知邮件底部的链接退订。
            </li>
            <li>
              <strong>反馈内容</strong>：当你通过 <a href="/feedback" className="text-brand-500 underline">/feedback</a>{' '}
              页面提交反馈时，我们会保存你填写的文本内容。提交是匿名的，除非你在文本中主动留下联系方式。
            </li>
          </ul>

          <h3 className="font-medium text-sm text-gray-800 mt-3">2.2 自动收集的匿名信息</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>访问统计</strong>：我们记录页面路径、访问时间戳、来源域名（referer）、用户代理（user agent），用于优化产品。
              <strong>不记录 IP 地址，不设置永久 cookie，不进行跨站追踪。</strong>
            </li>
            <li>
              <strong>错误日志</strong>：当前端或后端发生错误时，我们记录错误堆栈以便排查问题，<strong>不包含任何用户输入</strong>。
            </li>
          </ul>

          <h3 className="font-medium text-sm text-gray-800 mt-3">2.3 我们不会收集的信息</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>真实姓名、身份证号、手机号</li>
            <li>身体健康信息、症状描述、就诊记录</li>
            <li>位置信息（GPS）</li>
            <li>通讯录、相册、麦克风、摄像头权限</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base text-gray-900">三、信息的使用与共享</h2>
          <p>
            收集到的邮箱仅用于发送预警通知。我们<strong>不会</strong>：
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>把邮箱出售给任何第三方</li>
            <li>把邮箱用于发送商业广告</li>
            <li>把邮箱用于发送非汉坦病毒相关内容</li>
          </ul>
          <p className="mt-2">
            反馈内容仅本站维护者可见，用于产品改进，不会公开。
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base text-gray-900">四、数据存储与安全</h2>
          <p>
            邮箱与反馈数据存储在云数据库中，使用 TLS 加密传输。我们采取合理技术措施防止未授权访问，但<strong>互联网环境无法做到绝对安全</strong>。
            如果你强烈在意隐私，请使用临时邮箱订阅。
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base text-gray-900">五、你的权利</h2>
          <p>你随时可以：</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>退订邮件预警（通过任意一封通知邮件底部的退订链接）</li>
            <li>要求删除你的邮箱与反馈记录：发送邮件至{' '}
              <a href="mailto:privacy@bingduguancha.com" className="text-brand-500 underline">privacy@bingduguancha.com</a>
              ，注明你希望删除的邮箱地址</li>
            <li>查询我们存储的与你相关的数据：同上邮箱联系</li>
          </ul>
          <p className="mt-2">我们将在 30 天内响应你的请求。</p>
        </section>

        <section>
          <h2 className="font-semibold text-base text-gray-900">六、未成年人</h2>
          <p>
            本站不主动向 14 岁以下未成年人提供服务。如果你是未成年人的监护人，发现其未经同意在本站留下了邮箱或反馈，
            可联系上述邮箱要求删除。
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base text-gray-900">七、Cookie 使用说明</h2>
          <p>
            本站<strong>不使用任何追踪 cookie</strong>。仅在必要时使用<strong>会话 cookie</strong>
            （如管理后台登录态），会话结束自动清除。
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base text-gray-900">八、变更通知</h2>
          <p>
            如本政策有重大变更，我们会在站点显眼位置公示至少 7 天，并对已订阅邮箱用户发送通知邮件。
            版本号会同步更新。
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base text-gray-900">九、联系我们</h2>
          <p>
            如对本政策有任何疑问，请通过{' '}
            <a href="/feedback" className="text-brand-500 underline">反馈页</a>{' '}
            或邮件{' '}
            <a href="mailto:privacy@bingduguancha.com" className="text-brand-500 underline">
              privacy@bingduguancha.com
            </a>{' '}
            与我们联系。
          </p>
        </section>
      </div>
    </div>
  );
}
