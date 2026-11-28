// 같이 걷는 동물 친구 그림. 이모지가 얼굴만 있는 동물(곰, 판다, 여우…)은 여기서 몸까지 그려요.
// 모든 모양은 이 파일에서 직접 그린 독자 디자인이에요.
// 사용법: Pets.svg("bear") → 그림이 있으면 SVG 글자, 없으면 "" (그때는 이모지를 써요)
(function () {
  const INK = "#3a2e2a";

  // 공통 몸: 큰 머리 + 작은 몸통 + 짧은 팔다리 (100×100 칸, 발이 바닥에 닿아요)
  function body(p) {
    const fur = p.fur;
    const limb = p.limb || fur;
    // 흰 동물은 바탕에 묻히지 않게 연한 테두리를 둘러요
    const line = p.line ? ` stroke="${p.line}" stroke-width="1.4"` : "";
    return (
      (p.tail || "") +
      `<g class="pet-legs"><ellipse cx="40" cy="91" rx="8" ry="6" fill="${limb}"${line}/><ellipse cx="60" cy="91" rx="8" ry="6" fill="${limb}"${line}/></g>` +
      `<ellipse cx="50" cy="74" rx="20" ry="17" fill="${fur}"${line}/>` +
      (p.belly ? `<ellipse cx="50" cy="77" rx="12" ry="11" fill="${p.belly}"/>` : "") +
      `<ellipse cx="31" cy="72" rx="6" ry="9" transform="rotate(25 31 72)" fill="${limb}"${line}/>` +
      `<ellipse cx="69" cy="72" rx="6" ry="9" transform="rotate(-25 69 72)" fill="${limb}"${line}/>` +
      (p.ears || "") +
      `<ellipse cx="50" cy="40" rx="27" ry="24" fill="${fur}"${line}/>` +
      (p.mask || "") +
      (p.eyes ?? eyes()) +
      `<ellipse cx="33" cy="49" rx="4.5" ry="2.8" fill="#ff9e9e" opacity="0.5"/><ellipse cx="67" cy="49" rx="4.5" ry="2.8" fill="#ff9e9e" opacity="0.5"/>` +
      (p.face || "") +
      (p.top || "")
    );
  }

  const eyes = (y = 41, color = INK) =>
    `<ellipse cx="40" cy="${y}" rx="3" ry="3.8" fill="${color}"/><ellipse cx="60" cy="${y}" rx="3" ry="3.8" fill="${color}"/>` +
    `<circle cx="41.1" cy="${y - 1.4}" r="1.1" fill="#fff"/><circle cx="61.1" cy="${y - 1.4}" r="1.1" fill="#fff"/>`;

  // 동그란 주둥이 + 코 + 입
  const snout = (color, nose = INK) =>
    `<ellipse cx="50" cy="50" rx="10" ry="7.5" fill="${color}"/><ellipse cx="50" cy="47" rx="3.4" ry="2.4" fill="${nose}"/>` +
    `<path d="M50 49.5 V52 M46.5 52.5 Q50 55 53.5 52.5" stroke="${INK}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;

  const roundEars = (outer, inner) =>
    `<circle cx="29" cy="20" r="9" fill="${outer}"/><circle cx="71" cy="20" r="9" fill="${outer}"/>` +
    `<circle cx="29" cy="20" r="4.5" fill="${inner}"/><circle cx="71" cy="20" r="4.5" fill="${inner}"/>`;

  const PETS = {
    bear: body({
      fur: "#b9845a",
      belly: "#ecd0ad",
      ears: roundEars("#b9845a", "#ecd0ad"),
      face: snout("#ecd0ad"),
      tail: `<circle cx="70" cy="84" r="5" fill="#a5714b"/>`,
    }),
    panda: body({
      fur: "#fbfaf6",
      limb: "#3d3a42",
      line: "#e4e0da",
      ears: roundEars("#3d3a42", "#3d3a42"),
      mask:
        `<ellipse cx="39" cy="41" rx="7" ry="8.5" transform="rotate(-25 39 41)" fill="#3d3a42"/>` +
        `<ellipse cx="61" cy="41" rx="7" ry="8.5" transform="rotate(25 61 41)" fill="#3d3a42"/>`,
      eyes: eyes(41, "#fff").replaceAll('fill="#fff"/>', `fill="${INK}"/>`),
      face:
        `<ellipse cx="50" cy="49" rx="3.2" ry="2.2" fill="#3d3a42"/>` +
        `<path d="M50 51 V53 M47 53.5 Q50 55.5 53 53.5" stroke="${INK}" stroke-width="1.3" fill="none" stroke-linecap="round"/>` +
        // 대나무 한 줄기
        `<g transform="rotate(-18 74 66)"><rect x="72" y="50" width="4" height="34" rx="2" fill="#7cc46b"/><path d="M72 62 H76 M72 73 H76" stroke="#5aa54a" stroke-width="1.2"/><path d="M76 56 Q84 50 88 52 Q82 57 76 58Z" fill="#8fd47c"/></g>`,
    }),
    koala: body({
      fur: "#a9abb7",
      belly: "#e3e1e8",
      ears:
        `<circle cx="25" cy="27" r="13" fill="#a9abb7"/><circle cx="75" cy="27" r="13" fill="#a9abb7"/>` +
        `<circle cx="26" cy="28" r="8" fill="#ece6ee"/><circle cx="74" cy="28" r="8" fill="#ece6ee"/>`,
      face:
        `<ellipse cx="50" cy="48" rx="6.5" ry="8" fill="#4b4752"/><ellipse cx="48" cy="45" rx="1.8" ry="2.4" fill="#76717e"/>` +
        `<path d="M46 57 Q50 59.5 54 57" stroke="${INK}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`,
    }),
    hamster: body({
      fur: "#f2b46b",
      belly: "#fff3e3",
      ears: roundEars("#f2b46b", "#ffc2b8"),
      mask: `<ellipse cx="50" cy="50" rx="22" ry="13" fill="#fff3e3"/>`,
      face:
        // 볼 빵빵 + 해바라기씨
        `<ellipse cx="29" cy="48" rx="8" ry="7" fill="#fff3e3"/><ellipse cx="71" cy="48" rx="8" ry="7" fill="#fff3e3"/>` +
        `<ellipse cx="50" cy="46.5" rx="2.4" ry="1.7" fill="#e88a8a"/>` +
        `<path d="M50 48 V50 M47 50.5 Q50 52.5 53 50.5" stroke="${INK}" stroke-width="1.2" fill="none" stroke-linecap="round"/>` +
        `<ellipse cx="50" cy="71" rx="3.5" ry="6" fill="#4a4140"/><path d="M50 66 V76" stroke="#d9d0c8" stroke-width="1"/>`,
    }),
    fox: body({
      fur: "#f08a3c",
      belly: "#fff6ea",
      limb: "#e27a2d",
      tail:
        `<path d="M64 84 Q92 82 90 56 Q88 46 82 52 Q84 70 64 74Z" fill="#f08a3c"/>` +
        `<path d="M90 56 Q88 46 82 52 Q84 58 88 60Z" fill="#fff6ea"/>`,
      ears:
        `<path d="M24 32 L28 8 L44 22Z" fill="#f08a3c"/><path d="M76 32 L72 8 L56 22Z" fill="#f08a3c"/>` +
        `<path d="M28 8 L30 18 L36 16Z" fill="#4a3530"/><path d="M72 8 L70 18 L64 16Z" fill="#4a3530"/>`,
      mask: `<path d="M24 44 Q36 40 50 47 Q64 40 76 44 Q72 62 50 64 Q28 62 24 44Z" fill="#fff6ea"/>`,
      face:
        `<ellipse cx="50" cy="49" rx="3" ry="2.2" fill="${INK}"/>` +
        `<path d="M50 51 V53 M47 53.5 Q50 55.5 53 53.5" stroke="${INK}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`,
    }),
    frog: body({
      fur: "#8fd16a",
      belly: "#e6f6cf",
      limb: "#7bc257",
      ears:
        `<circle cx="36" cy="21" r="10" fill="#8fd16a"/><circle cx="64" cy="21" r="10" fill="#8fd16a"/>` +
        `<circle cx="36" cy="21" r="6.5" fill="#fff"/><circle cx="64" cy="21" r="6.5" fill="#fff"/>`,
      eyes:
        `<circle cx="36.5" cy="22" r="3.6" fill="${INK}"/><circle cx="64.5" cy="22" r="3.6" fill="${INK}"/>` +
        `<circle cx="37.7" cy="20.6" r="1.2" fill="#fff"/><circle cx="65.7" cy="20.6" r="1.2" fill="#fff"/>`,
      face:
        `<path d="M34 45 Q50 56 66 45" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>` +
        `<circle cx="46" cy="38" r="1" fill="#5d9e3f"/><circle cx="54" cy="38" r="1" fill="#5d9e3f"/>`,
    }),
    unicorn: body({
      fur: "#fdf8ff",
      line: "#e2d6f2",
      tail:
        `<path d="M66 82 Q86 84 86 66 Q80 74 70 72Z" fill="#c3b1f0"/><path d="M68 78 Q84 80 82 66 Q78 72 69 74Z" fill="#ffb4c8"/>`,
      ears: `<path d="M27 26 L26 10 L38 20Z" fill="#fdf8ff" stroke="#e2d6f2" stroke-width="1.4"/><path d="M73 26 L74 10 L62 20Z" fill="#fdf8ff" stroke="#e2d6f2" stroke-width="1.4"/><path d="M28 22 L28 14 L34 20Z" fill="#ffc8d8"/><path d="M72 22 L72 14 L66 20Z" fill="#ffc8d8"/>`,
      face:
        `<ellipse cx="50" cy="51" rx="9" ry="6" fill="#ffe4ee"/><circle cx="47" cy="50" r="1" fill="#c88aa0"/><circle cx="53" cy="50" r="1" fill="#c88aa0"/>` +
        `<path d="M46.5 54 Q50 56 53.5 54" stroke="${INK}" stroke-width="1.2" fill="none" stroke-linecap="round"/>` +
        `<g fill="#c3b1f0"><ellipse cx="40" cy="91" rx="8" ry="3" /><ellipse cx="60" cy="91" rx="8" ry="3"/></g>`,
      top:
        // 갈기와 뿔
        `<path d="M30 26 Q36 12 52 14 Q46 20 48 26 Q40 22 30 30Z" fill="#ffb4c8"/>` +
        `<path d="M48 18 Q58 10 70 20 Q62 20 60 26 Q56 20 48 22Z" fill="#9cc7f0"/>` +
        `<path d="M70 22 Q80 30 78 44 Q74 36 68 34Z" fill="#c3b1f0"/>` +
        `<path d="M45 18 L50 -1 L55 18Z" fill="#f6d365" stroke="#e2b84a" stroke-width="1"/>` +
        `<path d="M46.5 13 L53 11 M47.5 8 L52 6.5" stroke="#e2b84a" stroke-width="1"/>`,
    }),
  };

  function svg(id) {
    const art = PETS[id];
    return art
      ? `<svg class="pet-svg" viewBox="0 -4 100 104" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${art}</svg>`
      : "";
  }

  // 이모지 대신 그림을 넣어요 (그림이 없는 동물은 이모지 그대로)
  function paint(el, character) {
    const art = svg(character.id);
    if (art) el.innerHTML = art;
    else el.textContent = character.emoji;
  }

  window.Pets = { svg, paint, ids: Object.keys(PETS) };
})();
