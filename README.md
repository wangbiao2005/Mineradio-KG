# Mineradio (KG 适配版)

![Mineradio 暗场启动页](./docs/assets/readme/cinema-beat-smoke.png)

> 本项目基于 [XxHuberrr/Mineradio](https://github.com/XxHuberrr/Mineradio) 开源代码改编，将音源统一切换为酷狗（KG），基于落雪音乐（LX Music）框架，**免费听歌**，免登录全功能。

Mineradio 是一款 **免费听歌** 的 Windows 桌面沉浸式音乐播放器，把天气电台、搜索播放、歌词舞台、粒子视觉和 3D 歌单架组合成一个更接近现场感的私人音乐空间。

## 与原项目的区别

- 音源全面切换为酷狗（KG），移除 QQ 音乐、网易云音乐平台接入
- 免登录使用全功能：搜索、播放、歌词、封面
- 首页 6 卡片推荐使用 KG 热搜词差异化生成
- 音质选项清理（移除「超清母带 SVIP」）

## 下载

[**👉 点击下载最新版 Mineradio-1.1.1-Setup.exe**](https://github.com/wangbiao2005/Mineradio-KG/releases/download/v1.1.1/Mineradio-1.1.1-Setup.exe)

所有版本详见 [Releases 页面](https://github.com/wangbiao2005/Mineradio-KG/releases)。

## 使用说明

Windows 用户在 Releases 中下载安装包即可。安装包会创建桌面快捷方式。

## 开发运行

```bash
npm install
npm start
npm run build:win
```

## 音源说明

本改编版基于**落雪音乐（LX Music）**音源框架，接入酷狗（KG）音乐作为搜索和播放音源，**完全免费听歌**，无需登录即可使用全功能。非酷狗官方客户端，请遵守对应平台用户协议。

## 用户数据与隐私

搜索历史、自定义封面、自定义歌词等数据保存在本机，不会上传。

## 原始项目

- 原作者：[XxHuberrr](https://github.com/XxHuberrr)
- 原始仓库：[Mineradio](https://github.com/XxHuberrr/Mineradio)
- 原始项目采用 GPL-3.0 授权

## 致谢

感谢原作者 XxHuberrr 设计和打造 Mineradio。感谢 emily 作为早期视觉底层想法的共创者，以及小天才e宝、应春日、锋将军、軌跡、林中、骊、风痕、花椰菜🥦在早期体验、测试反馈中的帮助。

## 版权与授权

本项目基于 [XxHuberrr/Mineradio](https://github.com/XxHuberrr/Mineradio) 改编，沿用 GPL-3.0 授权。详见 [LICENSE](./LICENSE)。
