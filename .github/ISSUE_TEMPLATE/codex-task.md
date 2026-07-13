---
name: Codex実装タスク
description: Codexへ安全に実装を依頼するための標準Issue
title: "Phase X.X: "
assignees: ""
---

## 目的

<!-- このIssueで達成する目的を1つに絞って記載する -->

## 根拠となる仕様

- `AGENTS.md`
- `docs/roadmap.md`
- <!-- 関連仕様書、decision log、既存Issue -->

## 確定済み条件

- 内部単位：mm
- 内部座標：X・Y・Z
- ストレート1枚：540mm（verified）
- スロープ高低差：115mm（verified）
- <!-- このタスク固有のverified条件 -->

## 実装範囲

- [ ] 
- [ ] 
- [ ] 

## 対象外

- 
- 

## 変更禁止

- 未確認寸法を推測で確定しない。
- NOIRまたは参考サイトのコード、画像、3Dモデル、素材をコピーしない。
- Issue対象外の機能やUIを変更しない。
- `main`へ直接pushしない。
- 自動マージしない。
- テストを削除、無効化、緩和して成功扱いにしない。

## 完成条件

- [ ] Issue記載の機能が実装されている。
- [ ] 未確認情報は`unknown`または`indeterminate`として安全側に扱われる。
- [ ] 対応する自動テストが追加されている。
- [ ] 型チェックが成功する。
- [ ] Lintが成功する。
- [ ] 単体テストが成功する。
- [ ] ビルドが成功する。
- [ ] 必要な仕様書またはdecision logが更新されている。
- [ ] Draft Pull Requestに未解決事項が明記されている。

## 必須テスト

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

追加ケース：

- 
- 

## 使用可能な値

| 値 | 数値・状態 | 根拠 | 利用条件 |
|---|---|---|---|
| ストレート長 | 540mm / verified | 正式基準 | 使用可 |
| スロープ高低差 | 115mm / verified | 正式基準 | 使用可 |
|  | unknown |  | 推測禁止 |

## がくさんの判断が必要な事項

<!-- なければ「なし」。Codexはここを勝手に決めない -->

- 

## Codexへの提出条件

- [ ] 実装範囲が承認済み。
- [ ] 対象外と変更禁止が確認済み。
- [ ] 未確認寸法に依存しない。
- [ ] 完成条件がテスト可能。

## Codex実行時の指示

`AGENTS.md`と`docs/codex-workflow.md`を最優先で読み、このIssueの範囲だけを実装する。Issue番号を含む作業ブランチを作成し、4種類の品質チェックを実行したうえでDraft Pull Requestを提出する。不明点は推測せず、未解決事項として報告する。