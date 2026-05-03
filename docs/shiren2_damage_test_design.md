# シレン2ダメージ計算機 テスト設計書

## 目的

この文書は、現存するブラウザ実行用テストが何を確認しているかを整理し、今後の正確式差し替え時に判断材料として使えるようにするためのものです。

現時点のテストは、シレン2の正確式そのものを保証するものではなく、現在実装されている計算APIの基本的な整合性と異常値の有無を確認するためのスモークテストです。今後、正確式へ差し替える前の判断材料として利用します。

## 対象ファイル

- `tests/calc.logic.test.html`
  - ブラウザでテストを実行するためのHTMLです。
  - `calc.js` の `bindUI()` が参照する最小限のDOMをダミーとして用意し、`calc.js` と `tests/calc.logic.test.js` を読み込みます。
  - `<html lang="ja">` と `<meta charset="UTF-8">` が指定されています。

- `tests/calc.logic.test.js`
  - ブラウザ上で `window` に公開された計算関数を呼び出す簡易テストランナーです。
  - `PASS` / `FAIL` と詳細値を `<pre id="log">` に出力します。
  - テスト結果は `window.TEST_RESULTS` にも格納されます。

## 共通入力

多くのテストは、次の基準ケースを使用しています。

- 攻撃力: `50`
- 防御力: `20`
- `baseDamageQ16 = window.calculateBaseDamage(50, 20)`
- `dist = window.calculateDamageDistribution(50, 20)`
- `range = window.calculateDamageRange(50, 20)`

## テスト一覧

### 1. damage distribution is generated

- テスト名: `1. damage distribution is generated`
- 対象関数または対象処理: `calculateDamageDistribution`
- 入力値:
  - 攻撃力: `50`
  - 防御力: `20`
- 期待結果:
  - `dist` が存在する
  - `dist.rows` が配列である
  - `dist.rows.length > 0`
  - `dist.totalOutcomes` が整数である
  - `dist.totalOutcomes > 0`
- 確認していること:
  - ダメージ分布オブジェクトが最低限利用可能な形で生成されること。
  - 分布行と総試行数に相当する値が空や不正値になっていないこと。
- 失敗した場合に疑うべき箇所:
  - `calculateDamageDistribution`
  - `calculateBaseDamage`
  - `buildDistributionFastFromBaseQ16`
  - `window.calculateDamageDistribution` の公開漏れ

### 2. row counts sum to totalOutcomes

- テスト名: `2. row counts sum to totalOutcomes`
- 対象関数または対象処理: `calculateDamageDistribution` が返す `rows` と `totalOutcomes`
- 入力値:
  - 攻撃力: `50`
  - 防御力: `20`
- 期待結果:
  - `dist.rows` の各 `count` を合計した値が `dist.totalOutcomes` と一致する
- 確認していること:
  - ダメージごとの通り数の合計と、分布全体の通り数が矛盾していないこと。
  - 確率 `prob = count / totalOutcomes` の母数として `totalOutcomes` が整合していること。
- 失敗した場合に疑うべき箇所:
  - `buildDistributionFastFromBaseQ16` 内の `totalOutcomes` 算出
  - `addCount`
  - `countMagInRange`
  - プラス側/マイナス側の範囲集計処理

### 3. calculateDamageRange matches distribution min/max

- テスト名: `3. calculateDamageRange matches distribution min/max`
- 対象関数または対象処理:
  - `calculateDamageRange`
  - `calculateDamageDistribution`
- 入力値:
  - 攻撃力: `50`
  - 防御力: `20`
- 期待結果:
  - `range.minDamage === dist.rows[0].damage`
  - `range.maxDamage === dist.rows[dist.rows.length - 1].damage`
- 確認していること:
  - ダメージ範囲APIが、分布の最小値と最大値を正しく返していること。
  - `rows` が昇順に並んでいる前提が崩れていないこと。
- 失敗した場合に疑うべき箇所:
  - `calculateDamageRange`
  - `calculateDamageDistribution`
  - `buildDistributionFastFromBaseQ16` の `rows.sort((a, b) => a.damage - b.damage)`

### 4. defense 0 keeps finite damage values

- テスト名: `4. defense 0 keeps finite damage values`
- 対象関数または対象処理:
  - `calculateBaseDamage`
  - `calculateDamageDistribution`
- 入力値:
  - 攻撃力: `50`
  - 防御力: `0`
- 期待結果:
  - `calculateBaseDamage(50, 0)` が有限数である
  - すべての分布行について `damage` が有限数である
  - すべての分布行について `damage >= 1`
  - すべての分布行について `prob` が有限数である
