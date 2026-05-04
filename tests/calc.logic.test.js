(() => {
  /**
   * Minimal browser test runner.
   * Keep messages ASCII-friendly to avoid encoding issues in local browsers.
   */
  const results = [];

  function logLine(text) {
    const log = document.getElementById('log');
    log.textContent += `${text}\n`;
  }

  function record(name, ok, detail = '') {
    results.push({ name, ok, detail });
    const klass = ok ? 'PASS' : 'FAIL';
    logLine(`[${klass}] ${name}${detail ? ` :: ${detail}` : ''}`);
  }

  function assert(name, condition, detail = '') {
    record(name, Boolean(condition), detail);
  }

  /**
   * Baseline scenario.
   * Values are close to the UI defaults so regressions are easy to notice.
   */
  const attackerAttack = 50;
  const defenderDefense = 20;

  const baseDamageQ16 = window.calculateBaseDamage(attackerAttack, defenderDefense);
  const dist = window.calculateDamageDistribution(attackerAttack, defenderDefense);
  const range = window.calculateDamageRange(attackerAttack, defenderDefense);
  const expectedBaselineRows = [
    [24, 30755],
    [25, 65536],
    [26, 65536],
    [27, 65536],
    [28, 65537],
    [29, 65536],
    [30, 65536],
    [31, 35356],
  ];
  const representativeCases = [
    {
      base: 22,
      def: 8,
      avgQ16: 1150864,
      widthQ16: 143858,
      totalOutcomes: 287718,
      rows: [
        [15, 41570],
        [16, 65536],
        [17, 65537],
        [18, 65536],
        [19, 49539],
      ],
    },
    {
      base: 23,
      def: 8,
      avgQ16: 1203176,
      widthQ16: 150397,
      totalOutcomes: 300796,
      rows: [
        [16, 61333],
        [17, 65536],
        [18, 65537],
        [19, 65536],
        [20, 42854],
      ],
    },
    {
      base: 200,
      def: 53,
      avgQ16: 2926660,
      widthQ16: 365832,
      totalOutcomes: 731666,
      rows: [
        [39, 60612],
        [40, 65536],
        [41, 65536],
        [42, 65536],
        [43, 65536],
        [44, 65537],
        [45, 65536],
        [46, 65536],
        [47, 65536],
        [48, 65536],
        [49, 65536],
        [50, 15693],
      ],
    },
  ];

  function rowsMatch(actualRows, expectedRows) {
    return actualRows.length === expectedRows.length
      && expectedRows.every(([damage, count], index) => (
        actualRows[index]?.damage === damage && actualRows[index]?.count === count
      ));
  }

  function approxEqual(actual, expected, epsilon = 1e-12) {
    return Math.abs(actual - expected) <= epsilon;
  }

  // 1) Damage distribution exists and has a positive outcome count.
  assert(
    '1. damage distribution is generated',
    dist && Array.isArray(dist.rows) && dist.rows.length > 0 && Number.isInteger(dist.totalOutcomes) && dist.totalOutcomes > 0,
    `rows=${dist?.rows?.length ?? 'n/a'}, totalOutcomes=${dist?.totalOutcomes ?? 'n/a'}`,
  );

  // 2) Sum of row counts matches totalOutcomes.
  const sumCount = dist.rows.reduce((acc, row) => acc + row.count, 0);
  assert(
    '2. row counts sum to totalOutcomes',
    sumCount === dist.totalOutcomes,
    `sumCount=${sumCount}, totalOutcomes=${dist.totalOutcomes}`,
  );

  // 2-extra) VBA DamageDist_Build uses total = 2 * (widthQ16 + 1), not fixed 64 outcomes.
  assert(
    '2-extra. totalOutcomes follows VBA widthQ16 formula',
    dist.widthQ16 === Math.trunc(baseDamageQ16 / 8) && dist.totalOutcomes === 2 * (dist.widthQ16 + 1),
    `widthQ16=${dist.widthQ16}, totalOutcomes=${dist.totalOutcomes}`,
  );

  // 2-extra-b) Baseline Q16 defense reduction follows ApplyDefense_Q16.
  assert(
    '2-extra-b. baseline base damage Q16 matches exact defense formula',
    baseDamageQ16 === 1837308,
    `baseDamageQ16=${baseDamageQ16}`,
  );

  // 2-extra-c) Baseline distribution matches the VBA +/- widthQ16 enumeration.
  const baselineRowsMatch = rowsMatch(dist.rows, expectedBaselineRows);
  assert(
    '2-extra-c. baseline distribution matches VBA DamageDist_Build',
    baselineRowsMatch,
    `rows=${dist.rows.map((row) => `${row.damage}:${row.count}`).join(',')}`,
  );

  // 2-extra-d) Representative cases used to compare with the old VBA workbook.
  const representativeCasesMatch = representativeCases.every((testCase) => {
    const caseBaseQ16 = window.calculateBaseDamage(testCase.base, testCase.def);
    const caseDist = window.calculateDamageDistribution(testCase.base, testCase.def);
    return caseBaseQ16 === testCase.avgQ16
      && caseDist.avgQ16 === testCase.avgQ16
      && caseDist.widthQ16 === testCase.widthQ16
      && caseDist.totalOutcomes === testCase.totalOutcomes
      && rowsMatch(caseDist.rows, testCase.rows);
  });
  assert(
    '2-extra-d. representative cases match VBA distribution counts',
    representativeCasesMatch,
    representativeCases.map((testCase) => {
      const caseDist = window.calculateDamageDistribution(testCase.base, testCase.def);
      return `${testCase.base}/${testCase.def}: total=${caseDist.totalOutcomes}, rows=${caseDist.rows.map((row) => `${row.damage}:${row.count}`).join(',')}`;
    }).join(' | '),
  );

  // 3) Range min/max matches distribution edges.
  const distMin = dist.rows[0].damage;
  const distMax = dist.rows[dist.rows.length - 1].damage;
  assert(
    '3. calculateDamageRange matches distribution min/max',
    range.minDamage === distMin && range.maxDamage === distMax && range.minDamage === 24 && range.maxDamage === 31,
    `range=[${range.minDamage},${range.maxDamage}] dist=[${distMin},${distMax}]`,
  );

  // 4) Defense 0 does not produce invalid values.
  const distDef0 = window.calculateDamageDistribution(50, 0);
  const validDef0 = distDef0.rows.every((row) => Number.isFinite(row.damage) && row.damage >= 1 && Number.isFinite(row.prob));
  assert(
    '4. defense 0 keeps finite damage values',
    Number.isFinite(window.calculateBaseDamage(50, 0)) && validDef0,
    `baseQ16=${window.calculateBaseDamage(50, 0)}, rows=${distDef0.rows.length}`,
  );

  // 5) Attack 0 does not produce invalid values.
  const distAtk0 = window.calculateDamageDistribution(0, 20);
  const validAtk0 = distAtk0.rows.every((row) => Number.isFinite(row.damage) && row.damage >= 1 && Number.isFinite(row.prob));
  assert(
    '5. attack 0 keeps finite damage values',
    Number.isFinite(window.calculateBaseDamage(0, 20)) && validAtk0,
    `baseQ16=${window.calculateBaseDamage(0, 20)}, rows=${distAtk0.rows.length}`,
  );

  // 5-extra) Attack 0 follows the same VBA width formula and collapses to guaranteed 1 damage.
  assert(
    '5-extra. attack 0 collapses all random outcomes to minimum damage',
    distAtk0.widthQ16 === 0
      && distAtk0.totalOutcomes === 2
      && distAtk0.rows.length === 1
      && distAtk0.rows[0].damage === 1
      && distAtk0.rows[0].count === 2,
    `rows=${distAtk0.rows.map((row) => `${row.damage}:${row.count}`).join(',')}, total=${distAtk0.totalOutcomes}`,
  );

  // 6) Kill probability stays within [0, 1].
  const p1 = window.calculateKillProbability(dist, 30, 1);
  const p2 = window.calculateKillProbability(dist, 120, 3);
  const inRange01 = (p) => Number.isFinite(p) && p >= 0 && p <= 1;
  assert(
    '6. kill probability is between 0 and 1',
    inRange01(p1) && inRange01(p2),
    `p1=${p1}, p2=${p2}`,
  );

  // 6-extra) Kill probability uses the same VBA one-attack distribution rows.
  // For the baseline, HP 30 is killed by 30 damage or 31 damage.
  assert(
    '6-extra. kill probability uses VBA single-attack distribution',
    approxEqual(p1, (65536 + 35356) / 459328),
    `p1=${p1}, expected=${(65536 + 35356) / 459328}`,
  );

  // 6-extra-b) Tail probabilities are exposed with VBA semantics.
  // tailProbGte is P(total damage >= row.damage), tailProbGt is P(total damage > row.damage).
  const row30 = dist.rows.find((row) => row.damage === 30);
  assert(
    '6-extra-b. tail probabilities match VBA semantics',
    row30
      && approxEqual(row30.tailProbGte, (65536 + 35356) / 459328)
      && approxEqual(row30.tailProbGt, 35356 / 459328),
    `row30.tailGte=${row30?.tailProbGte}, row30.tailGt=${row30?.tailProbGt}`,
  );

  // 7) Weapon seals apply only when the selected monster species matches.
  const dragonSealBonus = window.calculateWeaponSealBonusPercent(
    { butsu: 1, me: 0, tsuki: 0, ryu: 1, doSeal: 0, ryuAlt: 0 },
    { species1: 0, species2: 64 },
  );
  const ghostDragonBonus = window.calculateWeaponSealBonusPercent(
    { butsu: 1, me: 0, tsuki: 0, ryu: 1, doSeal: 0, ryuAlt: 0 },
    { species1: 0, species2: 76 },
  );
  const bombBonus = window.calculateWeaponSealBonusPercent(
    { butsu: 0, me: 0, tsuki: 1, ryu: 0, doSeal: 0, ryuAlt: 0 },
    { species1: 16, species2: 0 },
  );
  const drainBonus = window.calculateWeaponSealBonusPercent(
    { butsu: 0, me: 0, tsuki: 0, ryu: 0, doSeal: 10, ryuAlt: 0 },
    { species1: 0, species2: 2 },
  );
  const dragonAltBonus = window.calculateWeaponSealBonusPercent(
    { butsu: 0, me: 0, tsuki: 0, ryu: 0, doSeal: 0, ryuAlt: 1 },
    { species1: 0, species2: 72 },
  );
  const nonMatchingBonus = window.calculateWeaponSealBonusPercent(
    { butsu: 1, me: 0, tsuki: 0, ryu: 0, doSeal: 0, ryuAlt: 0 },
    { species1: 0, species2: 64 },
  );
  assert(
    '7. weapon seal bonus follows monster species',
    dragonSealBonus === 50
      && ghostDragonBonus === 100
      && bombBonus === 50
      && drainBonus === 400
      && dragonAltBonus === 100
      && nonMatchingBonus === 0,
    `dragon=${dragonSealBonus}, species76=${ghostDragonBonus}, bomb=${bombBonus}, drain=${drainBonus}, dragonAlt=${dragonAltBonus}, nonMatching=${nonMatchingBonus}`,
  );

  // 7-extra) Weapon seals transform the dealt-damage distribution without changing the outcome count.
  const boostedDist = window.applyWeaponSealsToDamageDistribution(dist, dragonSealBonus);
  const boostedCount = boostedDist.rows.reduce((acc, row) => acc + row.count, 0);
  assert(
    '7-extra. weapon seals boost dealt damage distribution',
    boostedDist.totalOutcomes === dist.totalOutcomes
      && boostedCount === dist.totalOutcomes
      && boostedDist.rows[0].damage === 36
      && boostedDist.rows[boostedDist.rows.length - 1].damage === 46
      && dist.rows[0].damage === 24
      && dist.rows[dist.rows.length - 1].damage === 31,
    `boosted=${boostedDist.rows.map((row) => `${row.damage}:${row.count}`).join(',')}`,
  );

  // 8) Critical hit is a dealt-damage-only final 1.5x floor transform.
  const criticalDist = window.applyCriticalHitToDamageDistribution(dist, true);
  const criticalCount = criticalDist.rows.reduce((acc, row) => acc + row.count, 0);
  assert(
    '8. critical hit boosts dealt damage distribution',
    criticalDist.totalOutcomes === dist.totalOutcomes
      && criticalCount === dist.totalOutcomes
      && criticalDist.rows[0].damage === 36
      && criticalDist.rows[criticalDist.rows.length - 1].damage === 46
      && criticalDist.rows.every((row) => dist.rows.some((baseRow) => Math.trunc(baseRow.damage * 1.5) === row.damage)),
    `critical=${criticalDist.rows.map((row) => `${row.damage}:${row.count}`).join(',')}`,
  );

  const noCriticalDist = window.applyCriticalHitToDamageDistribution(dist, false);
  assert(
    '8-extra. critical hit off keeps original distribution object',
    noCriticalDist === dist,
  );

  // 8-extra-b) Kill probability can consume the critical-adjusted distribution.
  assert(
    '8-extra-b. kill probability uses critical-adjusted distribution when provided',
    approxEqual(window.calculateKillProbability(criticalDist, 36, 1), 1)
      && approxEqual(window.calculateKillProbability(dist, 36, 1), 0),
    `criticalP=${window.calculateKillProbability(criticalDist, 36, 1)}, normalP=${window.calculateKillProbability(dist, 36, 1)}`,
  );

  // Extra: required public API functions are exposed.
  assert(
    'API. required functions are exposed',
    typeof window.calculateBaseDamage === 'function'
      && typeof window.calculateDamageDistribution === 'function'
      && typeof window.calculateDamageRange === 'function'
      && typeof window.calculateKillProbability === 'function'
      && typeof window.calculateWeaponSealBonusPercent === 'function'
      && typeof window.applyWeaponSealsToDamageDistribution === 'function'
      && typeof window.applyCriticalHitToDamageDistribution === 'function',
  );

  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  logLine('');
  logLine(`Summary: pass=${pass}, fail=${fail}, total=${results.length}`);

  // Expose results so browser devtools can inspect them.
  window.TEST_RESULTS = { pass, fail, total: results.length, results, baseDamageQ16 };
})();
