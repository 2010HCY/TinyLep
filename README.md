# LepViewer

[简体中文](./README.md) | [English](./README.EN.md)

Lepton 是由 Dropbox 开发的 JPG 无损压缩工具，可在不损失画质的前提下将文件体积缩减约 20%。本项目基于微软开源的 [lepton_jpeg_rust](https://www.google.com/url?sa=E&q=https%3A%2F%2Fgithub.com%2Fmicrosoft%2Flepton_jpeg_rust)（Dropbox Lepton 的 Rust 移植版）来实现图片的压缩与解压。

![Language](https://img.shields.io/badge/language-Rust-orange.svg)

本项目由 Rust 与 Tauri 构建

## 页面效果

![页面](./images/页面.png)

![压缩效果](./images/压缩效果.png)

### 性能测试对比

使用 480 张总计 1.36 GB 的 JPG 照片进行测试，兼容版 (x64) 与 AVX 指令集版的耗时对比如下：

| 操作 | x64     | AVX   |
| ---- | ------- | ----- |
| 压缩 | 41.38   | 39.28 |
| 解压 | 1:01.64 | 58.49 |

> 注：计时为手动操作有误差，时间消耗主要在硬盘 I/O 读取上。


## 从源头构建

[Rust 1.89 或更高版本](https://www.rust-lang.org/tools/install)

安装依赖：

```
npm install
```

开发模式运行：

```
npm run dev
```

打包构建（兼容版本）：

```
npm run build
```

打包构建（AVX指令集）：

```
npm run build:avx
```

## 致谢

本项目使用了Dropbox Lepton。特别感谢 **Microsoft 团队** 开源了对 Lepton 工具的 Rust 移植与重构 [lepton_jpeg_rust](https://github.com/microsoft/lepton_jpeg_rust)

## 赞赏

![PayQrcode](./images/PayQrcode.jpg)
