(() => {
  const Q16 = 65536;
  const DEF_COEFF_Q16 = [0xF8E4, 0xF1FA, 0xE4B8, 0xCC58, 0xA31D, 0x67EE, 0x2A31, 0x06F4, 0x0030];

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

  function buildDistribution(base, def) {
    const avgQ16 = applyDefenseQ16(base, def);
    const widthQ16 = avgQ16 >> 3;
    const totalOutcomes = 2 * (widthQ16 + 1);

    const counts = new Map();
    for (let magQ16 = 0; magQ16 <= widthQ16; magQ16 += 1) {
      const plusDamage = toDamage(avgQ16 + magQ16);
      const minusDamage = toDamage(avgQ16 - magQ16);

      counts.set(plusDamage, (counts.get(plusDamage) ?? 0) + 1);
      counts.set(minusDamage, (counts.get(minusDamage) ?? 0) + 1);
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

  function toDamage(dmgQ16) {
    const dmg = dmgQ16 >> 16;
    return dmg === 0 ? 1 : dmg;
  }

  function formatFixed(value, digits = 4) {
    return value.toFixed(digits);
  }

  function formatPercent(ratio, digits = 4) {
    return (ratio * 100).toFixed(digits);
  }

  function parseInput(value, { min, max, name }) {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error(`${name} は整数で入力してください。`);
    }
    if (value < min || value > max) {
      throw new Error(`${name} は ${min}〜${max} の範囲で入力してください。`);
    }
    return value;
  }

  function renderResult(result) {
    const avgElem = document.getElementById('avg');
    const minMaxElem = document.getElementById('minmax');
    const tbody = document.getElementById('dist-body');

    const minDamage = result.rows[0]?.damage ?? 1;
    const maxDamage = result.rows[result.rows.length - 1]?.damage ?? 1;

    avgElem.textContent = `${formatFixed(result.avgQ16 / Q16, 4)} (${result.avgQ16}/65536)`;
    minMaxElem.textContent = `${minDamage} / ${maxDamage}`;

    tbody.innerHTML = '';
    for (const row of result.rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.damage}</td>
        <td>${formatPercent(row.prob, 4)}</td>
        <td>${formatPercent(row.cumProb, 4)}</td>
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

        const base = parseInput(baseInput, { min: 0, max:9999, name: 'base' });
        const def = parseInput(defInput, { min: 0, max:9999, name: 'def' });

        const result = buildDistribution(base, def);
        renderResult(result);
      } catch (error) {
        document.getElementById('result-panel').hidden = true;
        setError(error instanceof Error ? error.message : '入力値を確認してください。');
      }
    });

    form.requestSubmit();
  }

  window.applyDefenseQ16 = applyDefenseQ16;
  window.buildDistribution = buildDistribution;

  bindUI();
})();
