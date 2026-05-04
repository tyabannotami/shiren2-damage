# シレン2ダメージ計算機 テスト設計書

## 目的

この文書は、ブラウザ実行用テストが何を確認しているかを整理するためのものです。

現在のテストでは、VBA版で使っていた `DamageDist_Build` 相当の分布生成ロジックと、Web版の分布・確率・撃破率計算が一致することを重視します。

## 対象ファイル

- `tests/calc.logic.test.html`
  - ブラウザでテストを実行するためのHTMLです。
  - `calc.js` の `bindUI()` が参照する最小限のDOMを用意し、`calc.js` と `tests/calc.logic.test.js` を読み込みます。

- `tests/calc.logic.test.js`
  - ブラウザ上で `window` に公開された計算関数を呼び出す簡易テストランナーです。
  - `PASS` / `FAIL` と詳細値を `<pre id="log">` に出力します。
  - テスト結果は `window.TEST_RESULTS` にも格納されます。

## 正しい分布生成仕様

ダメージ分布は64通り固定ではありません。
旧仕様または仮式として使っていた `224〜287/256` の64通り分布は、VBA版との比較における正確式ではありません。

現在の正しい分布生成は、VBA版 `DamageDist_Build` と同じ考え方です。

```text
avgQ16 = ApplyDefense_Q16(base, def)
widthQ16 = avgQ16 >> 3

for m = 0..widthQ16:
  dmgQ16 = avgQ16 - m
  dmg = dmgQ16 \ 65536
  if dmg == 0:
    dmg = 1
  count[dmg] += 1

  dmgQ16 = avgQ16 + m
  dmg = dmgQ16 \ 65536
  if dmg == 0:
    dmg = 1
  count[dmg] += 1

totalOutcomes = 2 * (widthQ16 + 1)
prob = count / totalOutcomes
```

Web版では、処理速度のために `m` を1件ずつ総当たりせず、同じ結果になる整数区間集計で実装してもよいものとします。
ただし、`count`、`totalOutcomes`、`prob`、`tailProbGte`、`tailProbGt` は、VBA版で1件ずつ加算した場合と一致する必要があります。

## 共通入力

基準ケースは次を使用します。

- 攻撃力: `50`
- 防御力: `20`
- `baseDamageQ16 = window.calculateBaseDamage(50, 20)`
- `dist = window.calculateDamageDistribution(50, 20)`
- `range = window.calculateDamageRange(50, 20)`

基準ケースのVBA版期待値:

- `baseDamageQ16 = 1837308`
- `widthQ16 = 229663`
- `totalOutcomes = 459328`
- 分布:

| damage | count |
|---:|---:|
| 24 | 30755 |
| 25 | 65536 |
| 26 | 65536 |
| 27 | 65536 |
| 28 | 65537 |
| 29 | 65536 |
| 30 | 65536 |
| 31 | 35356 |

## 代表ケース

VBA版との比較用に、次の代表ケースをテストします。

### base=22, def=8

- `avgQ16 = 1150864`
- `widthQ16 = 143858`
- `totalOutcomes = 287718`

| damage | count |
|---:|---:|
| 15 | 41570 |
| 16 | 65536 |
| 17 | 65537 |
| 18 | 65536 |
| 19 | 49539 |

### base=23, def=8

- `avgQ16 = 1203176`
- `widthQ16 = 150397`
- `totalOutcomes = 300796`

| damage | count |
|---:|---:|
| 16 | 61333 |
| 17 | 65536 |
| 18 | 65537 |
| 19 | 65536 |
| 20 | 42854 |

### base=200, def=53

- `avgQ16 = 2926660`
- `widthQ16 = 365832`
- `totalOutcomes = 731666`

| damage | count |
|---:|---:|
| 39 | 60612 |
| 40 | 65536 |
| 41 | 65536 |
| 42 | 65536 |
| 43 | 65536 |
| 44 | 65537 |
| 45 | 65536 |
| 46 | 65536 |
| 47 | 65536 |
| 48 | 65536 |
| 49 | 65536 |
| 50 | 15693 |

## テスト一覧

### 1. damage distribution is generated

- 対象: `calculateDamageDistribution`
- 確認内容:
  - 分布オブジェクトが存在する
  - `rows` が空ではない
  - `totalOutcomes` が正の整数である

### 2. row counts sum to totalOutcomes

- 対象: `rows` と `totalOutcomes`
- 確認内容:
  - 全行の `count` 合計が `totalOutcomes` と一致する
  - `prob = count / totalOutcomes` の母数が整合している

### 3. totalOutcomes follows VBA widthQ16 formula

- 対象: `avgQ16`、`widthQ16`、`totalOutcomes`
- 確認内容:
  - `widthQ16 = avgQ16 >> 3`
  - `totalOutcomes = 2 * (widthQ16 + 1)`
  - `totalOutcomes` が64固定ではない

### 4. baseline distribution matches VBA DamageDist_Build

- 対象: `calculateDamageDistribution(50, 20)`
- 確認内容:
  - 基準ケースの `count` がVBA版期待値と一致する
  - `calculateBaseDamage(50, 20)` が `1837308` と一致する

### 5. representative cases match VBA distribution counts

- 対象:
  - `calculateDamageDistribution(22, 8)`
  - `calculateDamageDistribution(23, 8)`
  - `calculateDamageDistribution(200, 53)`
- 確認内容:
  - `avgQ16`
  - `widthQ16`
  - `totalOutcomes`
  - damageごとの `count`

### 6. calculateDamageRange matches distribution min/max

- 対象: `calculateDamageRange`
- 確認内容:
  - `range.minDamage` が分布先頭のdamageと一致する
  - `range.maxDamage` が分布末尾のdamageと一致する

### 7. boundary values do not produce invalid damage

- 対象:
  - `calculateDamageDistribution(50, 0)`
  - `calculateDamageDistribution(0, 20)`
- 確認内容:
  - `NaN`、`Infinity`、0ダメージが出ない
  - 攻撃力0の場合は、VBA版と同じく `widthQ16 = 0`、`totalOutcomes = 2`、1ダメージ2通りに集約される

### 8. kill probability uses VBA distribution

- 対象: `calculateKillProbability`
- 確認内容:
  - 撃破率が `rows.prob` を元に計算される
  - 基準ケースでHP30を1発撃破する確率が、30ダメージと31ダメージの確率合計になる

### 9. tail probabilities match VBA semantics

- 対象: `tailProbGte`、`tailProbGt`
- 確認内容:
  - `tailProbGte` は `P(damage >= row.damage)`
  - `tailProbGt` は `P(damage > row.damage)`
  - 基準ケースの30ダメージ行で、`tailProbGte = (65536 + 35356) / 459328`
  - 基準ケースの30ダメージ行で、`tailProbGt = 35356 / 459328`

### 10. required functions are exposed

- 対象: `window` に公開されたAPI
- 確認内容:
  - `window.calculateBaseDamage`
  - `window.calculateDamageDistribution`
  - `window.calculateDamageRange`
  - `window.calculateKillProbability`

## 旧仕様の扱い

`224〜287/256` を64通り列挙する分布は、旧仕様または仮式として扱います。
VBA版との一致確認では使用しません。

今後のテストでは、`totalOutcomes === 64` を期待してはいけません。
分布の総通り数は常に `2 * (widthQ16 + 1)` です。
