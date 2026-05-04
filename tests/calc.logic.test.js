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
    [24, 5],
    [25, 9],
    [26, 9],
    [27, 9],
    [28, 9],
    [29, 9],
    [30, 10],
    [31, 4],
  ];

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

  // 2-extra) The exact formula enumerates the 64 random values 224..287.
  assert(
    '2-extra. totalOutcomes is exact 64 random values',
    dist.totalOutcomes === 64,
    `totalOutcomes=${dist.totalOutcomes}`,
  );

  // 2-extra-b) Baseline Q16 defense reduction follows ApplyDefense_Q16.
  assert(
    '2-extra-b. baseline base damage Q16 matches exact defense formula',
    baseDamageQ16 === 1837308,
    `baseDamageQ16=${baseDamageQ16}`,
  );

  // 2-extra-c) Baseline distribution matches all 64 random outcomes after min damage.
  const baselineRowsMatch = dist.rows.length === expectedBaselineRows.length
    && expectedBaselineRows.every(([damage, count], index) => (
      dist.rows[index]?.damage === damage && dist.rows[index]?.count === count
    ));
  assert(
    '2-extra-c. baseline distribution matches exact random enumeration',
    baselineRowsMatch,
    `rows=${dist.rows.map((row) => `${row.damage}:${row.count}`).join(',')}`,
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

  // 5-extra) Attack 0 is represented as 64 outcomes collapsed into the guaranteed 1 damage.
  assert(
    '5-extra. attack 0 collapses all random outcomes to minimum damage',
    distAtk0.totalOutcomes === 64
      && distAtk0.rows.length === 1
      && distAtk0.rows[0].damage === 1
      && distAtk0.rows[0].count === 64,
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

  // 6-extra) Kill probability uses the same one-attack distribution rows.
  // For the baseline, HP 30 is killed by 30 damage (10 ways) or 31 damage (4 ways).
  assert(
    '6-extra. kill probability uses exact single-attack distribution',
    p1 === 14 / 64,
    `p1=${p1}, expected=${14 / 64}`,
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
