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

  function buildDistributionFast(base, def) {
    const Q16 = 65536;
  
    const avgQ16 = applyDefenseQ16(base, def);
  
    // 32bit化する >> は避けて安全に（値が大きくなっても壊れにくい）
    const widthQ16 = Math.floor(avgQ16 / 8);
  
    const totalOutcomes = 2 * (widthQ16 + 1);
  
    const counts = new Map();
  
    // rawDamage(0もあり得る) を 0->1補正して加算
    function addCount(rawDamage, count) {
      if (count <= 0) return;
      const dmg = rawDamage === 0 ? 1 : rawDamage;
      counts.set(dmg, (counts.get(dmg) ?? 0) + count);
    }
  
    // mag区間 [lo, hi] を [0, widthQ16] に切って個数を返す（両端含む）
    function countMagInRange(lo, hi) {
      const a = Math.max(0, lo);
      const b = Math.min(widthQ16, hi);
      if (a > b) return 0;
      return (b - a + 1);
    }
  
    // +側：damage = floor((avgQ16 + magQ16)/Q16)
    // mag ∈ [d*Q16 - avgQ16, (d+1)*Q16 - 1 - avgQ16]
    const dPlusMin = Math.floor(avgQ16 / Q16);
    const dPlusMax = Math.floor((avgQ16 + widthQ16) / Q16);
    for (let d = dPlusMin; d <= dPlusMax; d += 1) {
      const lo = d * Q16 - avgQ16;
      const hi = (d + 1) * Q16 - 1 - avgQ16;
      const cnt = countMagInRange(lo, hi);
      addCount(d, cnt);
    }
  
    // -側：damage = floor((avgQ16 - magQ16)/Q16)
    // mag ∈ [avgQ16 - (d+1)*Q16 + 1, avgQ16 - d*Q16]
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

  function formatFixed(value, digits = 4) {
    return value.toFixed(digits);
  }

  function formatPercent(ratio, digits = 1) {
    return `${(ratio * 100).toFixed(digits)}%`;
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

        const base = parseInput(baseInput, { min: 0, max:9999, name: 'base' });
        const def = parseInput(defInput, { min: 0, max:9999, name: 'def' });

        const result = buildDistributionFast(base, def);
        renderResult(result);
      } catch (error) {
        document.getElementById('result-panel').hidden = true;
        setError(error instanceof Error ? error.message : '入力値を確認してください。');
      }
    });

    form.requestSubmit();
  }

  window.applyDefenseQ16 = applyDefenseQ16;
  window.buildDistribution = buildDistributionFast;

  bindUI();
})();
