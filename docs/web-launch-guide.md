# 웹사이트로 운영하기: 전부 무료

스토어 없이 `https://pomotrip.onrender.com` 주소 하나로 운영하는 방법이에요.
예전 주소(walkmodoro.onrender.com)에서 옮기는 방법은 [move-to-pomotrip.md](move-to-pomotrip.md)에 있어요.
코드로 할 수 있는 건 이미 넣어 두었고, 아래 🙋 표시는 본인만 할 수 있는 일이에요.
모든 값은 **Render → pomotrip → Environment**에만 넣고 채팅이나 코드에는 쓰지 마세요.

| 순서 | 할 일 | 왜 | 걸리는 시간 |
| --- | --- | --- | --- |
| 1 | 🙋 Neon 데이터베이스 연결 | 이게 없으면 서버가 다시 켜질 때마다 로그인과 기록이 사라져요 | 10분 |
| 2 | 🙋 UptimeRobot 등록 | 무료 서버가 15분 동안 아무도 안 오면 잠들어서 첫 화면이 50초쯤 걸려요 | 5분 |
| 3 | 🙋 검색엔진 등록 (구글, 네이버) | 검색에 'Pomotrip'이 나오게 | 15분 |
| 4 | 🙋 GoatCounter 방문 통계 (선택) | 하루에 몇 명이 오는지 보기 | 5분 |
| 5 | 오류 확인 | Render → Logs에서 `client error` 검색 | 수시로 |

---

## 1. 데이터베이스 (Neon) 🙋

1. https://neon.tech 에 가입하고 프로젝트를 만들어요. (지역: 싱가포르가 Render와 가까워요)
2. **Connection string**을 복사해요. `postgresql://...` 로 시작해요.
3. Render Environment에 `DATABASE_URL` = 복사한 값 → 저장하면 자동으로 다시 배포돼요.
4. `https://pomotrip.onrender.com/health` 를 열어서 `"db":"persistent"` 가 보이면 성공이에요.

**백업**: Neon 무료 플랜도 짧은 기간 안의 예전 상태로 되돌리는 기능(Restore)이 있어요.
사용자가 많아지면 그때 정기 백업을 따로 붙이면 돼요.

## 2. 서버 안 잠들게 하기 (UptimeRobot) 🙋

1. https://uptimerobot.com 에 무료 가입해요.
2. **New monitor** → 종류 `HTTP(s)` → 주소 `https://pomotrip.onrender.com/health` → 간격 `5 minutes`.
3. 끝이에요. 5분마다 서버를 깨워 두고, 서버가 멈추면 이메일로 알려 줘요.

Render 무료 플랜은 한 달에 750시간까지 켜 둘 수 있어서, 서버 하나는 한 달 내내 켜 둬도 무료예요.

## 3. 검색엔진 등록 🙋

**구글 서치 콘솔** (https://search.google.com/search-console)
1. 속성 추가 → **URL 접두어** → `https://pomotrip.onrender.com/`
2. 확인 방법에서 **HTML 태그**를 골라요. `content="..."` 안의 값만 복사해요.
3. Render Environment에 `GOOGLE_SITE_VERIFICATION` = 그 값 → 배포가 끝나면 **확인** 버튼.
4. 왼쪽 **Sitemaps**에 `sitemap.xml` 을 넣고 제출해요.

**네이버 서치어드바이저** (https://searchadvisor.naver.com)
1. 웹마스터 도구 → 사이트 등록 → 주소 입력 → **HTML 태그** 방식.
2. Render Environment에 `NAVER_SITE_VERIFICATION` = content 값 → 확인.
3. 요청 → 사이트맵 제출 → `https://pomotrip.onrender.com/sitemap.xml`

나중에 내 도메인을 사면 `SITE_URL` 에 새 주소를 넣으면 돼요.

## 4. 방문 통계 (GoatCounter, 선택) 🙋

1. https://www.goatcounter.com 에 가입하면서 코드를 정해요. 예: `pomotrip` → `pomotrip.goatcounter.com`
2. Render Environment에 `GOATCOUNTER_CODE` = `pomotrip` (코드만, 주소 전체 아님)
3. 쿠키를 안 쓰는 통계라서 동의 팝업이 필요 없어요. 개인정보처리방침에도 자동으로 한 줄이 추가돼요.

## 5. 오류 확인

휴대폰 화면에서 오류가 나면 서버 기록에 `client error: ...` 로 남아요.
Render → pomotrip → **Logs** 에서 `client error` 로 검색해 보고, 이상한 게 보이면 복사해서 알려 주세요.

---

## 이미 들어간 것 (코드)

- 링크 미리보기 카드: 카카오톡 등에 주소를 보내면 그림과 설명이 떠요 (`app/static/store/feature-graphic.png`)
- 검색엔진용 설명, `robots.txt`, `sitemap.xml`
- `/health` 가 UptimeRobot의 HEAD 요청도 받아요
- 화면 오류 자동 기록 (`/api/client-error`, 1분 30개 제한, 개인 정보 없음)
