# 実装メモ / Implementation Prompts

## Phase 11: 管理者ダッシュボード構築時の対応

### 問題
ProcessingBar の API（`GET /api/dispatches?status=draft`）がテナント全体の下書きを返すため、
管理者でログインすると他の隊員の下書きが表示されてしまう。
下書きは個人の業務情報であり、隊員ごとに分離する必要がある。

### 修正箇所
`app/api/dispatches/route.ts` の GET ハンドラ

```ts
// 現状（テナント全体の下書きを返す）
if (status === 'draft') {
  where.isDraft = true
}

// 修正後（一般隊員は自分の下書きのみ、管理者は全件）
if (status === 'draft') {
  where.isDraft = true
  if (!isAdmin) {
    where.userId = session.user.userId
  }
}
```

### 補足
- `isAdmin` の判定は管理者ダッシュボード実装時に session または User モデルのロールフィールドで行う
- 管理者ダッシュボードが完成するまでは現状のまま運用（管理者アカウントでの使用は設定ページのみのため影響は限定的）
