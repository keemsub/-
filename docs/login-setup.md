# 로그인과 데이터베이스 설정하기

아래에서 `내주소`는 Render가 준 주소예요. 예: `https://walkmodoro-abcd.onrender.com`
키와 비밀값은 **채팅이나 코드에 붙여 넣지 말고**, Render 화면에만 넣어 주세요.

Render에 값 넣는 곳: Render 대시보드 → walkmodoro 서비스 → 왼쪽 **Environment** → 해당 이름 옆 값 입력 → **Save Changes** (자동으로 다시 배포돼요)

## 1. 데이터베이스 (Neon, 무료)

1. [neon.tech](https://neon.tech)에 가입하고 프로젝트를 만들어요. 지역은 **Asia Pacific (Singapore)** 를 고르면 Render와 가까워 빨라요.
2. 대시보드의 **Connect** 버튼 → 나오는 주소(`postgresql://...`로 시작)를 복사해요.
3. Render Environment의 `DATABASE_URL`에 붙여 넣어요.

표(테이블)는 앱이 처음 켜질 때 자동으로 만들어요.

## 2. 카카오 로그인

1. [Kakao Developers](https://developers.kakao.com) → 로그인 → **내 애플리케이션 → 애플리케이션 추가하기** (앱 이름: Pomotrip)
2. **앱 설정 → 플랫폼 → Web 플랫폼 등록**: 사이트 도메인에 `내주소` 입력
3. **제품 설정 → 카카오 로그인**: 활성화 **ON**, Redirect URI에 `내주소/auth/kakao/callback` 등록
4. **제품 설정 → 카카오 로그인 → 동의항목**: **닉네임**을 '필수 동의'로
5. **앱 설정 → 앱 키**의 **REST API 키**를 Render `KAKAO_CLIENT_ID`에 넣어요.
6. (권장) **제품 설정 → 카카오 로그인 → 보안**에서 Client Secret 코드를 만들고 **활성화**한 뒤, 그 값을 `KAKAO_CLIENT_SECRET`에 넣어요.

## 3. 구글 로그인

1. [Google Cloud Console](https://console.cloud.google.com) → 새 프로젝트 (이름: walkmodoro)
2. **API 및 서비스 → OAuth 동의 화면**: 외부(External), 앱 이름·지원 이메일 입력 후 저장
3. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 애플리케이션 유형: **웹 애플리케이션**
   - 승인된 리디렉션 URI: `내주소/auth/google/callback`
4. 만들어진 **클라이언트 ID**와 **클라이언트 보안 비밀번호**를 각각 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`에 넣어요.
5. 처음에는 '테스트' 상태라 등록한 테스트 사용자만 로그인돼요. 모두에게 열려면 OAuth 동의 화면에서 **앱 게시**를 눌러요.

## 확인

`내주소`를 열고 ⚙️ 설정을 누르면 넣은 로그인 버튼만 보여요. 로그인하면 "○○님, 오늘도 같이 걸어요"가 뜨고, 다른 기기에서 로그인해도 여정이 이어져요.

## 내 컴퓨터에서 해 볼 때

`.env`에 같은 이름으로 넣고, 카카오·구글 Redirect URI에 `http://localhost:8000/auth/kakao/callback`, `http://localhost:8000/auth/google/callback`도 추가로 등록하세요. `DATABASE_URL`을 비우면 `walkmodoro.db` 파일에 저장돼요.
