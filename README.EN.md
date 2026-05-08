# LepViewer

[简体中文](./README.md) | [English](./README.EN.md)

Lepton is a lossless JPG compression tool developed by Dropbox, which can reduce file sizes by approximately 20% without any loss in image quality. This project is built upon Microsoft's open-source [lepton_jpeg_rust](https://github.com/microsoft/lepton_jpeg_rust) (a Rust port of Dropbox Lepton) to implement image compression and decompression.

![Language](https://img.shields.io/badge/language-Rust-orange.svg)

This project is built with Rust and Tauri.

## Screenshots

![Screenshot 1](./images/页面.png)

![Screenshot 2](./images/压缩效果.png)

### Performance Benchmark

Tested with 480 JPG photos totaling 1.36 GB. The processing time comparison between the Compatible version (x64) and the AVX instruction set version is as follows:

| Operation | x64   | AVX  |
| --------- | ------- | ----- |
| Compression | 41.38  | 39.28 |
| Decompression | 1:01.64 | 58.49 |

> Note: The timing was recorded manually and may contain slight errors. The vast majority of the compression time is actually spent on reading files from the disk.

## Build from Source

**Requirements:** [Rust 1.89 or higher](https://www.rust-lang.org/tools/install)

Install dependencies:

```bash
npm install
```

Run in development mode:

```bash
npm run dev
```

Build (Compatible version / x64):

```bash
npm run build
```

Build (AVX instruction set version):

```bash
npm run build:avx
```

## Acknowledgments

This project utilizes Dropbox Lepton. Special thanks to the **Microsoft Team** for open-sourcing [lepton_jpeg_rust](https://github.com/microsoft/lepton_jpeg_rust), a Rust port and refactoring of the Lepton tool.

## Appreciate

![PayQrcode](./images/PayQrcode.jpg)