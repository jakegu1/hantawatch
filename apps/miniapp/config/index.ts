import { defineConfig } from '@tarojs/cli';
import path from 'path';

export default defineConfig({
  projectName: 'hantawatch-miniapp',
  date: '2026-05-15',
  designWidth: 375,
  deviceRatio: {
    375: 1,
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: ['@tarojs/plugin-platform-weapp'],
  defineConstants: {},
  copy: {
    patterns: [],
    options: {},
  },
  framework: 'react',
  compiler: {
    type: 'webpack5',
    prebundle: {
      enable: false,
    },
  },
  cache: {
    enable: false,
  },
  mini: {
    webpackChain(chain) {
      const sharedPath = path.resolve(__dirname, '../../../packages/shared');
      // Make babel process the shared package
      chain.module
        .rule('script')
        .include
          .add(sharedPath)
          .end();
      // Alias for clean imports
      chain.resolve.alias.set(
        '@hantawatch/shared',
        path.resolve(__dirname, '../../../packages/shared/src')
      );
      // Reuse web app's data snapshots so miniapp & web stay in sync
      // (collector writes ONE place: apps/web/src/data/).
      chain.resolve.alias.set(
        '@web-data',
        path.resolve(__dirname, '../../web/src/data')
      );
      // Standard "@/..." alias matches tsconfig paths so editor + bundler agree.
      chain.resolve.alias.set('@', path.resolve(__dirname, '../src'));
    },
    postcss: {
      pxtransform: {
        enable: true,
        config: {},
      },
      url: {
        enable: true,
        config: {
          limit: 1024,
        },
      },
      cssModules: {
        enable: false,
        config: {
          namingPattern: 'module',
          generateScopedName: '[name]__[local]___[hash:base64:5]',
        },
      },
    },
  },
});
