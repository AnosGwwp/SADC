// Discord sign-in (OAuth2, "identify" scope only: the id, name and avatar, nothing else).
// https://discord.com/developers/docs/topics/oauth2

const API = 'https://discord.com/api/v10';

export function authorizeUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri, scope: 'identify', state, prompt: 'none' });
  return `https://discord.com/oauth2/authorize?${params}`;
}

// Swaps the code Discord sent back for the person's account. Throws if Discord refuses or doesn't answer.
export async function fetchUser({ clientId, clientSecret, redirectUri, code }) {
  const tokenRes = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenRes.ok) throw new Error(`Discord token exchange answered ${tokenRes.status}: ${await tokenRes.text()}`);
  const { access_token: accessToken } = await tokenRes.json();

  const userRes = await fetch(`${API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!userRes.ok) throw new Error(`Discord /users/@me answered ${userRes.status}`);
  const user = await userRes.json();
  return {
    id: user.id,
    username: user.username,
    name: user.global_name || user.username,
    avatar: avatarUrl(user),
  };
}

function avatarUrl(user) {
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
  // Accounts without a picture get one of Discord's 6 default ones, picked from their id.
  return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id) >> 22n) % 6n)}.png`;
}
