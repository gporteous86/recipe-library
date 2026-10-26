/* Cloudflare API boundary. Session values never enter URLs or logs. */
class RecipeAPI {
  constructor(base, storage = globalThis.sessionStorage, transport = globalThis.fetch.bind(globalThis)) {
    this.base = base.replace(/\/$/, ''); this.storage = storage; this.transport = transport;
    this.images = new Map(); this.householdId = null; this.token = storage.getItem('recipe-cloudflare-session') || null;
  }
  hasSession() { return !!this.token; }
  clear() { this.token = null; this.householdId = null; this.storage.removeItem('recipe-cloudflare-session'); }
  async login(path, email, password) {
    const result = await this.request(path, {method: 'POST', body: {email, password}});
    if (!result.token || !result.user) throw new Error('Unexpected sign-in response.');
    this.token = result.token; this.storage.setItem('recipe-cloudflare-session', this.token);
    return result.user;
  }
  async request(path, {method = 'GET', body} = {}) {
    const headers = {'Accept': 'application/json'};
    if (this.token) headers.Authorization = 'Bearer ' + this.token;
    if (this.householdId) headers['X-Household-Id'] = this.householdId;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try { response = await this.transport(this.base + path, {method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', credentials: 'omit'}); }
    catch { throw new Error('Could not connect to your library. Check your connection and try again.'); }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401 && !path.startsWith('/auth/login')) this.clear();
      const error = new Error(data?.error || 'Library request failed (' + response.status + ').');
      error.status = response.status; throw error;
    }
    if (!data) throw new Error('The library returned an unexpected response.');
    return data;
  }
  async photo(path) {
    if (/^https:\/\//i.test(path)) return path;
    if (this.images.has(path)) return this.images.get(path);
    const response = await this.transport(this.imageUrl(path), {headers:{Authorization:'Bearer '+this.token,'X-Household-Id':this.householdId},credentials:'omit',cache:'no-store'});
    if (!response.ok) throw new Error('Photo could not be loaded');
    const url = URL.createObjectURL(await response.blob()); this.images.set(path,url); return url;
  }
  imageUrl(path) {
    // Legacy URLs must be migrated before cutover; never treat arbitrary schemes as images.
    if (/^https:\/\//i.test(path)) return path;
    return this.base + '/images/' + path.split('/').map(encodeURIComponent).join('/');
  }
}
if (typeof module !== 'undefined') module.exports = RecipeAPI;
