// Only PUBLIC configuration. Never put DEEPSEEK_API_KEY or TURNSTILE_SECRET here.
// Reuse the existing Cloudflare Worker used by starport-persona.
// An operator may replace endpoint with an HTTPS custom-domain origin (no path/query/hash).
window.JIUZHOU_AI_GATEWAY = Object.freeze({
  endpoint: "https://starport-deepseek-gateway.zjj1280637679.workers.dev",
  turnstileSiteKey: "0x4AAAAAAFVa3XMIy4rCu3Gq"
});
