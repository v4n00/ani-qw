export const CLIENT_ID = '51034';
export function authorizationURL() {
  return `https://anilist.co/api/v2/oauth/authorize?client_id=${CLIENT_ID}&response_type=token`;
}

// Only called in trusted extension settings; never extract tokens from page scripts.
export function pastedToken(value) {
  const token = String(value ?? '').trim();
  if (!token || token.length > 16384 || !/^[A-Za-z0-9._~+\/-]+=*$/.test(token)) {
    throw new Error('Paste only the access token shown by AniList, without the page URL.');
  }
  return token;
}
