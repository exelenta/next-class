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
  try {
    const response = await fetch(`/api/auth/${authMode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId: authDeviceId,
        username: authQuery("#authUsername").value.trim(),
        password: authQuery("#authPassword").value,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "요청을 완료하지 못했습니다.");
    location.reload();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
});
authQuery("#logoutButton").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  location.reload();
});

refreshAccount().catch(() => {});