- 確認していること:
  - 防御力0の境界ケースで、`NaN`、`Infinity`、0ダメージなどの異常値が出ないこと。
- 失敗した場合に疑うべき箇所:
  - `applyDefenseQ16`
  - `calculateBaseDamage`
  - `buildDistributionFastFromBaseQ16`
  - 最小ダメージを1に補正する `addCount`

### 5. attack 0 keeps finite damage values

- テスト名: `5. attack 0 keeps finite damage values`
- 対象関数または対象処理:
  - `calculateBaseDamage`
  - `calculateDamageDistribution`
- 入力値:
  - 攻撃力: `0`
  - 防御力: `20`
- 期待結果:
  - `calculateBaseDamage(0, 20)` が有限数である
  - すべての分布行について `damage` が有限数である
  - すべての分布行について `damage >= 1`
  - すべての分布行について `prob` が有限数である
- 確認していること:
  - 攻撃力0の境界ケースで、`NaN`、`Infinity`、0ダメージなどの異常値が出ないこと。
  - 現実の仕様として攻撃力0がどう扱われるべきかは未確定です。このテストは、少なくとも現在の実装が壊れた数値を返さないことだけを確認しています。
- 失敗した場合に疑うべき箇所:
  - `applyDefenseQ16`
  - `calculateBaseDamage`
  - `buildDistributionFastFromBaseQ16`
  - 最小ダメージを1に補正する `addCount`

### 6. kill probability is between 0 and 1

- テスト名: `6. kill probability is between 0 and 1`
- 対象関数または対象処理: `calculateKillProbability`
- 入力値:
  - 分布: `calculateDamageDistribution(50, 20)` の結果
  - ケース1:
    - 目標HP: `30`
    - 攻撃回数: `1`
  - ケース2:
    - 目標HP: `120`
    - 攻撃回数: `3`
- 期待結果:
  - `p1` が有限数で、`0 <= p1 <= 1`
  - `p2` が有限数で、`0 <= p2 <= 1`
- 確認していること:
  - 撃破確率が確率として成立する範囲に収まっていること。
  - 複数回攻撃時の畳み込み計算で `NaN` や範囲外の値が出ないこと。
- 失敗した場合に疑うべき箇所:
  - `calculateKillProbability`
  - `damageDistribution.rows` の `prob`
  - `calculateDamageDistribution` の `count` / `totalOutcomes` の整合性

### 7. required functions are exposed

- テスト名: `API. required functions are exposed`
- 対象関数または対象処理: `window` への公開API
- 入力値:
  - なし
- 期待結果:
  - `window.calculateBaseDamage` が関数である
  - `window.calculateDamageDistribution` が関数である
  - `window.calculateDamageRange` が関数である
  - `window.calculateKillProbability` が関数である
- 確認していること:
  - テストや将来のUI拡張から呼び出すための公開関数が存在していること。
- 失敗した場合に疑うべき箇所:
  - `calc.js` 末尾の `window.*` 代入
  - `calc.js` の読み込み失敗
  - `tests/calc.logic.test.html` の `<script src="../calc.js"></script>`

## 削除したテスト観点

### totalOutcomes is 64 for the baseline

- 削除したテスト名: `2-extra. totalOutcomes is 64 for the baseline`
- 削除理由:
  - `64通り` は計算上の乱数観点であり、低ダメージでは複数の乱数結果が最小ダメージ1へ補正され、表示上または分布上は1ダメージに集約される場合があります。
  - そのため、基準ケースの `totalOutcomes` が常に `64` であることをテストするのは、現在のテスト目的には不要です。
  - 今後のテストでは、総通り数が固定値であることではなく、現在の分布表現の中で `count`、`totalOutcomes`、`prob` が矛盾していないことを確認します。
- 影響:
  - この観点を削除しても、分布の最低限の生成確認は `1. damage distribution is generated` で維持されます。
  - `count` 合計と `totalOutcomes` の整合性確認は `2. row counts sum to totalOutcomes` で維持されます。
  - ダメージ範囲、境界値、撃破確率、公開APIの確認には影響しません。

## 今後の判断ポイント

- 正確式を導入する前に、`totalOutcomes` が何を表す値なのかを明確にする必要があります。
- `totalOutcomes` を実機乱数の通り数として扱うのか、現在実装上の内部粒度として扱うのかは未確定です。
- 固定値 `64` を期待するテストは削除済みのため、今後は分布内部の整合性を優先して確認します。
- 低ダメージ時の最小ダメージ1補正により、乱数通り数と表示されるダメージ種別が一致しない場合がある点に注意します。

