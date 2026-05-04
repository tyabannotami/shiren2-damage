(() => {
  const Q16 = 65536;
  const DEF_COEFF_Q16 = [0xF8E4, 0xF1FA, 0xE4B8, 0xCC58, 0xA31D, 0x67EE, 0x2A31, 0x06F4, 0x0030];
  const SHIREN_BASE_ATTACK_BY_LEVEL = [
    null,
    5, 6, 8, 10, 12, 14, 16, 18, 20, 22,
    24, 26, 28, 30, 32, 34, 36, 38, 40, 42,
    44, 46, 48, 50, 52, 54, 56, 58, 60, 62,
    64, 66, 68, 70, 72, 74, 76, 78, 80, 82,
    84, 85, 86, 87, 88, 89, 90, 91, 92, 93,
    94, 95, 96, 97, 98, 99, 100, 101, 102, 103,
    104, 105, 106, 107, 108, 109, 110, 111, 112, 113,
    114, 115, 116, 117, 118, 119, 120, 121, 122, 123,
    124, 125, 126, 127, 128, 129, 130, 131, 132, 133,
    134, 135, 136, 137, 138, 139, 140, 141, 145,
  ];

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
   * レベル、武器の強さ、ちからからシレン側の攻撃力を算出する。
   * 基礎攻撃力は kiso_kougeki.txt の値を、この配列定数へ写して使う。
   *
   * 式:
   *   attack = int((int(weaponPower / 2) + strength + 8) * baseAttack / 16)
   *
   * weaponSeals は将来の与ダメージ補正で使うため引数に残している。
   * TODO: 特効印、会心、その他補正は、攻撃力ではなくダメージ側へ反映する。
   */
  function calculatePlayerAttack(level, weaponPower, strength, weaponSeals = {}, options = {}) {
    void weaponSeals;

    const baseAttackTable = options.baseAttackByLevel ?? SHIREN_BASE_ATTACK_BY_LEVEL;
    const baseAttack = baseAttackTable[level];

    if (!Number.isInteger(level) || !Number.isInteger(baseAttack)) return null;
    if (!Number.isInteger(weaponPower) || !Number.isInteger(strength)) return null;

    return Math.trunc((Math.trunc(weaponPower / 2) + strength + 8) * baseAttack / 16);
  }

  /**
   * 盾の強さと盾印からシレン側の守備力を算出する。
   * 現時点で扱う盾印は「ち」印のみ。
   *
   * 式:
   *   defense = int((shieldPower + chiSealCount) / 2)
   *
   * TODO: 「ち」印以外の盾印が確認された場合は、この関数の入力と式を拡張する。
   */
  function calculatePlayerDefense(shieldPower, shieldSeals = {}, options = {}) {
    void options;

    const chiSealCount = shieldSeals.chi ?? 0;
    if (!Number.isInteger(shieldPower) || !Number.isInteger(chiSealCount)) return null;

    return Math.trunc((shieldPower + chiSealCount) / 2);
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
   * 1回攻撃ダメージの最小値と最大値を返す。
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
   * 指定回数の攻撃で目標HPを倒せる確率を計算する。
   * damageDistribution: calculateDamageDistribution の戻り値。
   * targetHp: 目標HP。
   * attackCount: 攻撃回数。
   */
  function calculateKillProbability(damageDistribution, targetHp, attackCount) {
    if (!Number.isInteger(targetHp) || targetHp <= 0) return 0;
    if (!Number.isInteger(attackCount) || attackCount <= 0) return 0;
    if (!damageDistribution || !Array.isArray(damageDistribution.rows) || damageDistribution.rows.length === 0) {
      return 0;
    }

    // 1回攻撃のダメージ確率分布を抽出する。
    const single = damageDistribution.rows.map((row) => ({
      damage: row.damage,
      prob: row.prob,
    }));

    // 合計ダメージの分布を畳み込みで構築する。
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
      throw new Error(`${name} は整数で入力してください。`);
    }
    if (value < min || value > max) {
      throw new Error(`${name} は ${min}〜${max} の範囲で入力してください。`);
    }
    return value;
  }

  function getOptionalInput(id) {
    // テスト用HTMLは最小DOMなので、追加UIが存在しない場合もある。
    // その場合は null を返し、既存の攻撃力・守備力計算だけで動かし続ける。
    return document.getElementById(id);
  }

  function readOptionalNumber(id, fallback = null) {
    const input = getOptionalInput(id);
    if (!input || input.value === '') return fallback;

    const value = Number(input.value);
    return Number.isFinite(value) ? value : fallback;
  }

  function readOptionalText(id, fallback = '') {
    const input = getOptionalInput(id);
    if (!input) return fallback;

    return input.value.trim();
  }

  function readOptionalCheckbox(id, fallback = false) {
    const input = getOptionalInput(id);
    if (!input) return fallback;

    return Boolean(input.checked);
  }

  function setInputValueIfExists(id, value) {
    const input = getOptionalInput(id);
    if (input) input.value = `${value}`;
  }

  function parseCsvLine(line) {
    // 現在のモンスターデータは単純なカンマ区切りだが、将来の安全のため引用符も最低限扱う。
    const cells = [];
    let current = '';
    let inQuote = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"' && next === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuote = !inQuote;
      } else if (char === ',' && !inQuote) {
        cells.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    cells.push(current);
    return cells.map((cell) => cell.trim());
  }

  function parseMonsterCsv(text) {
    // CSV形式:
    // モンスター名, HP, 攻撃, 守備, 種1, 種2
    // aliases は初期実装では空配列を持たせるだけにし、後続で別名データを追加できる形にする。
    return text
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, hp, attack, defense, species1, species2] = parseCsvLine(line);
        return {
          name,
          hp: Number(hp),
          attack: Number(attack),
          defense: Number(defense),
          species1: Number(species1),
          species2: Number(species2),
          aliases: [],
        };
      })
      .filter((monster) => (
        monster.name
        && Number.isFinite(monster.hp)
        && Number.isFinite(monster.attack)
        && Number.isFinite(monster.defense)
      ));
  }

  async function loadMonsterData() {
    // file:// で直接開いた場合など、fetch が失敗する環境がある。
    // その場合も手入力で計算できるため、呼び出し側で空配列として扱う。
    const response = await fetch('モンスターデータ.csv', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`monster csv load failed: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();

    try {
      // リポジトリのCSVはShift_JIS系のため、UTF-8固定で読むと名前が文字化けする。
      return parseMonsterCsv(new TextDecoder('shift_jis').decode(buffer));
    } catch (_error) {
      // 古いブラウザなどで shift_jis が使えない場合の保険。
      return parseMonsterCsv(new TextDecoder('utf-8').decode(buffer));
    }
  }

  function findMonsterByName(monsters, name) {
    if (!name) return null;

    return monsters.find((monster) => (
      monster.name === name || monster.aliases.includes(name)
    )) ?? null;
  }

  function applyMonsterToForm(monster) {
    if (!monster) return;

    // 候補から選んだ時点では自動入力するが、各数値欄は通常のinputなので後から上書きできる。
    setInputValueIfExists('monster-name', monster.name);
    setInputValueIfExists('monster-hp', monster.hp);
    setInputValueIfExists('monster-attack', monster.attack);
    setInputValueIfExists('monster-defense', monster.defense);
  }

  function populateMonsterCandidates(monsters) {
    const select = getOptionalInput('monster-select');
    const datalist = getOptionalInput('monster-name-list');

    if (select) {
      select.innerHTML = '<option value="">未選択</option>';
      for (const monster of monsters) {
        const option = document.createElement('option');
        option.value = monster.name;
        option.textContent = `${monster.name} (HP ${monster.hp} / 攻 ${monster.attack} / 守 ${monster.defense})`;
        select.appendChild(option);
      }
    }

    if (datalist) {
      datalist.innerHTML = '';
      for (const monster of monsters) {
        const option = document.createElement('option');
        option.value = monster.name;
        datalist.appendChild(option);

        // aliases はまだ空だが、後続で別名を入れた場合に同じdatalistへ出せるようにしておく。
        for (const alias of monster.aliases) {
          const aliasOption = document.createElement('option');
          aliasOption.value = alias;
          aliasOption.label = monster.name;
          datalist.appendChild(aliasOption);
        }
      }
    }
  }

  function bindMonsterSelection(monsters) {
    const select = getOptionalInput('monster-select');
    const nameInput = getOptionalInput('monster-name');

    if (select) {
      select.addEventListener('change', () => {
        const monster = findMonsterByName(monsters, select.value);
        applyMonsterToForm(monster);
      });
    }

    if (nameInput) {
      nameInput.addEventListener('change', () => {
        // datalistから選ばれた場合や正式名称を手入力した場合だけ自動反映する。
        // 部分一致中の入力を勝手に上書きしないため、inputイベントではなくchangeで処理する。
        const monster = findMonsterByName(monsters, nameInput.value.trim());
        if (monster) {
          if (select) select.value = monster.name;
          applyMonsterToForm(monster);
        } else if (select) {
          // 手入力が候補と一致しない場合は、古い選択状態だけ残ると紛らわしい。
          // 数値欄はユーザーの手入力を尊重して、そのまま残す。
          select.value = '';
        }
      });
    }
  }

  async function setupMonsterUi() {
    const note = document.getElementById('monster-data-note');
    const select = getOptionalInput('monster-select');
    const nameInput = getOptionalInput('monster-name');

    // テスト用HTMLにはモンスターUIがないので、何もせず戻る。
    if (!select && !nameInput) return;

    try {
      const monsters = await loadMonsterData();
      window.monsterData = monsters;
      populateMonsterCandidates(monsters);
      bindMonsterSelection(monsters);

      if (note) {
        note.textContent = `モンスター候補 ${monsters.length}件を読み込みました。数値は手動で上書きできます。`;
      }
    } catch (error) {
      window.monsterData = [];
      if (note) {
        note.textContent = 'モンスターデータを読み込めませんでした。HP・攻撃力・守備力を直接入力してください。';
      }
    }
  }

  function readExtendedUiInputs() {
    // 追加UIの値を、後続の計算拡張で使いやすい形に集約する。
    // TODO: 武器印、会心の一撃、盾印をダメージ計算へ反映する。
    return {
      player: {
        level: readOptionalNumber('level'),
        weaponStrength: readOptionalNumber('weapon-strength'),
        power: readOptionalNumber('power'),
        currentHp: readOptionalNumber('current-hp'),
        shieldStrength: readOptionalNumber('shield-strength'),
      },
      weaponSeals: {
        butsu: readOptionalNumber('weapon-seal-butsu', 0),
        me: readOptionalNumber('weapon-seal-me', 0),
        tsuki: readOptionalNumber('weapon-seal-tsuki', 0),
        ryu: readOptionalNumber('weapon-seal-ryu', 0),
        doSeal: readOptionalNumber('weapon-seal-do', 0),
        ryuAlt: readOptionalNumber('weapon-seal-ryu-alt', 0),
      },
      criticalHit: readOptionalCheckbox('critical-hit'),
      shieldSeals: {
        chi: readOptionalNumber('shield-seal-chi', 0),
      },
      monster: {
        name: readOptionalText('monster-name'),
        selected: readOptionalText('monster-select'),
        hp: readOptionalNumber('monster-hp'),
        attack: readOptionalNumber('monster-attack'),
        defense: readOptionalNumber('monster-defense'),
      },
    };
  }

  function buildCombatInputs(base, def, extendedInputs) {
    const playerAttack = calculatePlayerAttack(
      extendedInputs.player.level,
      extendedInputs.player.weaponStrength,
      extendedInputs.player.power,
      extendedInputs.weaponSeals,
    );
    const playerDefense = calculatePlayerDefense(
      extendedInputs.player.shieldStrength,
      extendedInputs.shieldSeals,
    );

    const monsterAttack = extendedInputs.monster.attack;
    const monsterDefense = extendedInputs.monster.defense;

    // 追加UIがないテスト用HTMLでは playerAttack などが null になる。
    // その場合は従来通り、直接入力された攻撃力・守備力をそのまま使う。
    const canUseExtendedDamage = Number.isInteger(playerAttack) && Number.isInteger(monsterDefense);
    const canUseExtendedTaken = Number.isInteger(monsterAttack) && Number.isInteger(playerDefense);

    return {
      dealt: {
        attack: canUseExtendedDamage ? playerAttack : base,
        defense: canUseExtendedDamage ? monsterDefense : def,
        source: canUseExtendedDamage ? 'extended' : 'direct',
      },
      taken: canUseExtendedTaken
        ? {
          attack: monsterAttack,
          defense: playerDefense,
          source: 'extended',
        }
        : null,
      playerAttack,
      playerDefense,
      monsterAttack,
      monsterDefense,
    };
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

  function setTextIfExists(id, text) {
    const elem = document.getElementById(id);
    if (elem) elem.textContent = text;
  }

  function renderCombatResult(combatResult) {
    renderResult(combatResult.dealt.distribution);

    setTextIfExists('used-attack', `${combatResult.dealt.attack}`);
    setTextIfExists('used-defense', `${combatResult.dealt.defense}`);

    const takenBlock = document.getElementById('taken-result-block');
    if (!takenBlock) return;

    if (!combatResult.taken) {
      takenBlock.hidden = true;
      return;
    }

    const minDamage = combatResult.taken.distribution.rows[0]?.damage ?? 1;
    const maxDamage = combatResult.taken.distribution.rows[combatResult.taken.distribution.rows.length - 1]?.damage ?? 1;

    takenBlock.hidden = false;
    setTextIfExists('taken-used-attack', `${combatResult.taken.attack}`);
    setTextIfExists('taken-used-defense', `${combatResult.taken.defense}`);
    setTextIfExists('taken-avg', `${formatFixed(combatResult.taken.distribution.avgQ16 / Q16, 2)} `);
    setTextIfExists('taken-minmax', `${minDamage} / ${maxDamage}`);
  }

  function setError(message) {
    const error = document.getElementById('error');
    error.textContent = message;
  }

  function bindUI() {
    const form = document.getElementById('calc-form');
    setupMonsterUi();

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      setError('');

      try {
        const baseInput = Number(document.getElementById('base').value);
        const defInput = Number(document.getElementById('def').value);

        const base = parseInput(baseInput, { min: 0, max: 9999, name: 'base' });
        const def = parseInput(defInput, { min: 0, max: 9999, name: 'def' });

        // 追加した入力欄を読み、正確式へ渡す前段の攻撃力・守備力を組み立てる。
        // 防御補正と乱数補正の正確式そのものは、calculateDamageDistribution の中で従来通り処理する。
        const extendedInputs = readExtendedUiInputs();
        const combatInputs = buildCombatInputs(base, def, extendedInputs);

        const dealtDistribution = calculateDamageDistribution(combatInputs.dealt.attack, combatInputs.dealt.defense);
        const takenDistribution = combatInputs.taken
          ? calculateDamageDistribution(combatInputs.taken.attack, combatInputs.taken.defense)
          : null;

        const combatResult = {
          inputs: combatInputs,
          dealt: {
            ...combatInputs.dealt,
            distribution: dealtDistribution,
          },
          taken: combatInputs.taken && takenDistribution
            ? {
              ...combatInputs.taken,
              distribution: takenDistribution,
            }
            : null,
        };

        // デバッグと段階的な実装確認のため、最後に使った入力と算出結果を公開する。
        window.lastExtendedInputs = extendedInputs;
        window.lastCombatInputs = combatInputs;
        window.lastCombatResult = combatResult;

        renderCombatResult(combatResult);
      } catch (error) {
        document.getElementById('result-panel').hidden = true;
        setError(error instanceof Error ? error.message : '入力値を確認してください。');
      }
    });

    form.requestSubmit();
  }

  // デバッグと段階的な移行のため公開しておく。
  window.applyDefenseQ16 = applyDefenseQ16;
  window.buildDistribution = calculateDamageDistribution;
  window.calculateBaseDamage = calculateBaseDamage;
  window.calculateDamageDistribution = calculateDamageDistribution;
  window.calculateDamageRange = calculateDamageRange;
  window.calculateKillProbability = calculateKillProbability;
  window.calculatePlayerAttack = calculatePlayerAttack;
  window.calculatePlayerDefense = calculatePlayerDefense;

  bindUI();
})();
