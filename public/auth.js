const authDeviceId = localStorage.deviceId || (localStorage.deviceId = crypto.randomUUID());
const authQuery = (selector) => document.querySelector(selector);
let authMode = "login";

function showAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";
  authQuery("#authTitle").textContent = signup ? "회원가입" : "로그인";
  authQuery("#authDescription").textContent = signup
    ? "현재 기기의 시간표를 새 계정에 연결합니다."
    : "계정의 시간표를 이 기기로 불러옵니다.";
  authQuery("#authSubmitButton").textContent = signup ? "회원가입" : "로그인";
  authQuery("#authSwitchButton").textContent = signup
    ? "이미 계정이 있나요? 로그인"
    : "처음이신가요? 회원가입";
  authQuery("#authPassword").autocomplete = signup ? "new-password" : "current-password";
  authQuery("#authPasswordConfirmField").hidden = !signup;
  authQuery("#authPasswordConfirm").required = signup;
  authQuery("#authError").hidden = true;
}

function authError(message) {
  const element = authQuery("#authError");
  element.textContent = message;
  element.hidden = false;
}

function validatedCredentials() {
  const username = authQuery("#authUsername").value.trim();
  const password = authQuery("#authPassword").value;
  if (!/^[A-Za-z0-9_]{4,20}$/.test(username)) {
    throw new Error("아이디는 영문, 숫자, 밑줄만 사용해 4~20자로 입력해 주세요.");
  }
  if (password.length < 8 || password.length > 128) {
    throw new Error("비밀번호는 8~128자로 입력해 주세요.");
  }
  if (authMode === "signup" && password !== authQuery("#authPasswordConfirm").value) {
    throw new Error("비밀번호 확인이 일치하지 않습니다.");
  }
  return { username, password };
}

async function authRequest(credentials, timetableChoice) {
  const response = await fetch(`/api/auth/${authMode}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceId: authDeviceId, ...credentials, timetableChoice }),
  });
  const result = await response.json().catch(() => ({}));
  return { response, result };
}

async function refreshAccount() {
  const response = await fetch("/api/auth/me");
  const { user } = response.ok ? await response.json() : { user: null };
  authQuery("#signedOutView").hidden = Boolean(user);
  authQuery("#signedInView").hidden = !user;
  if (user) authQuery("#accountName").textContent = user.username;
}

authQuery("#openAuthButton").addEventListener("click", () => {
  showAuthMode("login");
  authQuery("#authForm").reset();
  authQuery("#authDialog").showModal();
});
authQuery("#closeAuthButton").addEventListener("click", () => authQuery("#authDialog").close());
authQuery("#authSwitchButton").addEventListener("click", () => showAuthMode(authMode === "login" ? "signup" : "login"));
authQuery("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = authQuery("#authSubmitButton");
  button.disabled = true;
  authQuery("#authError").hidden = true;
  try {
    const credentials = validatedCredentials();
    let { response, result } = await authRequest(credentials);
    if (response.status === 409 && result.conflict) {
      const useAccount = confirm("현재 기기와 계정의 시간표가 다릅니다.\n\n확인: 계정 시간표 사용\n취소: 현재 기기 시간표를 계정에 저장");
      ({ response, result } = await authRequest(credentials, useAccount ? "account" : "device"));
    }
    if (!response.ok) throw new Error(result.error || "요청을 완료하지 못했습니다.");
    location.reload();
  } catch (error) {
    authError(error.message);
  } finally {
    button.disabled = false;
  }
});
authQuery("#logoutButton").addEventListener("click", async () => {
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceId: authDeviceId }),
  });
  location.reload();
});

refreshAccount().catch(() => {});
