// Orchestrazione: stato dell'app, caricamento dati, collegamento degli
// eventi dell'interfaccia alle chiamate API. E' l'unico file che "decide";
// ui.js disegna, googleApi.js parla con Google, store.js legge/scrive le
// impostazioni locali.

const App = {
  state: {
    selectedDate: startOfDay(new Date()),
    calMonth: null, // {year, month} del mese mostrato nel mini calendario
    events: [],
    diarioMap: {}, // eventId -> {stato, materiaEffettiva, nota, motivo}
    currentEvent: null,
    signedIn: false
  },

  async init() {
    UI.cacheEls();
    this.state.calMonth = { year: this.state.selectedDate.getFullYear(), month: this.state.selectedDate.getMonth() };
    this.bindStaticEvents();
    this.renderCalendar();
    this.updateDateLabel();

    const clientId = Store.getClientId();
    if (!clientId) {
      UI.toast("Configura prima il Client ID Google nelle impostazioni.");
      UI.showModal(UI.els.settingsModal);
      this.fillSettingsForm();
      return;
    }
    this.setupGoogleAuth(clientId);
  },

  setupGoogleAuth(clientId) {
    UI.els.authBar.hidden = false;
    waitForGoogleIdentity(() => {
      GoogleApi.init(
        clientId,
        () => this.onSignedIn(),
        (msg) => { UI.toast(msg); }
      );
      // Nota: niente tentativo di accesso automatico senza interazione.
      // L'accesso "silenzioso" di Google puo aprire un popup, che i browser
      // bloccano se non parte da un click diretto dell'utente: e' piu
      // affidabile chiedere sempre un click su "Accedi con Google".
    }, () => {
      UI.toast("La libreria di accesso Google non si e caricata. Controlla la connessione e ricarica la pagina.");
    });
  },

  async onSignedIn() {
    this.state.signedIn = true;
    UI.els.authBar.hidden = true;

    let spreadsheetId = Store.getSpreadsheetId();
    if (!spreadsheetId) {
      try {
        UI.toast("Creo il foglio Diario di bordo su Drive...");
        spreadsheetId = await GoogleApi.createDiarioSpreadsheet();
        Store.setSpreadsheetId(spreadsheetId);
        UI.toast("Foglio creato. Lo trovi in Drive come \"Diario di bordo\".");
      } catch (e) {
        UI.toast("Non sono riuscito a creare il foglio: " + e.message);
        return;
      }
    }
    this.loadDay();
  },

  bindStaticEvents() {
    const els = UI.els;

    els.loginBtn.addEventListener("click", () => {
      if (!GoogleApi.isReady()) {
        UI.toast("Attendi che la pagina finisca di caricarsi e riprova.");
        return;
      }
      GoogleApi.requestToken(true);
    });

    els.prevDayBtn.addEventListener("click", () => this.changeDay(-1));
    els.nextDayBtn.addEventListener("click", () => this.changeDay(1));
    els.todayBtn.addEventListener("click", () => this.goToToday());
    els.calToggleBtn.addEventListener("click", () => {
      els.calendarPanel.classList.toggle("is-open-mobile");
      els.calendarPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    els.calPrevMonth.addEventListener("click", () => this.shiftCalendarMonth(-1));
    els.calNextMonth.addEventListener("click", () => this.shiftCalendarMonth(1));

    els.settingsBtn.addEventListener("click", () => {
      this.fillSettingsForm();
      UI.showModal(els.settingsModal);
    });
    els.settingsCancelBtn.addEventListener("click", () => UI.hideModal(els.settingsModal));
    els.settingsSaveBtn.addEventListener("click", () => this.saveSettings());

    // Menu rapido
    document.addEventListener("click", (e) => {
      if (!els.quickMenu.hidden && !els.quickMenu.contains(e.target)) UI.hideQuickMenu();
    });
    els.quickMenu.addEventListener("click", (e) => {
      const action = e.target.dataset.action;
      if (!action) return;
      UI.hideQuickMenu();
      if (action === "note") this.openNoteModal(this.state.currentEvent);
      if (action === "modify") this.openModifyModal(this.state.currentEvent);
      if (action === "cancel") this.openCancelModal(this.state.currentEvent);
    });

    // Modale nota
    els.noteCancelBtn.addEventListener("click", () => UI.hideModal(els.noteModal));
    els.noteSaveBtn.addEventListener("click", () => this.saveNote());

    // Modale modifica
    els.modifyCancelBtn.addEventListener("click", () => UI.hideModal(els.modifyModal));
    els.modifySaveBtn.addEventListener("click", () => this.saveModify());

    // Modale saltata
    els.cancelCancelBtn.addEventListener("click", () => UI.hideModal(els.cancelModal));
    els.cancelSaveBtn.addEventListener("click", () => this.saveCancel());
  },

  fillSettingsForm() {
    UI.els.clientIdInput.value = Store.getClientId();
    UI.els.calendarIdInput.value = Store.getCalendarId();
    UI.els.spreadsheetIdInput.value = Store.getSpreadsheetId();
    UI.els.settingsHint.textContent = "";
  },

  saveSettings() {
    const clientId = UI.els.clientIdInput.value.trim();
    const calendarId = UI.els.calendarIdInput.value.trim() || "primary";
    const spreadsheetId = UI.els.spreadsheetIdInput.value.trim();

    if (!clientId) {
      UI.els.settingsHint.textContent = "Il Client ID e obbligatorio.";
      return;
    }

    const clientChanged = clientId !== Store.getClientId();
    Store.setClientId(clientId);
    Store.setCalendarId(calendarId);
    Store.setSpreadsheetId(spreadsheetId);

    UI.hideModal(UI.els.settingsModal);

    if (clientChanged || !GoogleApi.isReady()) {
      GoogleApi.signOut();
      this.setupGoogleAuth(clientId);
    } else if (GoogleApi.isSignedIn()) {
      this.loadDay();
    }
  },

  updateDateLabel() {
    UI.els.selectedDateLabel.textContent = UI.fmtDateLabel(this.state.selectedDate);
  },

  renderCalendar() {
    const { year, month } = this.state.calMonth;
    UI.renderMiniCalendar(year, month, this.state.selectedDate, startOfDay(new Date()), (d) => this.pickDay(d));
  },

  shiftCalendarMonth(delta) {
    let { year, month } = this.state.calMonth;
    month += delta;
    if (month < 0) { month = 11; year--; }
    if (month > 11) { month = 0; year++; }
    this.state.calMonth = { year, month };
    this.renderCalendar();
  },

  pickDay(d) {
    this.state.selectedDate = startOfDay(d);
    this.state.calMonth = { year: d.getFullYear(), month: d.getMonth() };
    this.updateDateLabel();
    this.renderCalendar();
    UI.els.calendarPanel.classList.remove("is-open-mobile");
    this.loadDay();
  },

  changeDay(delta) {
    const d = new Date(this.state.selectedDate);
    d.setDate(d.getDate() + delta);
    this.pickDay(d);
  },

  goToToday() {
    this.pickDay(new Date());
  },

  async loadDay() {
    if (!GoogleApi.isSignedIn()) return;
    UI.setLoading(true);
    const dateISO = isoDate(this.state.selectedDate);
    const calendarId = Store.getCalendarId();
    const spreadsheetId = Store.getSpreadsheetId();

    try {
      const [events, rows] = await Promise.all([
        GoogleApi.listEventsForDay(calendarId, dateISO),
        spreadsheetId ? GoogleApi.readDiarioRows(spreadsheetId) : Promise.resolve([])
      ]);
      this.state.events = events.filter(ev => isSchoolEvent(ev.colorId));
      this.state.diarioMap = this.buildDiarioMap(rows, dateISO);
      UI.setLoading(false);
      this.renderHours();
    } catch (e) {
      UI.setLoading(false);
      this.handleApiError(e, "Errore nel caricamento: " + e.message);
    }
  },

  handleApiError(e, genericMsg) {
    if (e.message && e.message.startsWith("AUTH_EXPIRED")) {
      this.state.signedIn = false;
      UI.els.authBar.hidden = false;
      UI.toast("La sessione Google e scaduta: accedi di nuovo per continuare.");
    } else {
      UI.toast(genericMsg);
    }
  },

  buildDiarioMap(rows, dateISO) {
    const map = {};
    rows.forEach(row => {
      const [, data, oraInizio, , idEvento, , stato, materiaNota, motivo] = row;
      if (data !== dateISO) return;
      const key = idEvento || (data + "|" + oraInizio);
      map[key] = {
        stato: stato || "",
        materiaEffettiva: stato === "modificata" ? (materiaNota || "") : "",
        nota: stato === "svolta" ? (materiaNota || "") : (stato === "modificata" ? (motivo || "") : ""),
        motivo: stato === "caduta" ? (materiaNota || "") : ""
      };
    });
    return map;
  },

  keyFor(ev) {
    return ev.id || (isoDate(this.state.selectedDate) + "|" + hhmm(ev.start.dateTime));
  },

  renderHours() {
    UI.renderHoursList(this.state.events, this.state.diarioMap, {
      keyFor: (ev) => this.keyFor(ev),
      onOpenNote: (ev) => this.openNoteModal(ev),
      onOpenQuickMenu: (ev, x, y) => this.openQuickMenu(ev, x, y)
    });
  },

  openQuickMenu(ev, x, y) {
    this.state.currentEvent = ev;
    UI.positionQuickMenu(x, y);
  },

  subtitleFor(ev) {
    const start = hhmm(ev.start.dateTime || ev.start.date);
    const end = ev.end && (ev.end.dateTime || ev.end.date) ? hhmm(ev.end.dateTime || ev.end.date) : "";
    return (ev.summary || "(senza titolo)") + " · " + start + (end ? "-" + end : "");
  },

  openNoteModal(ev) {
    this.state.currentEvent = ev;
    const existing = this.state.diarioMap[this.keyFor(ev)];
    UI.els.noteModalSubtitle.textContent = this.subtitleFor(ev);
    UI.els.noteText.value = existing && existing.stato === "svolta" ? existing.nota : "";
    UI.showModal(UI.els.noteModal);
    UI.els.noteText.focus();
  },

  openModifyModal(ev) {
    this.state.currentEvent = ev;
    UI.els.modifyModalSubtitle.textContent = this.subtitleFor(ev);
    UI.els.modifySubject.value = "";
    UI.els.modifyNote.value = "";
    UI.showModal(UI.els.modifyModal);
    UI.els.modifySubject.focus();
  },

  openCancelModal(ev) {
    this.state.currentEvent = ev;
    UI.els.cancelModalSubtitle.textContent = this.subtitleFor(ev);
    UI.els.cancelReason.value = "";
    UI.els.cancelNote.value = "";
    UI.showModal(UI.els.cancelModal);
  },

  baseRow(ev, stato) {
    const dateISO = isoDate(this.state.selectedDate);
    return [
      new Date().toISOString(),
      dateISO,
      hhmm(ev.start.dateTime || ev.start.date),
      ev.end ? hhmm(ev.end.dateTime || ev.end.date) : "",
      ev.id || "",
      ev.summary || "",
      stato
    ];
  },

  async saveRow(row, successMsg) {
    const spreadsheetId = Store.getSpreadsheetId();
    if (!spreadsheetId) {
      UI.toast("Nessun foglio configurato: apri le impostazioni.");
      return false;
    }
    try {
      await GoogleApi.appendDiarioRow(spreadsheetId, row);
      UI.toast(successMsg);
      return true;
    } catch (e) {
      this.handleApiError(e, "Errore nel salvataggio: " + e.message);
      return false;
    }
  },

  async saveNote() {
    const ev = this.state.currentEvent;
    if (!ev) return;
    const nota = UI.els.noteText.value.trim();
    const row = this.baseRow(ev, "svolta").concat([nota, ""]);
    const ok = await this.saveRow(row, "Salvato.");
    if (ok) {
      this.state.diarioMap[this.keyFor(ev)] = { stato: "svolta", nota, materiaEffettiva: "", motivo: "" };
      UI.hideModal(UI.els.noteModal);
      this.renderHours();
    }
  },

  async saveModify() {
    const ev = this.state.currentEvent;
    if (!ev) return;
    const materia = UI.els.modifySubject.value.trim();
    if (!materia) { UI.toast("Scrivi cosa hai fatto al posto della materia pianificata."); return; }
    const nota = UI.els.modifyNote.value.trim();
    const row = this.baseRow(ev, "modificata").concat([materia, nota]);
    const ok = await this.saveRow(row, "Salvato.");
    if (ok) {
      this.state.diarioMap[this.keyFor(ev)] = { stato: "modificata", materiaEffettiva: materia, nota, motivo: "" };
      UI.hideModal(UI.els.modifyModal);
      this.renderHours();
    }
  },

  async saveCancel() {
    const ev = this.state.currentEvent;
    if (!ev) return;
    const motivo = UI.els.cancelReason.value;
    if (!motivo) { UI.toast("Scegli un motivo."); return; }
    const dettagli = UI.els.cancelNote.value.trim();
    const motivoCompleto = dettagli ? motivo + " - " + dettagli : motivo;
    const row = this.baseRow(ev, "caduta").concat(["", motivoCompleto]);
    const ok = await this.saveRow(row, "Segnata come saltata.");
    if (ok) {
      this.state.diarioMap[this.keyFor(ev)] = { stato: "caduta", materiaEffettiva: "", nota: "", motivo: motivoCompleto };
      UI.hideModal(UI.els.cancelModal);
      this.renderHours();
    }
  }
};

function waitForGoogleIdentity(onReady, onTimeout, attemptsLeft) {
  if (attemptsLeft === undefined) attemptsLeft = 25; // ~5 secondi
  if (window.google && google.accounts && google.accounts.oauth2) {
    onReady();
    return;
  }
  if (attemptsLeft <= 0) {
    onTimeout();
    return;
  }
  setTimeout(() => waitForGoogleIdentity(onReady, onTimeout, attemptsLeft - 1), 200);
}

function startOfDay(d) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function hhmm(dt) {
  if (!dt) return "";
  const d = new Date(dt);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

document.addEventListener("DOMContentLoaded", () => App.init());
