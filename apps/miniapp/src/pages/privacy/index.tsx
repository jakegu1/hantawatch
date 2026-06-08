import './index.scss';
import { View, Text } from '@tarojs/components';
import { useLoad } from '@tarojs/taro';
import { trackPageView } from '@/utils/api';

const VERSION = '1.1';
const EFFECTIVE_DATE = '2026-05-23';

function H2({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontSize: '28rpx',
        fontWeight: 600,
        color: '#111827',
        display: 'block',
        marginTop: '20rpx',
        marginBottom: '8rpx',
      }}
    >
      {children}
    </Text>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontSize: '24rpx',
        fontWeight: 500,
        color: '#374151',
        display: 'block',
        marginTop: '12rpx',
        marginBottom: '4rpx',
      }}
    >
      {children}
    </Text>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontSize: '24rpx',
        color: '#374151',
        display: 'block',
        lineHeight: 1.75,
        marginBottom: '8rpx',
      }}
    >
      {children}
    </Text>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontSize: '24rpx',
        color: '#374151',
        display: 'block',
        lineHeight: 1.7,
        marginLeft: '20rpx',
        marginTop: '4rpx',
      }}
    >
      · {children}
    </Text>
  );
}

export default function PrivacyPage() {
  useLoad(() => {
    trackPageView('pages/privacy/index');
  });

  return (
    <View className="page">
      <View style={{ padding: '24rpx 24rpx 0 24rpx' }}>
        <Text style={{ fontSize: '40rpx', fontWeight: 700, display: 'block' }}>隐私政策</Text>
        <Text style={{ fontSize: '20rpx', color: '#9ca3af', marginTop: '4rpx', display: 'block' }}>
          版本 {VERSION} · 生效日期 {EFFECTIVE_DATE}
        </Text>
      </View>

      <View className="card" style={{ marginBottom: '32rpx' }}>
        <H2>一、我们的承诺</H2>
        <P>
          病毒观察（以下简称"本站"）是一个面向中文用户的病毒疫情预警与信息聚合平台，当前重点监测汉坦病毒。
          我们坚信良好的公共健康信息服务<Text style={{ fontWeight: 600 }}>不需要以牺牲用户隐私为代价</Text>。
          本站默认不收集任何个人身份信息（PII），不使用追踪 cookie，不向第三方出售或共享数据。
        </P>

        <H2>二、我们收集什么</H2>
        <H3>2.1 小程序版本不收集邮箱</H3>
        <P>
          <Text style={{ fontWeight: 600 }}>本微信小程序版本不提供邮箱订阅功能，不收集任何邮箱地址。</Text>
          邮件预警订阅仅通过 Web 版（bingduguancha.com）提供，相关隐私条款详见 Web 版隐私政策。
        </P>
        <H3>2.2 自动收集的匿名信息</H3>
        <Bullet>
          <Text style={{ fontWeight: 600 }}>访问统计</Text>
          ：我们记录页面路径、访问时间戳、来源（如有）、设备型号（user agent），用于优化产品。
          <Text style={{ fontWeight: 600 }}>不记录 IP 地址，不设置永久 cookie，不进行跨站追踪。</Text>
        </Bullet>
        <Bullet>
          <Text style={{ fontWeight: 600 }}>错误日志</Text>
          ：当前端或后端发生错误时，我们记录错误堆栈以便排查问题，
          <Text style={{ fontWeight: 600 }}>不包含任何用户输入</Text>。
        </Bullet>

        <H3>2.3 我们不会收集的信息</H3>
        <Bullet>真实姓名、身份证号、手机号</Bullet>
        <Bullet>身体健康信息、症状描述、就诊记录</Bullet>
        <Bullet>位置信息（GPS）</Bullet>
        <Bullet>通讯录、相册、麦克风、摄像头权限</Bullet>

        <H2>三、微信小程序额外说明</H2>
        <P>
          本小程序<Text style={{ fontWeight: 600 }}>不调用</Text>微信登录、获取用户信息、获取手机号等任何可能收集个人信息的微信 API。
          访问统计仅记录匿名页面路径和时间戳，无法关联到个人微信账号。
        </P>

        <H2>四、信息的使用与共享</H2>
        <P>小程序版本不提供表单、评论、笔记、图片上传、音频上传等用户内容功能，也不收集邮箱或手机号。我们不会：</P>
        <Bullet>把用户数据出售给任何第三方</Bullet>
        <Bullet>把访问统计用于商业广告定向</Bullet>
        <Bullet>把匿名访问统计用于跨站追踪</Bullet>

        <H2>五、数据存储与安全</H2>
        <P>
          匿名访问统计和错误日志使用 TLS 加密传输。我们采取合理技术措施防止未授权访问，但
          <Text style={{ fontWeight: 600 }}>互联网环境无法做到绝对安全</Text>
          。
        </P>

        <H2>六、你的权利</H2>
        <P>你随时可以：</P>
        <Bullet>查询我们是否保存了与你相关的数据：发送邮件至 jake.gu@foxmail.com</Bullet>
        <Bullet>要求删除可定位到你的联系记录（如你主动通过邮件联系我们）：同上邮箱联系</Bullet>
        <P>我们将在 30 天内响应你的请求。</P>

        <H2>七、未成年人</H2>
        <P>
          本站不主动向 14 岁以下未成年人提供服务。如果你是未成年人的监护人，发现其未经同意通过邮件留下了联系方式，可联系上述邮箱要求删除。
        </P>

        <H2>八、变更通知</H2>
        <P>
          如本政策有重大变更，我们会在站点显眼位置公示至少 7 天，并对已订阅邮箱用户发送通知邮件。版本号会同步更新。
        </P>

        <H2>九、联系我们</H2>
        <P>
          如对本政策有任何疑问，请通过邮件 jake.gu@foxmail.com 与我们联系。
        </P>
      </View>
    </View>
  );
}
