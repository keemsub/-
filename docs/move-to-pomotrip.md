# 주소 이사: walkmodoro.onrender.com → pomotrip.onrender.com

Render의 `○○.onrender.com` 주소는 **서비스를 처음 만들 때 정해지고, 나중에 이름을 바꿔도 안 바뀌어요.**
그래서 `pomotrip`이라는 새 서비스를 만들고, 예전 서비스는 **안내판**으로 남겨 두는 방법이에요.
모두 무료예요. 비밀값은 Render 화면에서만 옮기고 채팅에는 붙여 넣지 마세요.

> 💡 `pomotrip` 이름을 다른 사람이 이미 쓰고 있으면 Render가 `pomotrip-ab12` 처럼 뒤에 글자를 붙여요.
> 그때는 아래의 `pomotrip.onrender.com` 을 실제로 받은 주소로 바꿔 읽어 주세요.
> 그리고 새 주소를 알려 주시면, 기록을 옮겨 주는 코드의 주소도 맞춰 드릴게요.

---

## 1. 새 서비스 만들기 (5분)

1. Render 대시보드 → **New → Web Service** → GitHub 저장소 `walkmodoro` 선택
2. **Name**: `pomotrip` / **Region**: Singapore / **Instance type**: **Free**
3. 언어(Runtime)는 **Docker** 가 자동으로 잡혀요. 그대로 두세요.
4. **Advanced → Health Check Path**: `/health`

## 2. 환경변수 옮기기 (5분)

1. 예전 서비스 `walkmodoro` → **Environment** 에서 값을 하나씩 복사해요.
2. 새 서비스 `pomotrip` → **Environment** 에 같은 이름으로 붙여 넣어요.
   - `SECRET_KEY` 는 새로 **Generate** 해도 돼요. (어차피 주소가 바뀌면 다시 로그인해야 해요)
   - `COOKIE_SECURE` = `true`
   - `DATABASE_URL` 은 **꼭 같은 값**으로. 그래야 로그인한 사람들의 기록이 그대로 이어져요.
   - `SITE_URL` 을 넣었다면 `https://pomotrip.onrender.com` 으로 바꿔요.
3. **Save** → 배포가 끝나면 `https://pomotrip.onrender.com/health` 에서 `"status":"ok"` 확인.

## 3. 로그인 주소 바꾸기 (5분)

새 주소를 **추가**하고, 예전 주소는 이사가 다 끝난 뒤에 지워요.

- **카카오** (developers.kakao.com → 내 애플리케이션 → 앱 설정 → 플랫폼, 카카오 로그인)
  - Web 사이트 도메인에 `https://pomotrip.onrender.com` 추가
  - Redirect URI에 `https://pomotrip.onrender.com/auth/kakao/callback` 추가
- **구글** (console.cloud.google.com → API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트)
  - 승인된 JavaScript 원본에 `https://pomotrip.onrender.com` 추가
  - 승인된 리디렉션 URI에 `https://pomotrip.onrender.com/auth/google/callback` 추가

## 4. 예전 주소를 안내판으로 바꾸기 (2분)

예전 서비스 `walkmodoro` → **Environment** 에 하나만 추가해요.

- `MOVED_TO` = `https://pomotrip.onrender.com`

이러면 예전 주소로 들어온 사람은 "이사했어요" 화면을 잠깐 보고 새 주소로 자동으로 넘어가요.
**로그인 없이 쓰던 사람의 기록(그 휴대폰에만 저장된 것)도 함께 옮겨 가요.**
예전 링크(예: `/privacy`)도 새 주소의 같은 페이지로 보내 줘요.

예전 서비스는 아무도 안 오면 잠들어서, 무료 사용 시간(한 달 750시간)을 거의 안 써요.

## 5. 나머지 서비스 주소 바꾸기 (10분)

- **UptimeRobot**: 모니터 주소를 `https://pomotrip.onrender.com/health` 로 수정
  (예전 주소 모니터는 지우세요. 계속 깨우면 무료 시간을 같이 써 버려요)
- **구글 서치 콘솔**: 새 속성 `https://pomotrip.onrender.com/` 추가 → HTML 태그로 확인
  → `GOOGLE_SITE_VERIFICATION` 값을 새 서비스 Environment에 넣기 → Sitemaps에 `sitemap.xml` 제출
- **네이버 서치어드바이저**: 새 주소로 사이트 등록 → `NAVER_SITE_VERIFICATION` → 사이트맵 제출
- **GoatCounter**(쓰는 경우): 설정 그대로 두면 돼요. 새 서비스에 `GOATCOUNTER_CODE` 만 옮겼는지 확인.

## 6. 휴대폰 홈 화면 앱

홈 화면에 추가해 둔 앱은 예전 주소를 가리켜요. 눌러도 새 주소로 넘어가긴 하지만,
새 주소에서 **다시 '홈 화면에 추가'** 하고 예전 아이콘은 지우는 게 깔끔해요.

## 7. 예전 서비스 지우기 (몇 주 뒤, 선택)

예전 주소로 들어오는 사람이 없어지면(몇 주 정도) `walkmodoro` 서비스 → **Settings → Delete Web Service**.
⚠️ 지우면 예전 주소는 아예 안 열려요. 예전 링크를 공유해 둔 곳이 있다면 안내판으로 남겨 두는 걸 추천해요.
카카오·구글의 예전 Redirect URI도 이때 지우면 돼요.
