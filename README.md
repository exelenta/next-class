# 다음 수업

iPhone 홈 화면에 설치해 사용하는 학교 시간표 PWA입니다. Cloudflare Worker 하나가 정적 앱, API, D1, 예약 Web Push를 담당합니다.

## 배포

1. `npm install`
2. `npx wrangler login`
3. `npx wrangler d1 create next-class-db`
4. 출력된 `database_id`를 `wrangler.jsonc`에 입력
5. `npm run keys:generate`로 VAPID 공개·비공개 키 생성
6. `npx wrangler secret put VAPID_PUBLIC_KEY`
7. `npx wrangler secret put VAPID_PRIVATE_KEY`
8. `wrangler.jsonc`의 `VAPID_SUBJECT`를 본인 이메일(`mailto:...`)로 변경
9. `npm run db:remote`
10. `npm run deploy`

로컬 개발은 `npm run db:local` 후 `npm run dev`로 실행합니다. 로컬 푸시 테스트용 키는 커밋하지 않는 `.dev.vars`에 넣으세요.

## GitHub 자동 배포

코드를 GitHub 저장소에 push한 다음 Cloudflare 대시보드의 **Workers & Pages → Create → Import a repository**에서 저장소를 연결합니다.

- Deploy command: `npx wrangler deploy`
- Non-production branch deploy command: `npx wrangler versions upload`
- Root directory: `/`

D1 바인딩은 `wrangler.jsonc`에 기록되며, VAPID 키는 GitHub에 넣지 말고 Cloudflare 프로젝트의 **Settings → Variables and Secrets**에서 Secret으로 등록합니다.

## iPhone 설치

배포 주소를 Safari로 열고 공유 버튼 → **홈 화면에 추가**를 선택합니다. 홈 화면에서 앱을 다시 연 뒤 **알림 켜기**를 누릅니다. iOS 16.4 이상이 필요합니다.
