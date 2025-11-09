# Tool Usecases

## VRM モデルの読み込み

```text
あなた: どんなVRMモデルがある？
Claude: character.vrm、character2.vrm、avatar.vrm があります

あなた: character.vrm を読み込んで
Claude: ✓ VRMモデルを読み込みました
```

## 表情制御

```text
あなた: 嬉しい表情にして
Claude: ✓ 表情 "happy" を強さ 1.0 で設定しました
```

## VRMA アニメーション

```text
あなた: どんなアニメーションがある？
Claude: greeting.vrma、wave.vrma、dance.vrma、bow.vrma があります

あなた: 笑顔で挨拶して
Claude:
  ✓ VRMAアニメーション "greeting" を読み込みました
  ✓ 表情 "happy" を強さ 1.0 で設定しました
  ▶ VRMAアニメーション "greeting" を再生しました

あなた: ダンスを繰り返して
Claude: ▶ VRMAアニメーション "dance" を再生しました（ループ）

あなた: 止めて
Claude: ⏹ VRMAアニメーションを停止しました
```

## ボーン操作

```text
あなた: 右手を上げて
Claude: ✓ ボーン "rightUpperArm" をアニメーションしました
```
