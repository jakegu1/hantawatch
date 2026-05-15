import './index.scss';
import { View, Text } from '@tarojs/components';
import { useLoad } from '@tarojs/taro';
import { trackPageView } from '@/utils/api';

const VERSION = '1.0';
const EFFECTIVE_DATE = '2026-05-13';

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
        <H3>2.1 你主动提交的信息</H3>
        <Bullet>
          <Text style={{ fontWeight: 600 }}>邮箱地址</Text>
          ：仅当你主动填写"订阅预警通知"表单时收集，用于发送 HPI 阈值变化、聚集地距离圈层变化、官方发布新通报等触发式预警邮件。你可以随时通过任意一封通知邮件底部的链接退订。
        </Bullet>
        <Bullet>
          <Text style={{ fontWeight: 600 }}>反馈内容</Text>
          ：当你通过反馈页面提交反馈时，我们会保存你填写的文本内容。提交是匿名的，除非你在文本中主动留下联系方式。
        </Bullet>

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

        <H2>三、微信生态额外说明</H2>
        <P>
          小程序运行时，微信平台可能向我们提供一个匿名的小程序 OpenID
          （仅在你授权"获取用户信息"时），用于区分独立访客。我们
          <Text style={{ fontWeight: 600 }}>不会</Text>
          通过 OpenID 反查你的微信昵称、头像、好友列表或聊天记录。
        </P>

        <H2>四、信息的使用与共享</H2>
        <P>收集到的邮箱仅用于发送预警通知。我们不会：</P>
        <Bullet>把邮箱出售给任何第三方</Bullet>
        <Bullet>把邮箱用于发送商业广告</Bullet>
        <Bullet>把邮箱用于发送非汉坦病毒相关内容</Bullet>
        <P>反馈内容仅本站维护者可见，用于产品改进，不会公开。</P>

        <H2>五、数据存储与安全</H2>
        <P>
          邮箱与反馈数据存储在云数据库中，使用 TLS 加密传输。我们采取合理技术措施防止未授权访问，但
          <Text style={{ fontWeight: 600 }}>互联网环境无法做到绝对安全</Text>
          。如果你强烈在意隐私，请使用临时邮箱订阅。
        </P>

        <H2>六、你的权利</H2>
        <P>你随时可以：</P>
        <Bullet>退订邮件预警（通过任意一封通知邮件底部的退订链接）</Bullet>
        <Bullet>要求删除你的邮箱与反馈记录：发送邮件至 jake.gu@foxmail.com</Bullet>
        <Bullet>查询我们存储的与你相关的数据：同上邮箱联系</Bullet>
        <P>我们将在 30 天内响应你的请求。</P>

        <H2>七、未成年人</H2>
        <P>
          本站不主动向 14 岁以下未成年人提供服务。如果你是未成年人的监护人，发现其未经同意在本站留下了邮箱或反馈，可联系上述邮箱要求删除。
        </P>

        <H2>八、变更通知</H2>
        <P>
          如本政策有重大变更，我们会在站点显眼位置公示至少 7 天，并对已订阅邮箱用户发送通知邮件。版本号会同步更新。
        </P>

        <H2>九、联系我们</H2>
        <P>
          如对本政策有任何疑问，请通过反馈页或邮件 jake.gu@foxmail.com 与我们联系。
        </P>
      </View>
    </View>
  );
}
