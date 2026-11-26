// 걸음모도로 아바타 그리기: 둥근 머리의 귀여운 사람 캐릭터를 SVG로 그려요.
// 모든 모양은 이 파일에서 직접 그린 독자 디자인이에요.
// 사용법: Avatar.svg({ skin, hairColor, topColor, hair, top, hat, neck, bag })
(function () {
  const INK = "#3a2e2a";
  let uid = 0;

  // 색을 조금 어둡게 (그림자·테두리용)
  function shade(hex, amount = -0.18) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.max(0, Math.min(255, Math.round(c + c * amount)));
    const r = f(n >> 16);
    const g = f((n >> 8) & 255);
    const b = f(n & 255);
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
  }

  // ---------- 머리카락: 얼굴 뒤(back)와 앞머리(front) ----------
  const HAIR = {
    "hair-short": {
      front: (c) =>
        `<path fill="${c}" d="M25 58 C22 30 40 18 60 18 C82 18 98 31 95 58 C90 46 82 40 72 37 C66 44 56 47 46 42 C39 47 31 51 25 58Z"/>`,
    },
    "hair-bob": {
      back: (c) =>
        `<path fill="${c}" d="M22 58 C20 28 40 17 60 17 C80 17 100 28 98 58 L99 82 Q99 88 93 88 L85 88 L85 60 L35 60 L35 88 L27 88 Q21 88 21 82Z"/>`,
      front: (c) =>
        `<path fill="${c}" d="M25 56 C25 29 43 18 60 18 C77 18 95 29 95 56 C88 45 76 41 60 41 C44 41 32 45 25 56Z"/>`,
    },
    "hair-long": {
      back: (c) =>
        `<path fill="${c}" d="M21 58 C19 26 41 16 60 16 C79 16 101 26 99 58 L101 110 Q101 116 95 116 L84 116 L84 70 L36 70 L36 116 L25 116 Q19 116 19 110Z"/>`,
      front: (c) =>
        `<path fill="${c}" d="M25 58 C23 28 43 17 62 18 C84 19 97 33 95 58 C91 44 79 34 65 32 C55 41 41 47 25 58Z"/>`,
    },
    "hair-bun": {
      back: (c) => `<circle fill="${c}" cx="60" cy="16" r="13"/><circle fill="${shade(c, -0.1)}" cx="60" cy="16" r="6"/>`,
      front: (c) =>
        `<path fill="${c}" d="M25 56 C25 29 43 20 60 20 C77 20 95 29 95 56 C88 45 76 41 60 41 C44 41 32 45 25 56Z"/>`,
    },
    "hair-spiky": {
      front: (c) =>
        `<path fill="${c}" d="M25 57 L27 33 L36 39 L40 19 L50 31 L60 12 L70 31 L80 19 L84 39 L93 33 L95 57 C87 46 75 42 60 42 C45 42 33 46 25 57Z"/>`,
    },
    "hair-curly": {
      back: (c) =>
        `<g fill="${c}"><circle cx="24" cy="66" r="9"/><circle cx="96" cy="66" r="9"/><circle cx="25" cy="80" r="8"/><circle cx="95" cy="80" r="8"/></g>`,
      front: (c) =>
        `<g fill="${c}"><circle cx="29" cy="50" r="10"/><circle cx="36" cy="35" r="11"/><circle cx="49" cy="26" r="12"/><circle cx="63" cy="24" r="12"/><circle cx="77" cy="29" r="11"/><circle cx="87" cy="40" r="10"/><circle cx="92" cy="53" r="8"/><circle cx="27" cy="58" r="6"/><circle cx="46" cy="40" r="7"/><circle cx="60" cy="38" r="7"/><circle cx="74" cy="40" r="7"/></g>`,
    },
    "hair-pigtails": {
      back: (c) =>
        `<g fill="${c}"><ellipse cx="17" cy="72" rx="10" ry="14"/><ellipse cx="103" cy="72" rx="10" ry="14"/></g><g fill="#ff8fb1"><circle cx="23" cy="60" r="4"/><circle cx="97" cy="60" r="4"/></g>`,
      front: (c) =>
        `<path fill="${c}" d="M25 56 C25 29 43 18 60 18 C77 18 95 29 95 56 C88 45 76 41 60 41 C44 41 32 45 25 56Z"/><path stroke="${shade(c, -0.25)}" stroke-width="1.5" fill="none" d="M60 19 L60 30"/>`,
    },
  };

  // ---------- 옷 ----------
  // 몸통 기본 모양 (어깨가 둥근 짧은 몸)
  const TORSO = "M42 104 Q42 91 60 91 Q78 91 78 104 L80 124 Q80 129 75 129 L45 129 Q40 129 40 124Z";

  function arms(color, skin) {
    return `<g class="arm-l"><ellipse cx="38" cy="107" rx="6" ry="11" transform="rotate(18 38 107)" fill="${color}"/><circle cx="34.5" cy="117" r="5" fill="${skin}"/></g><g class="arm-r"><ellipse cx="82" cy="107" rx="6" ry="11" transform="rotate(-18 82 107)" fill="${color}"/><circle cx="85.5" cy="117" r="5" fill="${skin}"/></g>`;
  }

  function legs(color) {
    return `<g class="legs"><rect class="leg-l" x="47" y="120" width="11" height="19" rx="5" fill="${color}"/><rect class="leg-r" x="62" y="120" width="11" height="19" rx="5" fill="${color}"/><ellipse cx="52" cy="140" rx="7.5" ry="4" fill="#5a463e"/><ellipse cx="68" cy="140" rx="7.5" ry="4" fill="#5a463e"/></g>`;
  }

  const TOP = {
    "top-tee": (c, skin) =>
      legs("#6d6a86") +
      arms(c, skin) +
      `<path fill="${c}" d="${TORSO}"/><path d="M53 92 Q60 99 67 92" stroke="${shade(c)}" stroke-width="2" fill="none"/>`,
    "top-stripe": (c, skin, id) =>
      legs("#6d6a86") +
      arms(c, skin) +
      `<clipPath id="t${id}"><path d="${TORSO}"/></clipPath><path fill="${c}" d="${TORSO}"/><g clip-path="url(#t${id})" stroke="#fffaf2" stroke-width="3.2"><path d="M38 101 H82"/><path d="M38 109 H82"/><path d="M38 117 H82"/><path d="M38 125 H82"/></g><path d="M53 92 Q60 99 67 92" stroke="${shade(c)}" stroke-width="2" fill="none"/>`,
    "top-hoodie": (c, skin) =>
      legs("#6d6a86") +
      arms(c, skin) +
      `<path fill="${c}" d="${TORSO}"/><path fill="${shade(c, -0.12)}" d="M44 94 Q60 84 76 94 Q70 101 60 101 Q50 101 44 94Z"/><path d="M56 100 L55 110 M64 100 L65 110" stroke="#fffaf2" stroke-width="1.6" stroke-linecap="round"/><rect x="50" y="114" width="20" height="9" rx="4" fill="${shade(c, -0.1)}"/>`,
    "top-overalls": (c, skin) =>
      legs(c) +
      arms("#fdfaf5", skin) +
      `<path fill="#fdfaf5" d="${TORSO}"/><path fill="${c}" d="M47 106 H73 V129 H47Z"/><path d="M47 107 L45 93 M73 107 L75 93" stroke="${c}" stroke-width="4" stroke-linecap="round"/><circle cx="50" cy="109" r="1.8" fill="#f6d365"/><circle cx="70" cy="109" r="1.8" fill="#f6d365"/><rect x="55" y="113" width="10" height="7" rx="2" fill="${shade(c, -0.1)}"/>`,
    "top-dress": (c, skin) =>
      legs(skin) +
      arms(c, skin) +
      `<path fill="${c}" d="M44 98 Q44 91 60 91 Q76 91 76 98 L86 131 Q60 138 34 131Z"/><path d="M42 110 Q60 114 78 110" stroke="${shade(c)}" stroke-width="2" fill="none"/><circle cx="60" cy="97" r="2" fill="#fffaf2"/>`,
    "top-raincoat": (c, skin) =>
      legs("#6d6a86") +
      arms(c, skin) +
      `<path fill="${c}" d="M41 103 Q41 91 60 91 Q79 91 79 103 L83 131 Q60 135 37 131Z"/><path d="M60 93 V131" stroke="${shade(c)}" stroke-width="1.6"/><g fill="${shade(c, -0.3)}"><circle cx="64" cy="104" r="1.8"/><circle cx="64" cy="114" r="1.8"/><circle cx="64" cy="124" r="1.8"/></g>`,
    "top-cape": (c, skin) =>
      `<path fill="#c9485b" d="M40 96 Q60 88 80 96 L92 138 Q60 146 28 138Z"/>` +
      legs("#4f5d7e") +
      arms(c, skin) +
      `<path fill="${c}" d="${TORSO}"/><path fill="#f5c542" d="M54 93 L60 99 L66 93 L60 96Z"/>`,
  };

  // 우비는 모자(후드)가 머리 뒤로 보여요
  const HOOD_BACK = {
    "top-raincoat": (c) => `<ellipse cx="60" cy="54" rx="39" ry="36" fill="${c}"/>`,
    "top-hoodie": (c) => `<ellipse cx="60" cy="88" rx="20" ry="7" fill="${shade(c, -0.12)}"/>`,
  };

  // ---------- 모자 ----------
  const HAT = {
    "hat-cap": `<path fill="#6aa7e0" d="M27 44 C27 14 93 14 93 44Z"/><path fill="#4f8ccc" d="M56 40 Q86 36 104 46 Q100 50 90 49 L56 46Z"/><circle cx="60" cy="18" r="3" fill="#4f8ccc"/>`,
    "hat-ribbon": `<g transform="translate(82 24) rotate(15)"><path fill="#ff8fb1" d="M0 0 L-14 -9 Q-17 0 -14 9Z"/><path fill="#ff8fb1" d="M0 0 L14 -9 Q17 0 14 9Z"/><circle r="4.5" fill="#f2668f"/></g>`,
    "hat-straw": `<ellipse cx="60" cy="36" rx="50" ry="10" fill="#f0cf86"/><path fill="#f3d892" d="M37 36 C37 9 83 9 83 36Z"/><path fill="#8f7fd6" d="M37.5 30 H82.5 V36 H37.5Z"/><path d="M28 34 Q60 42 92 34" stroke="#d9b465" stroke-width="1.4" fill="none"/>`,
    "hat-flower": `<g transform="translate(83 27)"><g fill="#fffaf2"><circle cx="0" cy="-7" r="5.5"/><circle cx="6.7" cy="-2.2" r="5.5"/><circle cx="4.1" cy="5.7" r="5.5"/><circle cx="-4.1" cy="5.7" r="5.5"/><circle cx="-6.7" cy="-2.2" r="5.5"/></g><circle r="4.2" fill="#ffcc4d"/></g>`,
    "hat-grad": `<rect x="40" y="22" width="40" height="13" rx="3" fill="#34323d"/><path fill="#45424f" d="M60 9 L101 21 L60 33 L19 21Z"/><path d="M60 21 L92 27 L92 40" stroke="#f5c542" stroke-width="1.8" fill="none"/><circle cx="92" cy="41" r="2.6" fill="#f5c542"/>`,
    "hat-top": `<ellipse cx="60" cy="33" rx="32" ry="6" fill="#34323d"/><rect x="41" y="3" width="38" height="31" rx="4" fill="#3d3a47"/><rect x="41" y="24" width="38" height="6" fill="#c9485b"/>`,
    "hat-crown": `<path fill="#f5c542" stroke="#d9a62b" stroke-width="1.4" d="M37 32 L36 12 L48 22 L60 6 L72 22 L84 12 L83 32Z"/><circle cx="60" cy="24" r="3" fill="#e5566e"/><circle cx="46" cy="27" r="2" fill="#6aa7e0"/><circle cx="74" cy="27" r="2" fill="#6fbf9a"/>`,
  };

  // ---------- 목 ----------
  const NECK = {
    "neck-scarf": `<path fill="#e8685a" d="M41 90 Q60 99 79 90 L80 98 Q60 108 40 98Z"/><path fill="#d4554a" d="M66 99 L74 99 L76 117 L68 118Z"/><path d="M68 118 L69 121 M71 118 L72 121 M74 117 L75 120" stroke="#d4554a" stroke-width="1.4"/>`,
    "neck-tie": `<path fill="#4a6fa5" d="M56 92 H64 L62 98 H58Z"/><path fill="#4a6fa5" d="M58 98 H62 L65 118 L60 123 L55 118Z"/><path d="M57 106 L63 103 M56 112 L64 109" stroke="#6f93c7" stroke-width="1.4"/>`,
    "neck-medal": `<path d="M50 91 L60 108 L70 91" stroke="#5a8fd8" stroke-width="4" fill="none" stroke-linejoin="round"/><circle cx="60" cy="112" r="6.5" fill="#f5c542" stroke="#d9a62b" stroke-width="1.4"/><path d="M60 108.5 L61.2 111 L64 111.3 L62 113.2 L62.5 116 L60 114.6 L57.5 116 L58 113.2 L56 111.3 L58.8 111Z" fill="#fff3c4"/>`,
    "neck-gem": `<path d="M45 92 Q60 104 75 92" stroke="#fffaf2" stroke-width="1.6" fill="none"/><path fill="#7fd3f0" stroke="#4fb3d9" stroke-width="1" d="M60 97 L65 102 L60 109 L55 102Z"/>`,
  };

  // ---------- 가방·손에 든 것 (back: 몸 뒤, front: 몸 앞) ----------
  const BAG = {
    "bag-balloon": {
      front: `<path d="M86 118 Q94 92 101 63" stroke="#8a8079" stroke-width="1.2" fill="none"/><ellipse cx="102" cy="50" rx="12" ry="14" fill="#ff6b81"/><path d="M99 63 L105 63 L102 59Z" fill="#ff6b81"/><ellipse cx="98" cy="45" rx="3" ry="4.5" fill="#ffb3be"/>`,
    },
    "bag-backpack": {
      back: `<rect x="29" y="94" width="18" height="30" rx="7" fill="#ff8a5c"/><rect x="73" y="94" width="18" height="30" rx="7" fill="#ff8a5c"/>`,
      front: `<path d="M47 93 Q46 108 47 122 M73 93 Q74 108 73 122" stroke="#e76f42" stroke-width="3.2" fill="none" stroke-linecap="round"/>`,
    },
    "bag-basket": {
      front: `<path d="M83 113 Q93 100 103 113" stroke="#b9823f" stroke-width="2.4" fill="none"/><path fill="#d8a15f" d="M80 113 H106 L102 131 Q93 134 84 131Z"/><path d="M82 119 H104 M83 125 H103" stroke="#b9823f" stroke-width="1.3"/><circle cx="88" cy="111" r="3.5" fill="#e5566e"/><circle cx="96" cy="110" r="3" fill="#f6d365"/>`,
    },
    "bag-handbag": {
      front: `<path d="M86 116 Q93 104 100 116" stroke="#9c5a80" stroke-width="2.4" fill="none"/><rect x="82" y="115" width="22" height="16" rx="5" fill="#c27ba0"/><circle cx="93" cy="121" r="2" fill="#f5c542"/>`,
    },
    "bag-umbrella": {
      front: `<path d="M98 43 L87 117" stroke="#8a6b55" stroke-width="2.2" stroke-linecap="round"/><path fill="#7fcfa8" d="M74 44 Q98 14 120 44 Q114 40 108 44 Q102 39 97 44 Q91 39 86 44 Q80 40 74 44Z"/><path d="M87 117 Q84 122 80 119" stroke="#8a6b55" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
    },
  };

  function face(skin) {
    return (
      `<circle cx="27" cy="61" r="6" fill="${skin}"/><circle cx="93" cy="61" r="6" fill="${skin}"/>` +
      `<ellipse cx="60" cy="56" rx="34" ry="31" fill="${skin}"/>` +
      `<g class="eyes"><ellipse cx="48" cy="62" rx="3.4" ry="4.4" fill="${INK}"/><ellipse cx="72" cy="62" rx="3.4" ry="4.4" fill="${INK}"/>` +
      `<circle cx="49.3" cy="60.4" r="1.3" fill="#fff"/><circle cx="73.3" cy="60.4" r="1.3" fill="#fff"/></g>` +
      `<ellipse cx="40" cy="70" rx="5" ry="3" fill="#ff9e9e" opacity="0.45"/><ellipse cx="80" cy="70" rx="5" ry="3" fill="#ff9e9e" opacity="0.45"/>` +
      `<path d="M56 71 Q60 75.5 64 71" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`
    );
  }

  // 뒤에서 본 머리: 얼굴 대신 머리카락이 머리를 덮어요 (거리 걷기 시점용)
  function backHead(o) {
    const c = o.hairColor;
    const cover =
      o.hair === "hair-spiky"
        ? `<path fill="${c}" d="M26 64 L27 33 L36 39 L40 19 L50 31 L60 12 L70 31 L80 19 L84 39 L93 33 L94 64 Q60 76 26 64Z"/>`
        : o.hair === "hair-curly"
          ? `<g fill="${c}"><ellipse cx="60" cy="52" rx="36" ry="30"/><circle cx="30" cy="62" r="9"/><circle cx="90" cy="62" r="9"/><circle cx="45" cy="70" r="8"/><circle cx="60" cy="72" r="8"/><circle cx="75" cy="70" r="8"/></g>`
          : `<ellipse cx="60" cy="52" rx="35" ry="30" fill="${c}"/>` +
            (o.hair === "hair-long" ? `<path fill="${c}" d="M26 58 H94 Q98 84 92 104 Q88 112 76 108 Q60 114 44 108 Q32 112 28 104 Q22 84 26 58Z"/>` : "") +
            (o.hair === "hair-bob" ? `<path fill="${c}" d="M25 58 H95 L96 82 Q96 88 90 88 H30 Q24 88 24 82Z"/>` : "") +
            `<path d="M60 26 Q58 46 60 62" stroke="${shade(c, -0.2)}" stroke-width="1.6" fill="none"/>`;
    return (
      `<circle cx="27" cy="61" r="6" fill="${o.skin}"/><circle cx="93" cy="61" r="6" fill="${o.skin}"/>` +
      `<ellipse cx="60" cy="56" rx="34" ry="31" fill="${o.skin}"/>` +
      cover
    );
  }

  function svg(o, opts = {}) {
    const id = ++uid;
    const hair = HAIR[o.hair] || HAIR["hair-short"];
    const top = TOP[o.top] || TOP["top-tee"];
    const bag = BAG[o.bag] || {};
    if (opts.back) {
      // 뒷모습: 가방은 등 위에, 얼굴 대신 뒷머리
      const backpack = o.bag === "bag-backpack" ? `<rect x="43" y="95" width="34" height="31" rx="9" fill="#ff8a5c"/><rect x="49" y="108" width="22" height="12" rx="4" fill="#e76f42"/>` : "";
      const parts = [
        HOOD_BACK[o.top] && o.top === "top-hoodie" ? HOOD_BACK[o.top](o.topColor) : "",
        top(o.topColor, o.skin, id),
        backpack,
        o.bag !== "bag-backpack" ? bag.front || "" : "",
        backHead(o),
        hair.back ? hair.back(o.hairColor) : "",
        o.top === "top-raincoat" ? `<path fill="${o.topColor}" d="M22 60 C20 26 100 26 98 60 Q60 80 22 60Z"/>` : "",
        HAT[o.hat] || "",
      ];
      return `<svg class="avatar-svg" viewBox="0 0 120 146" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${parts.join("")}</svg>`;
    }
    const parts = [
      bag.back || "",
      HOOD_BACK[o.top] ? HOOD_BACK[o.top](o.topColor) : "",
      hair.back ? hair.back(o.hairColor) : "",
      top(o.topColor, o.skin, id),
      NECK[o.neck] || "",
      face(o.skin),
      hair.front(o.hairColor),
      HAT[o.hat] || "",
      bag.front || "",
    ];
    return `<svg class="avatar-svg" viewBox="0 0 120 146" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${parts.join("")}</svg>`;
  }

  window.Avatar = { svg, shade };
})();
