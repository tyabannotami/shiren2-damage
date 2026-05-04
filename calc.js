(() => {
  const Q16 = 65536;
  const DEF_COEFF_Q16 = [0xF8E4, 0xF1FA, 0xE4B8, 0xCC58, 0xA31D, 0x67EE, 0x2A31, 0x06F4, 0x0030];

  /**
   * docs/shiren2_damage_formula.md の ApplyDefense_Q16 相当処理。
   * defense を2進数ビットに分解し、立っているビットだけ Q16 係数を掛ける。
   * 係数を掛ける直前に aQ16 >> 16 相当で整数化する点が実機式の肝。
   */
  function applyDefenseQ16(base, def) {
    let aQ16 = base * Q16;
    let d = def;

    for (let i = 0; i < DEF_COEFF_Q16.length; i += 1) {
      if (d === 0) break;

      if ((d & 1) !== 0) {
        // ここで先に整数化し、Q16係数を掛けた後は割らずにQ16のまま保持する。
        const aInt = Math.trunc(aQ16 / Q16);
        aQ16 = aInt * DEF_COEFF_Q16[i];
      }

      d = Math.trunc(d / 2);
    }

    return aQ16;
  }

  /**
   * 防御減衰後、乱数補正前の基準値をQ16固定小数点で返す。
   * 受ダメと与ダメは attack/defense の作り方だけが違い、この関数以降は共通処理にする。
   */
  function calculateBaseDamage(attackerAttack, defenderDefense, options = {}) {
    void options;
    return applyDefenseQ16(attackerAttack, defenderDefense);
  }

  /**
   * 64通りの乱数 224..287 をすべて列挙して1回攻撃の分布を作る。
   * 倒確率はこの rows を畳み込むため、ここが受ダメ/与ダメ共通の正確な単発分布になる。
   */
  function buildDistributionFromBaseQ16(baseQ16) {
    const totalOutcomes = 64;
    const counts = new Map();
    let damageSum = 0;

    for (let random = 224; random <= 287; random += 1) {
      // baseQ16 はすでに65536倍なので、乱数補正の /256 とQ16解除の /65536 を同時に行う。
      const rawDamage = Math.floor((baseQ16 * random) / (256 * Q16));
      const damage = Math.max(1, rawDamage);
      counts.set(damage, (counts.get(damage) ?? 0) + 1);
      damageSum += damage;
    }

    const rows = [...counts.entries()]
      .map(([damage, count]) => ({ damage, count }))
      .sort((a, b) => a.damage - b.damage);

    let cumulative = 0;
    return {
      baseQ16,
      avgQ16: Math.round((damageSum * Q16) / totalOutcomes),
      totalOutcomes,
      rows: rows.map((row) => {
        const prob = row.count / totalOutcomes;
        cumulative += prob;
        return {
          damage: row.damage,
          count: row.count,
          prob,
          cumProb: cumulative,
        };
      }),
    };
  }

  /**
   * 通常攻撃1回分の分布を返す公開関数。
   * attackerAttack/defenderDefense が受ダメ由来でも与ダメ由来でも、ここから先は同じ式を使う。
   */
  function calculateDamageDistribution(attackerAttack, defenderDefense, options = {}) {
    const baseQ16 = calculateBaseDamage(attackerAttack, defenderDefense, options);
    return buildDistributionFromBaseQ16(baseQ16);
  }

  /**
   * 1��U���_���[�W�̍ŏ��l/�ő�l��Ԃ��֐��B
   */
  function calculateDamageRange(attackerAttack, defenderDefense, options = {}) {
    const distribution = calculateDamageDistribution(attackerAttack, defenderDefense, options);
    const minDamage = distribution.rows[0]?.damage ?? 1;
    const maxDamage = distribution.rows[distribution.rows.length - 1]?.damage ?? 1;
    return {
      minDamage,
      maxDamage,
      distribution,
    };
  }

  /**
   * �|�m�����v�Z����֐��B
   * damageDistribution: calculateDamageDistribution �̖߂�l
   * targetHp: �ڕWHP
   * attackCount: �U����
   */
  function calculateKillProbability(damageDistribution, targetHp, attackCount) {
    if (!Number.isInteger(targetHp) || targetHp <= 0) return 0;
    if (!Number.isInteger(attackCount) || attackCount <= 0) return 0;
    if (!damageDistribution || !Array.isArray(damageDistribution.rows) || damageDistribution.rows.length === 0) {
      return 0;
    }

    // �P���_���[�W�̊m�����z�𒊏o�B
    const single = damageDistribution.rows.map((row) => ({
      damage: row.damage,
      prob: row.prob,
    }));

    // ���v�_���[�W���z����ݍ��݂ō\�z�B
    let totalDist = new Map();
    totalDist.set(0, 1);

    for (let i = 0; i < attackCount; i += 1) {
      const next = new Map();
      for (const [sumDamage, sumProb] of totalDist.entries()) {
        for (const row of single) {
          const newDamage = sumDamage + row.damage;
          const newProb = sumProb * row.prob;
          next.set(newDamage, (next.get(newDamage) ?? 0) + newProb);
        }
      }
      totalDist = next;
    }

    let probability = 0;
    for (const [sumDamage, sumProb] of totalDist.entries()) {
      if (sumDamage >= targetHp) probability += sumProb;
    }

    return probability;
  }

  function formatFixed(value, digits = 4) {
    return value.toFixed(digits);
  }

  function formatPercent(ratio, digits = 1) {
    return `${(ratio * 100).toFixed(digits)}%`;
  }

  function parseInput(value, { min, max, name }) {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error(`${name} �͐����œ��͂��Ă��������B`);
    }
    if (value < min || value > max) {
      throw new Error(`${name} �� ${min}?${max} �͈̔͂œ��͂��Ă��������B`);
    }
    return value;
  }

  function renderResult(result) {
    const avgElem = document.getElementById('avg');
    const minMaxElem = document.getElementById('minmax');
    const tbody = document.getElementById('dist-body');

    const minDamage = result.rows[0]?.damage ?? 1;
    const maxDamage = result.rows[result.rows.length - 1]?.damage ?? 1;

    avgElem.textContent = `${formatFixed(result.avgQ16 / Q16, 2)} `;
    minMaxElem.textContent = `${minDamage} / ${maxDamage}`;

    tbody.innerHTML = '';
    for (const row of result.rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.damage}</td>
        <td>${formatPercent(row.prob, 1)}</td>
        <td>${formatPercent(row.cumProb, 1)}</td>
      `;
      tbody.appendChild(tr);
    }

    document.getElementById('result-panel').hidden = false;
  }

  function setError(message) {
    const error = document.getElementById('error');
    error.textContent = message;
  }

  function bindUI() {
    const form = document.getElementById('calc-form');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      setError('');

      try {
        const baseInput = Number(document.getElementById('base').value);
        const defInput = Number(document.getElementById('def').value);

        const base = parseInput(baseInput, { min: 0, max: 9999, name: 'base' });
        const def = parseInput(defInput, { min: 0, max: 9999, name: 'def' });

        // UI�͂��̂܂܁A�v�Z�Ăяo���̂ݕ����֐��𗘗p����B
        const result = calculateDamageDistribution(base, def);
        renderResult(result);
      } catch (error) {
        document.getElementById('result-panel').hidden = true;
        setError(error instanceof Error ? error.message : '���͒l���m�F���Ă��������B');
      }
    });

    form.requestSubmit();
  }

  // �f�o�b�O�ƒi�K�ڍs�̂��ߌ��J���Ă����B
  window.applyDefenseQ16 = applyDefenseQ16;
  window.buildDistribution = calculateDamageDistribution;
  window.calculateBaseDamage = calculateBaseDamage;
  window.calculateDamageDistribution = calculateDamageDistribution;
  window.calculateDamageRange = calculateDamageRange;
  window.calculateKillProbability = calculateKillProbability;

  bindUI();
})();
