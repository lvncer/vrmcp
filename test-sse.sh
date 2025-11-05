#!/bin/bash

# SSE接続のスモークテスト

echo "🧪 VRM MCP SSE接続テスト"
echo "========================"
echo ""

# ローカルサーバーの起動チェック
echo "📡 ローカルサーバーが起動しているか確認..."
if ! lsof -i :3000 > /dev/null 2>&1; then
  echo "❌ ポート3000でサーバーが起動していません"
  echo "以下のコマンドでサーバーを起動してください:"
  echo "  npm run dev"
  exit 1
fi
echo "✅ サーバーは起動しています"
echo ""

# SSEエンドポイントのテスト（MCP）
echo "📨 MCP SSEエンドポイントをテスト中..."
timeout 5 curl -s -N -H "Accept: text/event-stream" \
  http://localhost:3000/mcp/sse 2>/dev/null | head -5 | grep -q "event: endpoint"

if [ $? -eq 0 ]; then
  echo "✅ MCP SSE接続成功"
else
  echo "⚠️  MCP SSE接続に問題がある可能性があります"
fi
echo ""

# ビューアSSEエンドポイントのテスト
echo "📺 Viewer SSEエンドポイントをテスト中..."
timeout 5 curl -s -N -H "Accept: text/event-stream" \
  http://localhost:3000/viewer/sse 2>/dev/null | head -5 | grep -q "event: init"

if [ $? -eq 0 ]; then
  echo "✅ Viewer SSE接続成功"
else
  echo "⚠️  Viewer SSE接続に問題がある可能性があります"
fi
echo ""

# APIキー認証テスト（APIキーが設定されている場合）
if [ -n "$MCP_API_KEY" ]; then
  echo "🔐 APIキー認証をテスト中..."
  
  # 認証なしでアクセス（401エラーを期待）
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/mcp/sse)
  if [ "$STATUS" = "401" ]; then
    echo "✅ 認証なしアクセスは正しく拒否されました"
  else
    echo "⚠️  認証なしアクセスのステータスコード: $STATUS"
  fi
  
  # 正しいAPIキーでアクセス
  timeout 5 curl -s -N -H "x-api-key: $MCP_API_KEY" -H "Accept: text/event-stream" \
    http://localhost:3000/mcp/sse 2>/dev/null | head -5 | grep -q "event: endpoint"
  
  if [ $? -eq 0 ]; then
    echo "✅ APIキー認証付きアクセス成功"
  else
    echo "⚠️  APIキー認証に問題がある可能性があります"
  fi
else
  echo "ℹ️  MCP_API_KEYが設定されていないため、認証テストをスキップします"
fi
echo ""

echo "========================"
echo "テスト完了！"
echo ""
echo "次のステップ:"
echo "1. ブラウザで http://localhost:3000 を開く"
echo "2. 開発者ツールのNetworkタブでSSE接続を確認"
echo "3. Claude DesktopまたはゲートウェイからMCPツールを実行"

