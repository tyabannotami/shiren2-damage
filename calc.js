(() => {
  const Q16 = 65536;
  const DEF_COEFF_Q16 = [0xF8E4, 0xF1FA, 0xE4B8, 0xCC58, 0xA31D, 0x67EE, 0x2A31, 0x06F4, 0x0030];

  /**
   * �h��␳��Q16�Œ菬���œK�p��������֐��B
   * ���i�K�͊����d�l�ێ����ړI�Ȃ̂ŁA�����͕ύX���Ȃ��B
   */
  function applyDefenseQ16(base, def) {
    let aQ16 = base * Q16;
    for (let i = 0; i < DEF_COEFF_Q16.length; i += 1) {
      if (def & (1 << i)) {
        const aInt = Math.trunc(aQ16 / Q16);
        aQ16 = aInt * DEF_COEFF_Q16[i];
      }
    }
    return aQ16;
  }

  /**
   * ��_���[�W���v�Z����֐��B
   * �����̐��m�������ւ��_�Ƃ��ĕ�������B
   */
  function calculateBaseDamage(attackerAttack, defenderDefense, options = {}) {
    void options;
    return applyDefenseQ16(attackerAttack, defenderDefense);
  }

  /**
   * �����̕��z�v�Z���W�b�N�{�́B
   * baseQ16 ���󂯎��A�_���[�W���z��Ԃ��B
   */
  function buildDistributionFastFromBaseQ16(baseQ16) {
    const avgQ16 = baseQ16;

    // ���������̕���`���ێ�����B
    const widthQ16 = Math.floor(avgQ16 / 8);

    // +�h�炬��-�h�炬�̗����𐔂��邽��2�{�B
    const totalOutcomes = 2 * (widthQ16 + 1);

    const counts = new Map();

    // �ŏ��_���[�W1���ێ���������d�l�B
    function addCount(rawDamage, count) {
      if (count <= 0) return;
      const dmg = rawDamage === 0 ? 1 : rawDamage;
      counts.set(dmg, (counts.get(dmg) ?? 0) + count);
    }

    function countMagInRange(lo, hi) {
      const a = Math.max(0, lo);
      const b = Math.min(widthQ16, hi);
      if (a > b) return 0;
      return b - a + 1;
    }

    // +��: damage = floor((avgQ16 + magQ16) / Q16)
    const dPlusMin = Math.floor(avgQ16 / Q16);
    const dPlusMax = Math.floor((avgQ16 + widthQ16) / Q16);
    for (let d = dPlusMin; d <= dPlusMax; d += 1) {
      const lo = d * Q16 - avgQ16;
      const hi = (d + 1) * Q16 - 1 - avgQ16;
      const cnt = countMagInRange(lo, hi);
      addCount(d, cnt);
    }

    // -��: damage = floor((avgQ16 - magQ16) / Q16)
    const dMinusMin = Math.floor((avgQ16 - widthQ16) / Q16);
    const dMinusMax = Math.floor(avgQ16 / Q16);
    for (let d = dMinusMin; d <= dMinusMax; d += 1) {
      const lo = avgQ16 - (d + 1) * Q16 + 1;
      const hi = avgQ16 - d * Q16;
      const cnt = countMagInRange(lo, hi);
      addCount(d, cnt);
    }

    const rows = [...counts.entries()]
      .map(([damage, count]) => ({ damage, count }))
      .sort((a, b) => a.damage - b.damage);

    let cumulative = 0;
    return {
      avgQ16,
      widthQ16,
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
   * 1��U���̃_���[�W���z���v�Z������J�֐��B
   * ���܂͊������W�b�N�ֈϏ����Č݊����ێ�����B
   */
  function calculateDamageDistribution(attackerAttack, defenderDefense, options = {}) {
    const baseQ16 = calculateBaseDamage(attackerAttack, defenderDefense, options);
    return buildDistributionFastFromBaseQ16(baseQ16);
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