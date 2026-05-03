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

  // 3) Range min/max matches distribution edges.
  const distMin = dist.rows[0].damage;
  const distMax = dist.rows[dist.rows.length - 1].damage;
  assert(
    '3. calculateDamageRange matches distribution min/max',
    range.minDamage === distMin && range.maxDamage === distMax,
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

  // 6) Kill probability stays within [0, 1].
  const p1 = window.calculateKillProbability(dist, 30, 1);
  const p2 = window.calculateKillProbability(dist, 120, 3);
  const inRange01 = (p) => Number.isFinite(p) && p >= 0 && p <= 1;
  assert(
    '6. kill probability is between 0 and 1',
    inRange01(p1) && inRange01(p2),
    `p1=${p1}, p2=${p2}`,
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
