// Gestione delle impostazioni salvate localmente nel browser (per-dispositivo).
// Nota: nessun dato sensibile (token di accesso) viene mai salvato qui,
// solo identificatori di configurazione scelti dall'utente.

const Store = {
  KEYS: {
    clientId: "diario_client_id",
    calendarId: "diario_calendar_id",
    spreadsheetId: "diario_spreadsheet_id"
  },

  get(key) {
    try {
      return localStorage.getItem(key) || "";
    } catch (e) {
      return "";
    }
  },

  set(key, value) {
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch (e) {
      // Storage non disponibile (es. modalita privata): l'app funziona
      // comunque per la sessione corrente, semplicemente non ricorda le
      // impostazioni al prossimo avvio.
    }
  },

  getClientId() { return this.get(this.KEYS.clientId); },
  setClientId(v) { this.set(this.KEYS.clientId, v); },

  getCalendarId() { return this.get(this.KEYS.calendarId) || "primary"; },
  setCalendarId(v) { this.set(this.KEYS.calendarId, v || "primary"); },

  getSpreadsheetId() { return this.get(this.KEYS.spreadsheetId); },
  setSpreadsheetId(v) { this.set(this.KEYS.spreadsheetId, v); }
};
