// Autenticazione Google (Identity Services) e chiamate dirette alle REST API
// di Calendar e Sheets. Nessuna libreria esterna oltre a gsi/client:
// il token di accesso vive solo in memoria (mai su disco), come richiesto
// per un client-side puro senza backend.

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/spreadsheets"
].join(" ");

const GoogleApi = {
  _tokenClient: null,
  _accessToken: null,
  _tokenExpiry: 0,

  isReady() {
    return !!this._tokenClient;
  },

  isSignedIn() {
    return !!this._accessToken && Date.now() < this._tokenExpiry;
  },

  init(clientId, onTokenObtained, onError) {
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
      onError("La libreria di accesso Google non e ancora pronta. Ricarica la pagina fra qualche secondo.");
      return;
    }
    this._tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (resp) => {
        if (resp && resp.access_token) {
          this._accessToken = resp.access_token;
          // expires_in e in secondi; teniamo un margine di sicurezza di 60s.
          this._tokenExpiry = Date.now() + ((resp.expires_in || 3000) - 60) * 1000;
          onTokenObtained();
        } else {
          onError("Accesso non riuscito. Riprova.");
        }
      },
      error_callback: (err) => {
        onError("Accesso annullato o non riuscito: " + (err && err.type ? err.type : ""));
      }
    });
  },

  requestToken(interactive) {
    if (!this._tokenClient) return;
    this._tokenClient.requestAccessToken({ prompt: interactive ? "consent" : "" });
  },

  signOut() {
    if (this._accessToken && window.google && google.accounts && google.accounts.oauth2) {
      google.accounts.oauth2.revoke(this._accessToken, () => {});
    }
    this._accessToken = null;
    this._tokenExpiry = 0;
  },

  async _fetch(url, options) {
    if (!this.isSignedIn()) throw new Error("Non autenticato");
    const opts = options || {};
    opts.headers = Object.assign({}, opts.headers, {
      Authorization: "Bearer " + this._accessToken
    });
    const res = await fetch(url, opts);
    if (res.status === 401) {
      // Il token e scaduto (dura circa un'ora): serve un nuovo accesso.
      this._accessToken = null;
      this._tokenExpiry = 0;
      throw new Error("AUTH_EXPIRED: la sessione Google e scaduta, accedi di nuovo");
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error("Errore API (" + res.status + "): " + body.slice(0, 300));
    }
    if (res.status === 204) return null;
    return res.json();
  },

  // --- Calendar ---

  async listEventsForDay(calendarId, dateISO) {
    const timeMin = dateISO + "T00:00:00";
    const timeMax = dateISO + "T23:59:59";
    const params = new URLSearchParams({
      timeMin: new Date(timeMin).toISOString(),
      timeMax: new Date(timeMax).toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "50"
    });
    const url = "https://www.googleapis.com/calendar/v3/calendars/" +
      encodeURIComponent(calendarId || "primary") + "/events?" + params.toString();
    const data = await this._fetch(url);
    return (data.items || []).filter(ev => ev.start && (ev.start.dateTime || ev.start.date) && ev.status !== "cancelled");
  },

  // --- Sheets ---

  async createDiarioSpreadsheet() {
    const body = {
      properties: { title: "Diario di bordo" },
      sheets: [{
        properties: { title: "Diario" },
        data: [{
          startRow: 0,
          startColumn: 0,
          rowData: [{
            values: [
              "Timestamp", "Data", "Ora inizio", "Ora fine", "ID evento",
              "Materia pianificata", "Stato", "Materia/nota effettiva", "Motivo"
            ].map(v => ({ userEnteredValue: { stringValue: v } }))
          }]
        }]
      }]
    };
    const data = await this._fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return data.spreadsheetId;
  },

  async appendDiarioRow(spreadsheetId, row) {
    const url = "https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheetId +
      "/values/Diario!A:I:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS";
    return this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: [row] })
    });
  },

  async readDiarioRows(spreadsheetId) {
    const url = "https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheetId + "/values/Diario!A2:I10000";
    const data = await this._fetch(url);
    return data.values || [];
  }
};
