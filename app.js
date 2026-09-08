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
    signedIn: false,
    selectedIds: new Set(), // ore selezionate con Ctrl/Cmd+clic, per la fusione
    pendingImages: [], // immagini scelte ma non ancora caricate su Drive
    planOriginal: "" // "cosa vuoi fare" come sta ora su Calendar
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
    waitForGoogleIdentity(() => {
      GoogleApi.init(
        clientId,
        () => this.onSignedIn(),
        (msg) => {
          // Se il tentativo era silenzioso (nessun click dell'utente) non
          // mostriamo l'errore: e' normale la prima volta o se il consenso
          // e' scaduto. Mostriamo solo il pulsante di accesso manuale.
          UI.els.authBar.hidden = false;
          if (GoogleApi._lastInteractive) UI.toast(msg);
        }
      );
      // Primo tentativo: accesso "silenzioso", senza popup e senza schermate.
      // Funziona senza che l'utente veda nulla se e' gia' loggato con Google
      // su questo dispositivo/browser e ha gia' dato il consenso in passato.
      // Se fallisce (mai acceduto prima, consenso revocato, ecc.) compare
      // semplicemente il pulsante "Accedi con Google".
      GoogleApi.requestToken(false);
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

    // Fusione ore (Ctrl/Cmd+clic per selezionare, poi "Fondi")
    els.mergeBtn.addEventListener("click", () => this.openMergeNoteModal());
    els.mergeCancelBtn.addEventListener("click", () => this.clearSelection());

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

    // Immagini: scelta da file oppure incollate (screenshot con Ctrl+V).
    els.imageInput.addEventListener("change", (e) => {
      Array.from(e.target.files || []).forEach(f => this.addPendingImage(f));
      e.target.value = "";
    });
    els.noteModal.addEventListener("paste", (e) => {
      const items = (e.clipboardData && e.clipboardData.items) || [];
      let taken = false;
      Array.from(items).forEach(it => {
        if (it.type && it.type.indexOf("image/") === 0) {
          const f = it.getAsFile();
          if (f) { this.addPendingImage(f); taken = true; }
        }
      });
      if (taken) e.preventDefault();
    });

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
    this.clearSelection();
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
      const [, data, oraInizio, , idEvento, , stato, materiaNota, motivo, immagini] = row;
      if (data !== dateISO) return;
      const entry = {
        stato: stato || "",
        materiaEffettiva: stato === "modificata" ? (materiaNota || "") : "",
        nota: stato === "svolta" ? (materiaNota || "") : (stato === "modificata" ? (motivo || "") : ""),
        motivo: stato === "caduta" ? (materiaNota || "") : "",
        immagini: immagini ? immagini.split(/\s+/).filter(Boolean) : []
      };
      // Le ore fuse hanno un ID evento composto "id1+id2+...": la riga vale
      // per ciascuna delle ore originali, cosi ognuna mostra lo stesso stato.
      if (idEvento && idEvento.indexOf("+") !== -1) {
        idEvento.split("+").forEach(id => { map[id] = entry; });
      } else {
        const key = idEvento || (data + "|" + oraInizio);
        map[key] = entry;
      }
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
      onOpenQuickMenu: (ev, x, y) => this.openQuickMenu(ev, x, y),
      onToggleSelect: (ev) => this.toggleSelect(ev),
      onReorder: (fromId, toId) => this.reorderEvents(fromId, toId)
    }, this.state.selectedIds);
  },

  toggleSelect(ev) {
    const id = ev.id;
    if (!id) return;
    if (this.state.selectedIds.has(id)) this.state.selectedIds.delete(id);
    else this.state.selectedIds.add(id);
    this.updateMergeBar();
    this.renderHours();
  },

  clearSelection() {
    this.state.selectedIds.clear();
    this.updateMergeBar();
  },

  updateMergeBar() {
    const n = this.state.selectedIds.size;
    UI.els.mergeBar.hidden = n < 2;
    if (n >= 2) UI.els.mergeBarLabel.textContent = n + " ore selezionate";
  },

  // Riordina solo visivamente le ore del giorno corrente (es. scambio con un
  // collega): non tocca il Calendar ne' il foglio, si perde ricaricando la
  // pagina o cambiando giorno.
  reorderEvents(fromId, toId) {
    if (!fromId || fromId === toId) return;
    const events = this.state.events;
    const fromIdx = events.findIndex(e => e.id === fromId);
    const toIdx = events.findIndex(e => e.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = events.splice(fromIdx, 1);
    events.splice(toIdx, 0, moved);
    this.renderHours();
  },

  openMergeNoteModal() {
    const ids = Array.from(this.state.selectedIds);
    if (ids.length < 2) return;
    const evs = this.state.events
      .filter(e => ids.includes(e.id))
      .sort((a, b) => new Date(a.start.dateTime || a.start.date) - new Date(b.start.dateTime || b.start.date));
    if (evs.length < 2) return;
    const first = evs[0], last = evs[evs.length - 1];
    const subjects = evs.map(e => e.summary || "(senza titolo)").filter((v, i, a) => a.indexOf(v) === i);
    const descriptions = evs.map(e => e.description || "").filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
    const merged = {
      id: evs.map(e => e.id).join("+"),
      start: first.start,
      end: last.end,
      summary: subjects.join(" + "),
      description: descriptions.join("\n"),
      colorId: first.colorId,
      _mergedIds: evs.map(e => e.id)
    };
    this.state.currentEvent = merged;
    UI.els.noteModalSubtitle.textContent = "Ore fuse: " + this.subtitleFor(merged);
    this.state.planOriginal = merged.description;
    UI.els.planText.value = merged.description;
    UI.els.noteText.value = "";
    this.state.pendingImages = [];
    UI.renderPendingImages([], () => {});
    UI.renderExistingImages([]);
    UI.showModal(UI.els.noteModal);
    UI.els.noteText.focus();
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
    this.state.planOriginal = ev.description || "";
    UI.els.planText.value = this.state.planOriginal;
    UI.els.noteText.value = existing && existing.stato === "svolta" ? existing.nota : "";
    this.state.pendingImages = [];
    UI.renderPendingImages([], () => {});
    UI.renderExistingImages(existing ? existing.immagini : []);
    UI.showModal(UI.els.noteModal);
    UI.els.noteText.focus();
  },

  addPendingImage(file) {
    if (!file) return;
    const ext = (file.type && file.type.split("/")[1]) || "png";
    const name = "diario-" + isoDate(this.state.selectedDate) + "-" + Date.now() + "-" +
      (this.state.pendingImages.length + 1) + "." + ext;
    this.state.pendingImages.push({ file: file, name: name });
    this.renderPendingImages();
  },

  removePendingImage(i) {
    this.state.pendingImages.splice(i, 1);
    this.renderPendingImages();
  },

  renderPendingImages() {
    UI.renderPendingImages(this.state.pendingImages, (i) => this.removePendingImage(i));
  },

  async uploadPendingImages() {
    if (!this.state.pendingImages.length) return [];
    let folderId = Store.getImagesFolderId();
    if (!folderId) {
      folderId = await GoogleApi.createImagesFolder();
      Store.setImagesFolderId(folderId);
    }
    const links = [];
    for (const img of this.state.pendingImages) {
      const res = await GoogleApi.uploadImage(img.file, folderId, img.name);
      links.push(res.webViewLink || ("https://drive.google.com/file/d/" + res.id + "/view"));
    }
    this.state.pendingImages = [];
    this.renderPendingImages();
    return links;
  },

  // Riporta su Google Calendar il "cosa vuoi fare" modificato a mano.
  async savePlanToCalendar(ev, plan) {
    const calendarId = Store.getCalendarId();
    const ids = ev._mergedIds || [ev.id];
    for (const id of ids) {
      if (!id) continue;
      await GoogleApi.updateEventDescription(calendarId, id, plan);
    }
    this.state.events.forEach(e => { if (ids.indexOf(e.id) !== -1) e.description = plan; });
    if (!ev._mergedIds) ev.description = plan;
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
    const plan = UI.els.planText.value;
    const existing = this.state.diarioMap[this.keyFor(ev)];
    const vecchieImmagini = (existing && existing.immagini) ? existing.immagini : [];

    let nuoveImmagini = [];
    if (this.state.pendingImages.length) {
      UI.toast("Carico le immagini su Drive...");
      try {
        nuoveImmagini = await this.uploadPendingImages();
      } catch (e) {
        this.handleApiError(e, "Non sono riuscito a caricare le immagini: " + e.message);
        return;
      }
    }
    const immagini = vecchieImmagini.concat(nuoveImmagini);

    const row = this.baseRow(ev, "svolta").concat([nota, "", immagini.join(" ")]);
    const ok = await this.saveRow(row, "Salvato.");
    if (!ok) return;

    if (plan !== this.state.planOriginal) {
      try {
        await this.savePlanToCalendar(ev, plan);
        this.state.planOriginal = plan;
      } catch (e) {
        this.handleApiError(e, "Nota salvata, ma non ho potuto aggiornare il Calendar: " + e.message);
      }
    }

    const entry = { stato: "svolta", nota, materiaEffettiva: "", motivo: "", immagini };
    if (ev._mergedIds) {
      ev._mergedIds.forEach(id => { this.state.diarioMap[id] = entry; });
      this.clearSelection();
    } else {
      this.state.diarioMap[this.keyFor(ev)] = entry;
    }
    UI.hideModal(UI.els.noteModal);
    this.renderHours();
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
      this.state.diarioMap[this.keyFor(ev)] = { stato: "modificata", materiaEffettiva: materia, nota, motivo: "", immagini: [] };
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
      this.state.diarioMap[this.keyFor(ev)] = { stato: "caduta", materiaEffettiva: "", nota: "", motivo: motivoCompleto, immagini: [] };
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
