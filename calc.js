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

  const WEAPON_SEAL_BONUS_TABLES = {
    // docs/shiren2_damage_ui_design.md の武器印表に対応する増加量(%).
    // 配列の添字を印の個数として扱うため、0個目には0を置く。
    butsu: [0, 50, 60, 70, 80, 90, 100, 140, 170, 200, 250, 300, 350, 400, 450, 500, 550, 600],
    me: [0, 50, 60, 70, 80, 90, 100, 140, 170, 200, 250, 300, 350, 400, 450, 500, 550, 600],
    tsuki: [0, 50, 60, 70, 80, 90, 100, 140, 170, 200, 250, 300, 350, 400, 450, 500, 550, 600],
    // 竜印はゲーム仕様上16個まで。UI側もmax=16にしている。
    ryu: [0, 50, 60, 70, 80, 90, 100, 140, 170, 200, 250, 300, 350, 400, 450, 500, 550],
    doSeal: [0, 50, 60, 70, 80, 90, 100, 140, 170, 200, 400, 400, 400, 400, 400, 400, 400, 400],
    ryuAlt: [0, 100, 120, 150, 170, 200, 250, 300, 400, 450, 500, 500, 500, 500, 500, 500, 500, 500],
  };

  const DRAGON_SPECIES2 = new Set([64, 72, 76, 96]);

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
   * 現時点で扱う盾印は「命印」のみ。
   *
   * 式:
   *   defense = int((shieldPower + lifeSealCount) / 2)
   *
   * TODO: 命印以外の盾印が確認された場合は、この関数の入力と式を拡張する。
   */
  function calculatePlayerDefense(shieldPower, shieldSeals = {}, options = {}) {
    void options;

    const lifeSealCount = shieldSeals.life ?? 0;
    if (!Number.isInteger(shieldPower) || !Number.isInteger(lifeSealCount)) return null;

    return Math.trunc((shieldPower + lifeSealCount) / 2);
  }

  function countIntegersInRange(start, end) {
    if (end < start) return 0;
    return end - start + 1;
  }

  function countRawDamageInVbaBranch(avgQ16, widthQ16, rawDamage, sign) {
    // VBA版 DamageDist_Build は m=0..widthQ16 を両端含みで走査し、
    // avgQ16 - m と avgQ16 + m の両方をカウントする。
    // ここでは総当たりせず、floor(dmgQ16 / Q16) が rawDamage になる m の範囲を
    // 整数区間として数える。結果はVBAの1件ずつ加算する処理と一致する。
    const q16Start = rawDamage * Q16;
    const q16End = ((rawDamage + 1) * Q16) - 1;
    let minM;
    let maxM;

    if (sign < 0) {
      // avgQ16 - m が [q16Start, q16End] に入る m を数える。
      minM = avgQ16 - q16End;
      maxM = avgQ16 - q16Start;
    } else {
      // avgQ16 + m が [q16Start, q16End] に入る m を数える。
      minM = q16Start - avgQ16;
      maxM = q16End - avgQ16;
    }

    const clampedStart = Math.max(0, minM);
    const clampedEnd = Math.min(widthQ16, maxM);
    return countIntegersInRange(clampedStart, clampedEnd);
  }

  function countDisplayedDamageInVbaDistribution(avgQ16, widthQ16, damage) {
    // VBA版では dmg = 0 の場合だけ 1 に補正する。
    // そのため表示上の1ダメージには raw damage 0 と 1 の両方が集約される。
    const rawDamages = damage === 1 ? [0, 1] : [damage];
    let count = 0;

    for (const rawDamage of rawDamages) {
      count += countRawDamageInVbaBranch(avgQ16, widthQ16, rawDamage, -1);
      count += countRawDamageInVbaBranch(avgQ16, widthQ16, rawDamage, 1);
    }

    return count;
  }

  /**
   * VBA版 DamageDist_Build 相当の分布を作る。
   *
   * 対応するVBA仕様:
   *   avgQ16 = ApplyDefense_Q16(base, def)
   *   widthQ16 = avgQ16 \ 8
   *   For m = 0 To widthQ16
   *     avgQ16 - m と avgQ16 + m を両方カウント
   *   total = 2 * (widthQ16 + 1)
   *
   * 旧実装の 224..287/256 の64通り乱数列挙は使わない。
   * totalOutcomes は入力値に応じて変わり、64固定ではない。
   */
  function buildDistributionFromBaseQ16(baseQ16) {
    const avgQ16 = baseQ16;
    const widthQ16 = Math.trunc(avgQ16 / 8);
    const totalOutcomes = 2 * (widthQ16 + 1);
    const minRawDamage = Math.trunc((avgQ16 - widthQ16) / Q16);
    const maxRawDamage = Math.trunc((avgQ16 + widthQ16) / Q16);
    const minDisplayedDamage = Math.max(1, minRawDamage);
    const maxDisplayedDamage = Math.max(1, maxRawDamage);
    const rows = [];
    let damageSum = 0;

    for (let damage = minDisplayedDamage; damage <= maxDisplayedDamage; damage += 1) {
      const count = countDisplayedDamageInVbaDistribution(avgQ16, widthQ16, damage);
      if (count <= 0) continue;
      damageSum += damage * count;
      rows.push({ damage, count });
    }

    let cumulative = 0;
    const rowsWithProb = rows.map((row) => {
      const prob = row.count / totalOutcomes;
      cumulative += prob;
      return {
        damage: row.damage,
        count: row.count,
        prob,
        percent: prob * 100,
        cumProb: cumulative,
      };
    });

    let tailProbGte = 0;
    for (let i = rowsWithProb.length - 1; i >= 0; i -= 1) {
      const row = rowsWithProb[i];
      row.tailProbGt = tailProbGte;
      tailProbGte += row.prob;
      row.tailProbGte = tailProbGte;
    }

    return {
      baseQ16,
      avgQ16,
      widthQ16,
      avgDamageQ16: Math.round((damageSum * Q16) / totalOutcomes),
      totalOutcomes,
      rows: rowsWithProb,
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
   * 武器印の個数から、docsの表にあるダメージ増加量(%)を返す。
   */
  function getWeaponSealBonusPercent(tableKey, count) {
    const table = WEAPON_SEAL_BONUS_TABLES[tableKey];
    if (!table) return 0;

    // UIからはnumber入力で入るが、手動入力やテストから小数が来ても
    // 印の個数として扱えるよう整数に丸め、表の範囲に収める。
    const normalizedCount = Number.isFinite(count) ? Math.trunc(count) : 0;
    const clampedCount = Math.max(0, Math.min(normalizedCount, table.length - 1));
    return table[clampedCount] ?? 0;
  }

  function getMonsterSpeciesFlags(monster = {}) {
    const species1 = Number(monster.species1);
    const species2 = Number(monster.species2);

    // モンスターデータCSVの「種1」「種2」を、武器印が参照しやすい形へ変換する。
    // 種2=76はドラゴンとゴーストの両方を持つため、両方trueにする。
    return {
      bomb: species1 === 16,
      drain: species2 === 2,
      ghost: species2 === 4 || species2 === 76,
      oneEye: species2 === 16 || species2 === 24,
      dragon: DRAGON_SPECIES2.has(species2),
    };
  }

  function calculateWeaponSealBonusPercent(weaponSeals = {}, monster = {}) {
    const species = getMonsterSpeciesFlags(monster);
    let bonusPercent = 0;

    // 武器印は攻撃力には混ぜず、正確式で通常ダメージ分布を作った後の
    // 与ダメージだけに最終補正として反映する。被ダメージや会心とは別処理。
    if (species.ghost) bonusPercent += getWeaponSealBonusPercent('butsu', weaponSeals.butsu);
    if (species.oneEye) bonusPercent += getWeaponSealBonusPercent('me', weaponSeals.me);
    if (species.bomb) bonusPercent += getWeaponSealBonusPercent('tsuki', weaponSeals.tsuki);
    if (species.dragon) bonusPercent += getWeaponSealBonusPercent('ryu', weaponSeals.ryu);
    if (species.drain) bonusPercent += getWeaponSealBonusPercent('doSeal', weaponSeals.doSeal);
    if (species.dragon) bonusPercent += getWeaponSealBonusPercent('ryuAlt', weaponSeals.ryuAlt);

    return bonusPercent;
  }

  function buildDistributionFromDamageCounts(sourceDistribution, damageCounts) {
    const totalOutcomes = sourceDistribution.totalOutcomes;
    const rows = [...damageCounts.entries()]
      .sort(([leftDamage], [rightDamage]) => leftDamage - rightDamage)
      .map(([damage, count]) => ({ damage, count }));
    let damageSum = 0;
    let cumulative = 0;

    const rowsWithProb = rows.map((row) => {
      const prob = row.count / totalOutcomes;
      damageSum += row.damage * row.count;
      cumulative += prob;
      return {
        damage: row.damage,
        count: row.count,
        prob,
        percent: prob * 100,
        cumProb: cumulative,
      };
    });

    let tailProbGte = 0;
    for (let i = rowsWithProb.length - 1; i >= 0; i -= 1) {
      const row = rowsWithProb[i];
      row.tailProbGt = tailProbGte;
      tailProbGte += row.prob;
      row.tailProbGte = tailProbGte;
    }

    const avgDamageQ16 = Math.round((damageSum * Q16) / totalOutcomes);
    return {
      ...sourceDistribution,
      // 武器印補正後は最終ダメージの期待値を表示に使いたいため、
      // avgQ16も補正後分布の平均に更新する。baseQ16/widthQ16は元の正確式の値を残す。
      avgQ16: avgDamageQ16,
      avgDamageQ16,
      rows: rowsWithProb,
    };
  }

  function applyWeaponSealsToDamageDistribution(damageDistribution, bonusPercent) {
    if (!damageDistribution || !Array.isArray(damageDistribution.rows)) return damageDistribution;
    if (!Number.isFinite(bonusPercent) || bonusPercent <= 0) return damageDistribution;

    const multiplierPercent = 100 + bonusPercent;
    const damageCounts = new Map();

    for (const row of damageDistribution.rows) {
      // VBA版相当の分布生成で出た「表示ダメージ」に対して、対象印の増加量を掛ける。
      // ここでは乱数幅や防御減衰は再計算せず、通り数だけを同じ母数のまま集約し直す。
      const boostedDamage = Math.max(1, Math.trunc((row.damage * multiplierPercent) / 100));
      damageCounts.set(boostedDamage, (damageCounts.get(boostedDamage) ?? 0) + row.count);
    }

    return {
      ...buildDistributionFromDamageCounts(damageDistribution, damageCounts),
      weaponSealBonusPercent: bonusPercent,
    };
  }

  function applyCriticalHitToDamageDistribution(damageDistribution, criticalHit) {
    if (!damageDistribution || !Array.isArray(damageDistribution.rows)) return damageDistribution;
    if (!criticalHit) return damageDistribution;

    const damageCounts = new Map();

    for (const row of damageDistribution.rows) {
      // 会心の一撃は、docsで定義した「会印による1.5倍」だけを扱う。
      // 超会心の腕輪の5倍とは別物。武器印などを反映した最終ダメージへ掛ける。
      const criticalDamage = Math.max(1, Math.trunc(row.damage * 1.5));
      damageCounts.set(criticalDamage, (damageCounts.get(criticalDamage) ?? 0) + row.count);
    }

    return {
      ...buildDistributionFromDamageCounts(damageDistribution, damageCounts),
      criticalHit: true,
    };
  }

  /**
   * 指定回数の攻撃で目標HPを倒せる確率を計算する。
   * 武器印が効く場合は、補正済みの与ダメージ分布を渡すことで撃破率にも反映する。
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
    // 武器印の対象判定だけに使う種別値。画面には出さず、候補選択時だけ保持する。
    setInputValueIfExists('monster-species1', monster.species1);
    setInputValueIfExists('monster-species2', monster.species2);
  }

  function clearMonsterSpeciesFormValues() {
    // モンスター名を直接入力して候補に一致しない場合、古い選択モンスターの種別が
    // 残ると武器印だけ誤って効いてしまうため、種別だけ空に戻す。
    setInputValueIfExists('monster-species1', '');
    setInputValueIfExists('monster-species2', '');
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
        if (monster) {
          applyMonsterToForm(monster);
        } else {
          clearMonsterSpeciesFormValues();
        }
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
          clearMonsterSpeciesFormValues();
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
        life: readOptionalNumber('shield-seal-life', 0),
      },
      monster: {
        name: readOptionalText('monster-name'),
        selected: readOptionalText('monster-select'),
        hp: readOptionalNumber('monster-hp'),
        attack: readOptionalNumber('monster-attack'),
        defense: readOptionalNumber('monster-defense'),
        species1: readOptionalNumber('monster-species1'),
        species2: readOptionalNumber('monster-species2'),
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

    // テスト用HTMLなど追加UIがない環境では playerAttack などが null になる。
    // その場合だけ、テスト用DOMの base/def を使って従来の計算API確認を継続する。
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

    const minDamage = result.rows[0]?.damage ?? 1;
    const maxDamage = result.rows[result.rows.length - 1]?.damage ?? 1;

    avgElem.textContent = `${formatFixed(result.avgQ16 / Q16, 2)} `;
    minMaxElem.textContent = `${minDamage} / ${maxDamage}`;
    renderDistributionRows('dist-body', result);

    document.getElementById('result-panel').hidden = false;
  }

  function renderDistributionRows(tbodyId, distribution) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    tbody.innerHTML = '';
    for (const row of distribution.rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.damage}</td>
        <td>${row.count}</td>
        <td>${formatPercent(row.prob, 1)}</td>
        <td>${formatPercent(row.tailProbGte, 1)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function setTextIfExists(id, text) {
    const elem = document.getElementById(id);
    if (elem) elem.textContent = text;
  }

  function setHiddenIfExists(id, hidden) {
    const elem = document.getElementById(id);
    if (elem) elem.hidden = hidden;
  }

  function getDamageRange(distribution) {
    return {
      minDamage: distribution.rows[0]?.damage ?? 1,
      maxDamage: distribution.rows[distribution.rows.length - 1]?.damage ?? 1,
    };
  }

  function formatDamageRange(distribution) {
    const { minDamage, maxDamage } = getDamageRange(distribution);
    return `${minDamage}〜${maxDamage}`;
  }

  function calculateHitCountToReachHp(targetHp, damagePerHit) {
    if (!Number.isInteger(targetHp) || targetHp <= 0) return null;
    if (!Number.isInteger(damagePerHit) || damagePerHit <= 0) return null;

    return Math.max(1, Math.ceil(targetHp / damagePerHit));
  }

  function calculateSurvivableHits(hp, damagePerHit) {
    // HPが0以下になった時点で死亡なので、死亡する一撃の直前までを「耐えられる回数」とする。
    const deathHitCount = calculateHitCountToReachHp(hp, damagePerHit);
    return deathHitCount === null ? null : Math.max(0, deathHitCount - 1);
  }

  function buildSafetySummary(hp, takenDistribution) {
    if (!Number.isInteger(hp) || hp <= 0 || !takenDistribution) return null;

    const { minDamage, maxDamage } = getDamageRange(takenDistribution);
    let status = '安全';
    let className = 'is-safe';

    if (hp <= minDamage) {
      status = '死亡';
      className = 'is-dead';
    } else if (hp <= maxDamage) {
      status = '危険';
      className = 'is-danger';
    }

    return {
      status,
      className,
      hp,
      minDamage,
      maxDamage,
      survivesMaxHit: hp > maxDamage,
      hasDeathRiskNextHit: hp <= maxDamage,
    };
  }

  function renderSafetySummary(combatResult) {
    const card = document.getElementById('judgement-card');
    const summary = buildSafetySummary(
      combatResult.extendedInputs.player.currentHp,
      combatResult.taken?.distribution,
    );

    if (card) {
      card.classList.remove('is-safe', 'is-danger', 'is-dead');
      if (summary) card.classList.add(summary.className);
    }

    if (!summary) {
      setTextIfExists('safety-label', '-');
      setTextIfExists('summary-current-hp', '-');
      setTextIfExists('summary-taken-range', '-');
      setTextIfExists('summary-survive-max', '-');
      setTextIfExists('summary-death-risk', '-');
      return;
    }

    setTextIfExists('safety-label', summary.status);
    setTextIfExists('summary-current-hp', `${summary.hp}`);
    setTextIfExists('summary-taken-range', `${summary.minDamage}〜${summary.maxDamage}`);
    setTextIfExists('summary-survive-max', summary.survivesMaxHit ? '耐える' : '耐えない');
    setTextIfExists('summary-death-risk', summary.hasDeathRiskNextHit ? 'あり' : 'なし');
  }

  function renderKillSummary(combatResult) {
    const targetHp = combatResult.extendedInputs.monster.hp;
    const { minDamage, maxDamage } = getDamageRange(combatResult.dealt.distribution);
    const shortest = calculateHitCountToReachHp(targetHp, maxDamage);
    const guaranteed = calculateHitCountToReachHp(targetHp, minDamage);

    setTextIfExists('dealt-range', formatDamageRange(combatResult.dealt.distribution));

    if (shortest === null || guaranteed === null) {
      setTextIfExists('kill-hit-summary', 'モンスターHPを入力してください');
    } else {
      setTextIfExists('kill-hit-summary', `最短${shortest}発 / 確定${guaranteed}発`);
    }

    const list = document.getElementById('kill-rate-list');
    if (!list) return;

    list.innerHTML = '';
    for (let attackCount = 1; attackCount <= 6; attackCount += 1) {
      const probability = Number.isInteger(targetHp) && targetHp > 0
        ? calculateKillProbability(combatResult.dealt.distribution, targetHp, attackCount)
        : null;
      const probabilityText = probability === null ? '-' : formatPercent(probability, 1);
      const percent = Math.max(0, Math.min(100, probability * 100));
      const row = document.createElement('div');
      row.className = 'rate-row';
      row.innerHTML = `
        <strong>${attackCount}発</strong>
        <div>
          <span>${attackCount}発撃破率 ${probabilityText}</span>
          <div class="rate-bar" aria-hidden="true"><span style="width: ${percent}%"></span></div>
        </div>
      `;
      list.appendChild(row);
    }
  }

  function renderSurvivalSummary(combatResult) {
    if (!combatResult.taken) {
      setHiddenIfExists('taken-result-block', true);
      setHiddenIfExists('taken-distribution-details', true);
      return;
    }

    const hp = combatResult.extendedInputs.player.currentHp;
    const { minDamage, maxDamage } = getDamageRange(combatResult.taken.distribution);
    const deathByMax = calculateHitCountToReachHp(hp, maxDamage);
    const deathByMin = calculateHitCountToReachHp(hp, minDamage);
    const surviveByMax = calculateSurvivableHits(hp, maxDamage);
    const surviveByMin = calculateSurvivableHits(hp, minDamage);

    setHiddenIfExists('taken-result-block', false);
    setHiddenIfExists('taken-distribution-details', false);
    setTextIfExists('taken-range', formatDamageRange(combatResult.taken.distribution));

    if (deathByMax === null || deathByMin === null) {
      setTextIfExists('survival-summary', '現在HPを入力してください');
      setTextIfExists('survive-by-max', '-');
      setTextIfExists('survive-by-min', '-');
      return;
    }

    const maxHitText = deathByMax === 1 ? '最大乱数1発で倒れる' : `最大乱数${deathByMax}発で倒れる`;
    const firstHitText = surviveByMax >= 1 ? '最大乱数でも1発耐える' : '次の一撃で死亡あり';

    setTextIfExists('survival-summary', `${firstHitText} / ${maxHitText}`);
    setTextIfExists('survive-by-max', `${surviveByMax}発耐える（${maxHitText}）`);
    setTextIfExists('survive-by-min', `${surviveByMin}発耐える（最小乱数${deathByMin}発で倒れる）`);
  }

  function renderCombatResult(combatResult) {
    renderResult(combatResult.dealt.distribution);

    setTextIfExists('used-attack', `${combatResult.dealt.attack}`);
    setTextIfExists('used-defense', `${combatResult.dealt.defense}`);
    setTextIfExists('dealt-range', formatDamageRange(combatResult.dealt.distribution));
    renderKillSummary(combatResult);
    renderSafetySummary(combatResult);
    renderSurvivalSummary(combatResult);

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
    renderDistributionRows('taken-dist-body', combatResult.taken.distribution);
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
        const baseInput = getOptionalInput('base');
        const defInput = getOptionalInput('def');
        const base = baseInput
          ? parseInput(Number(baseInput.value), { min: 0, max: 9999, name: 'base' })
          : null;
        const def = defInput
          ? parseInput(Number(defInput.value), { min: 0, max: 9999, name: 'def' })
          : null;

        // 追加した入力欄を読み、正確式へ渡す前段の攻撃力・守備力を組み立てる。
        // 防御補正と乱数補正の正確式そのものは、calculateDamageDistribution の中で従来通り処理する。
        const extendedInputs = readExtendedUiInputs();
        const combatInputs = buildCombatInputs(base, def, extendedInputs);

        const baseDealtDistribution = calculateDamageDistribution(combatInputs.dealt.attack, combatInputs.dealt.defense);
        const weaponSealBonusPercent = calculateWeaponSealBonusPercent(
          extendedInputs.weaponSeals,
          extendedInputs.monster,
        );
        // 防御減衰と乱数分布は正確式のまま作り、その後で対象種別に一致した武器印だけを
        // 与ダメージ分布へ反映する。被ダメージ側には同じ補正を渡さない。
        const dealtDistribution = applyWeaponSealsToDamageDistribution(
          baseDealtDistribution,
          weaponSealBonusPercent,
        );
        // 会心チェックが入っている場合だけ、与ダメージの最終分布へ1.5倍切り捨てを掛ける。
        // 被ダメージ側には渡さず、武器印とは別の後段補正として扱う。
        const finalDealtDistribution = applyCriticalHitToDamageDistribution(
          dealtDistribution,
          extendedInputs.criticalHit,
        );
        const takenDistribution = combatInputs.taken
          ? calculateDamageDistribution(combatInputs.taken.attack, combatInputs.taken.defense)
          : null;

        const combatResult = {
          extendedInputs,
          inputs: combatInputs,
          dealt: {
            ...combatInputs.dealt,
            distribution: finalDealtDistribution,
            baseDistribution: baseDealtDistribution,
            weaponSealDistribution: dealtDistribution,
            weaponSealBonusPercent,
            criticalHit: extendedInputs.criticalHit,
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
  window.getMonsterSpeciesFlags = getMonsterSpeciesFlags;
  window.calculateWeaponSealBonusPercent = calculateWeaponSealBonusPercent;
  window.applyWeaponSealsToDamageDistribution = applyWeaponSealsToDamageDistribution;
  window.applyCriticalHitToDamageDistribution = applyCriticalHitToDamageDistribution;

  bindUI();
})();
