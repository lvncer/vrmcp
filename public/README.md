# Public Assets

このディレクトリには、VRMモデルとアニメーションファイルを配置します。

## ディレクトリ構成

```
public/
├── models/       # VRMモデルファイル (.vrm)
└── animations/   # VRMAアニメーションファイル (.vrma)
```

## セットアップ

ルートの `public/models/` と `public/animations/` をこのディレクトリにコピーしてください：

```bash
# vrmcp/ ディレクトリから実行
cp -r ../public/models ./public/
cp -r ../public/animations ./public/
```

## 使用方法

- `/models/*` でVRMモデルにアクセス
- `/animations/*` でVRMAアニメーションにアクセス

Next.jsが自動的に静的ファイルとして配信します。
