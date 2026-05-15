import { PropsWithChildren } from 'react';
import { useLaunch } from '@tarojs/taro';
import './app.scss';

function App({ children }: PropsWithChildren<object>) {
  useLaunch(() => {
    console.log('[病毒观察 BingDuGuanCha] 小程序启动');
  });

  return children;
}

export default App;
