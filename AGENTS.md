<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# プロジェクト固有ルール（rodo）

## 業務仕様の真偽判定

業務仕様の判断は、**ユーザーが「合ってる」と明示確認した記述だけを「正」**とする。

- 引き継ぎノートには必ず「§C: ユーザー確認済み仕様」相当のセクションを設ける
- 確認日付・確認者名を明記する
- 旧ノートに誤った仕様が残っている場合、**削除せず⚠️警告ヘッダーを付けて残す**（再発見時に気づける）
- 推論・コミットメッセージ・コメントは「未確認」扱いとする

過去事例（2026-04-30）: 「ODOは車両単位で連続」と誤解し、振替先 -T の departureOdo / arrivalOdo を車Bの値で初期化する設計案を採用 → 業務仕様と乖離 → revert / 再修正で大きく手戻り。

## 修正前チェックリスト

「fetch を変更する」「auth を変更する」「Service Worker を変更する」「offline 関連を変更する」など、システム横断の変更時は計画書に以下を明記してから実装着手：

- [ ] 該当機能のリクエストフロー全体を追ったか（Client → SW → proxy → API → DB）
- [ ] proxy.ts / middleware の認証ゲートへの影響を確認したか
- [ ] Service Worker (public/sw.js) のキャッシュ・フォールバック挙動を確認したか
- [ ] 同パターンの呼び出し箇所を grep で全件洗い出したか
- [ ] DB スキーマ（Prisma）の整合性を確認したか

過去事例（2026-04）: オフライン修正で SW の存在を見落とし、useOnlineStatus だけ修正して offline-fetch.ts を修正し忘れ → 実機で動かず再修正。

## 修正完了報告のサイレント故障チェック

修正CC が完了報告するとき、以下を必ず明記する：

```
## サイレント故障チェック
- res.ok チェック有無: [ ] 全 fetch 呼び出しで確認 [ ] 未確認箇所あり
- catch 句のユーザー通知: [ ] alert/toast あり [ ] console.error のみ（要対処）
- 楽観的レスポンス検出: [ ] 識別ヘッダで分岐 [ ] 識別なし（要対処）
```

未対処項目があれば必ず別タスクとして起票する。

過去事例（2026-05-01）: handleProceed (RecordClient.tsx L378-399) は res.ok チェックがないため、PATCH 失敗時に router.push が走り遷移先で record にリダイレクトされる「サイレント故障」を起こしていた。
