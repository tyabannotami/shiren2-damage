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

  // Extra: required public API functions are exposed.
  assert(
    'API. required functions are exposed',
    typeof window.calculateBaseDamage === 'function'
      && typeof window.calculateDamageDistribution === 'function'
      && typeof window.calculateDamageRange === 'function'
      && typeof window.calculateKillProbability === 'function',
  );

  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  logLine('');
  logLine(`Summary: pass=${pass}, fail=${fail}, total=${results.length}`);

  // Expose results so browser devtools can inspect them.
  window.TEST_RESULTS = { pass, fail, total: results.length, results, baseDamageQ16 };
})();
