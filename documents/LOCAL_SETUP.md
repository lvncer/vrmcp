# セットアップガイド

このガイドでは、ローカル環境でのセットアップ方法を説明します。

## 環境変数

### ローカル開発用

| 環境変数              | 説明                                      | デフォルト値          |
| --------------------- | ----------------------------------------- | --------------------- |
| `VRM_MODELS_DIR`      | VRM モデルファイルのディレクトリ          | `./public/models`     |
| `VRMA_ANIMATIONS_DIR` | VRMA アニメーションファイルのディレクトリ | `./public/animations` |
| `VIEWER_PORT`         | Web ビューアのポート番号                  | `3000`                |

## 1. VRM/VRMA ファイルを準備

VRM モデルと VRMA アニメーションファイルを用意してください。

## 2. ファイル配置

### オプション A: 環境変数で指定（推奨）

```bash
# 1. 好きな場所にディレクトリ作成
mkdir -p ~/vrm/models
mkdir -p ~/vrm/animations

# 2. ファイルを配置
cp /path/to/your-character.vrm ~/vrm/models/
cp /path/to/your-animation.vrma ~/vrm/animations/

# 3. Claude Desktop設定ファイルを編集
nano ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

`claude_desktop_config.json` に以下を追加:

```json
{
  "mcpServers": {
    "vrm-control": {
      "command": "node",
      "args": ["/path/to/your-project/vrm-mcp/dist/mcp-server.js"],
      "env": {
        "VRM_MODELS_DIR": "/User/your-name/vrm/models",
        "VRMA_ANIMATIONS_DIR": "/Users/your-name/vrm/animations",
        "VIEWER_PORT": "3000"
      }
    }
  }
}
```

### オプション B: プロジェクト内に配置（シンプル）

```bash
# VRMファイルを配置
cp /path/to/your-character.vrm /path/to/your-project/vrm-mcp/public/models/

# VRMAファイルを配置
cp /path/to/your-animation.vrma /path/to/your-project/vrm-mcp/public/animations/
```

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vrm-control": {
      "command": "node",
      "args": ["/path/to/your-project/vrm-mcp/dist/mcp-server.js"]
    }
  }
}
```

## 3. Claude Desktop 起動

1. **Claude Desktop を再起動**（設定を反映）
2. **ブラウザでアクセス**: [http://localhost:3000](http://localhost:3000)
3. **Claude Desktop で試す**:

```text
あなた: どんなVRMモデルがある？

Claude: 📦 VRMモデル (1件):
  - character.vrm
🎬 VRMAアニメーション (1件):
  - greeting.vrma

あなた: character.vrm を読み込んで

Claude: ✓ VRMモデルを読み込みました: character.vrm

あなた: 嬉しい表情にして

Claude: ✓ 表情 "happy" を強さ 1.0 で設定しました
```

## 動作確認

### MCP サーバーが起動しているか確認

Claude Desktop を起動した後:

```bash
# ポート3000が開いているか確認
lsof -i :3000
```

以下のような出力が表示されれば OK:

```text
COMMAND   PID   USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
node    12345  user   21u  IPv6  0x...      0t0  TCP *:3000 (LISTEN)
```

### Web ビューアにアクセス

1. ブラウザで [http://localhost:3000](http://localhost:3000) を開く
2. 「VRM Viewer (VRMA 対応)」と表示される
3. Status: Connected（緑色の点）になっていれば OK

## 完成

セットアップが完了したら、AI に話しかけるだけで VRM が動きます！

**例**:

- 「キャラクターを左に動かして」
- 「悲しい顔にして」
- 「手を振るアニメーションを再生して」
- 「ダンスを永遠にループして」
