# mini4wd-layout-editor

2D操作を中心に、内部ではmm単位のXYZ座標と高さを扱うミニ四駆コースレイアウトエディターです。

現在はPhase 1として、React＋TypeScript＋Viteの最小基盤と、UIから独立した2.5D計算ロジックを実装しています。完成UI、精密3D干渉判定、PWA、在庫・会場管理はまだ含みません。

## セットアップ

Vite 7の要件に合わせ、Node.js 20.19以上、または22.12以上のLTS系を使用してください。

```sh
npm install
npm run dev
```

## 検証

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Pull Requestとmainへのpushでは、GitHub ActionsがNode.js 22とnpmキャッシュを使用し、上記4つの検証を自動実行します。

## 開発フロー

このリポジトリは、GitHub Issueを正式な作業指示、CodexのDraft Pull Requestを実装結果として扱うレベル2半自動運用を採用します。

- Codexの最優先ルール：`AGENTS.md`
- ChatGPT・Codex・人の役割と手順：`docs/codex-workflow.md`
- Codex実装タスクの作成：`.github/ISSUE_TEMPLATE/codex-task.md`
- Pull Request報告形式：`.github/pull_request_template.md`

`main`への直接pushと自動マージは禁止し、GitHub Actions成功、仕様照合、がくさんの最終承認後に人がマージします。

## Phase 1のドメインモデル

- 内部座標はmm単位のXYZ型
- 回転は45度刻み
- 寸法は `verified` / `provisional` / `unknown` と根拠を保持
- ストレート長540mm、スロープ高低差115mmは確定値
- 未確認の幅・高さ・スロープ水平長・精密3D形状は `unknown`
- スロープ衝突形状は将来プロファイルへ差し替え可能で、仮の直方体は定義しない