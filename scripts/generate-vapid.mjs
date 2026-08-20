import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  publicKeyEncoding: { format: "jwk" },
  privateKeyEncoding: { format: "jwk" },
});

const decode = (value) => Buffer.from(value, "base64url");
const applicationServerKey = Buffer.concat([
  Buffer.from([4]), decode(publicKey.x), decode(publicKey.y),
]).toString("base64url");

console.log("VAPID_PUBLIC_KEY=" + applicationServerKey);
console.log("VAPID_PRIVATE_KEY=" + privateKey.d);
console.log("\n두 값을 Cloudflare Worker Secrets에 각각 등록하세요.");
