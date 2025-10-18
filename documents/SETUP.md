# セットアップガイド 🚀

## ✅ 完了したこと

1. ✅ プロジェクト初期化
2. ✅ 依存パッケージインストール
3. ✅ TypeScript コンパイル成功
4. ✅ ディレクトリ構造作成

## 📋 次のステップ

### 1. VRM/VRMA ファイルを準備

VRM モデルと VRMA アニメーションファイルを用意してください。

**VRM モデルの入手先**:

- [VRoid Hub](https://hub.vroid.com/) - 無料 VRM モデル多数
- [ニコニ立体](https://3d.nicovideo.jp/) - 日本の VRM コミュニティ
- [Booth](https://booth.pm/) - 有料・無料 VRM モデル

**VRMA アニメーションの入手先**:

- [mixamo](https://www.mixamo.com/) - BVH を VRMA に変換
- [GitHub - vrm-c/vrm-specification](https://github.com/vrm-c/vrm-specification) - サンプル

### 2. ファイル配置

#### オプション A: 環境変数で指定（推奨）

```bash
# 1. 好きな場所にディレクトリ作成
mkdir -p ~/Documents/MyVRMs/models
mkdir -p ~/Documents/MyVRMs/animations

# 2. ファイルを配置
cp /path/to/your-character.vrm ~/Documents/MyVRMs/models/
cp /path/to/your-animation.vrma ~/Documents/MyVRMs/animations/

# 3. Claude Desktop設定ファイルを編集
nano ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

`claude_desktop_config.json` に以下を追加:

```json
{
  "mcpServers": {
    "vrm-control": {
      "command": "node",
      "args": ["/Users/lvncer/GitRepos/vrm-mcp/dist/mcp-server.js"],
      "env": {
        "VRM_MODELS_DIR": "/Users/lvncer/Documents/MyVRMs/models",
        "VRMA_ANIMATIONS_DIR": "/Users/lvncer/Documents/MyVRMs/animations",
        "VIEWER_PORT": "3000"
      }
    }
  }
}
```

#### オプション B: プロジェクト内に配置（シンプル）

```bash
# VRMファイルを配置
cp /path/to/your-character.vrm /Users/lvncer/GitRepos/vrm-mcp/public/models/

# VRMAファイルを配置
cp /path/to/your-animation.vrma /Users/lvncer/GitRepos/vrm-mcp/public/animations/
```

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vrm-control": {
      "command": "node",
      "args": ["/Users/lvncer/GitRepos/vrm-mcp/dist/mcp-server.js"]
    }
  }
}
```

### 3. Claude Desktop 起動

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

## 🧪 テスト用のサンプルファイル

VRM モデルや VRMA ファイルがない場合、以下で無料のモデルを入手できます：

### VRoid Studio（無料）

```bash
# VRoid Studioで自分のキャラクターを作成
# https://vroid.com/studio
# エクスポート → VRM 0.0形式で保存
```

### サンプル VRM

```bash
# VRM Consortiumの公式サンプル
curl -o public/models/sample.vrm \
  https://github.com/vrm-c/vrm-specification/raw/master/samples/AliciaSolid/AliciaSolid.vrm
```

## 🎯 動作確認

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

## 🐛 トラブルシューティング

### エラー: Cannot find module '@modelcontextprotocol/sdk'

```bash
cd /Users/lvncer/GitRepos/vrm-mcp
npm install
npm run build
```

### エラー: Port 3000 is already in use

```bash
# ポートを使っているプロセスを確認
lsof -i :3000

# プロセスを終了
kill -9 <PID>

# または、別のポートを使用
# claude_desktop_config.json の env に追加:
# "VIEWER_PORT": "3001"
```

### Claude Desktop からツールが見えない

1. `claude_desktop_config.json` のパスが正しいか確認
2. JSON の構文エラーがないか確認（カンマの位置など）
3. Claude Desktop を完全に終了して再起動

```bash
# Claude Desktopを強制終了
pkill -9 Claude

# 再起動
open -a Claude
```

### VRM モデルが表示されない

1. ブラウザのコンソールを開く（F12 または Cmd+Option+I）
2. エラーメッセージを確認
3. VRM ファイルのパスが正しいか確認
4. ファイルが破損していないか確認

## 📚 次のステップ

1. **基本操作を試す**: 表情変更、ポーズ変更
2. **VRMA アニメーションを試す**: アニメーション再生、ループ
3. **カスタマイズ**: `viewer.html` の背景色やカメラ位置を変更
4. **拡張機能を追加**: 新しいツールを `mcp-server.ts` に追加

## 🎉 完成

セットアップが完了したら、AI に話しかけるだけで VRM が動きます！

**例**:

- 「キャラクターを左に動かして」
- 「悲しい顔にして」
- 「手を振るアニメーションを再生して」
- 「ダンスを永遠にループして」

楽しんでください！🎭✨
