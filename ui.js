// Funzioni di rendering e piccoli helper per l'interfaccia.
// Non contengono chiamate di rete: ricevono dati gia pronti da app.js.

const UI = {
  els: {},

  cacheEls() {
    const ids = [
      "authBar", "loginBtn", "loadingMsg", "emptyMsg", "hoursList",
      "selectedDateLabel", "prevDayBtn", "todayBtn", "nextDayBtn",
      "calToggleBtn", "settingsBtn", "calendarPanel",
      "calPrevMonth", "calNextMonth", "calMonthLabel", "miniCalGrid",
      "quickMenu", "noteModal", "noteModalTitle", "noteModalSubtitle", "noteText",
      "noteCancelBtn", "noteSaveBtn",
      "modifyModal", "modifyModalSubtitle", "modifySubject", "modifyNote",
      "modifyCancelBtn", "modifySaveBtn",
      "cancelModal", "cancelModalSubtitle", "cancelReason", "cancelNote",
      "cancelCancelBtn", "cancelSaveBtn",
      "settingsModal", "clientIdInput", "calendarIdInput", "spreadsheetIdInput",
      "settingsHint", "settingsCancelBtn", "settingsSaveBtn",
      "toast"
    ];
    ids.forEach(id => { this.els[id] = document.getElementById(id); });
  },

  fmtDateLabel(date) {
    return date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  },

  fmtTime(dt) {
    if (!dt) return "";
    const d = new Date(dt);
    return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  },

  toast(msg) {
    const el = this.els.toast;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  },

  setLoading(isLoading) {
    this.els.loadingMsg.hidden = !isLoading;
    if (isLoading) {
      this.els.emptyMsg.hidden = true;
      this.els.hoursList.innerHTML = "";
    }
  },

  statusLabel(entry) {
    if (!entry) return "";
    if (entry.stato === "svolta") return "Svolta" + (entry.nota ? ": " + entry.nota : "");
    if (entry.stato === "modificata") return "Modificata: " + entry.materiaEffettiva + (entry.nota ? " (" + entry.nota + ")" : "");
    if (entry.stato === "caduta") return "Saltata" + (entry.motivo ? ": " + entry.motivo : "");
    return "";
  },

  renderHoursList(events, diarioMap, handlers) {
    const list = this.els.hoursList;
    list.innerHTML = "";
    this.els.emptyMsg.hidden = events.length > 0;

    events.forEach(ev => {
      const key = handlers.keyFor(ev);
      const entry = diarioMap[key];
      const color = colorForEvent(ev.colorId);

      const li = document.createElement("li");
      li.className = "hour-block";
      li.style.borderLeftColor = color;
      li.dataset.eventId = ev.id;

      const main = document.createElement("div");
      main.className = "hour-block-main";

      const time = document.createElement("div");
      time.className = "hour-time";
      const startStr = ev.start.dateTime ? this.fmtTime(ev.start.dateTime) : "Tutto il giorno";
      const endStr = ev.end && ev.end.dateTime ? this.fmtTime(ev.end.dateTime) : "";
      time.textContent = endStr ? (startStr + " - " + endStr) : startStr;

      const subject = document.createElement("div");
      subject.className = "hour-subject";
      subject.textContent = ev.summary || "(senza titolo)";

      main.appendChild(time);
      main.appendChild(subject);

      if (entry) {
        const status = document.createElement("div");
        status.className = "hour-status " + entry.stato;
        status.textContent = this.statusLabel(entry);
        main.appendChild(status);
      }

      const menuBtn = document.createElement("button");
      menuBtn.className = "hour-menu-btn";
      menuBtn.setAttribute("aria-label", "Azioni per questa ora");
      menuBtn.textContent = "⋯"; // ellipsis
      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const rect = menuBtn.getBoundingClientRect();
        handlers.onOpenQuickMenu(ev, rect.left, rect.bottom);
      });

      li.appendChild(main);
      li.appendChild(menuBtn);

      li.addEventListener("click", () => handlers.onOpenNote(ev));
      li.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        handlers.onOpenQuickMenu(ev, e.clientX, e.clientY);
      });

      list.appendChild(li);
    });
  },

  positionQuickMenu(x, y) {
    const menu = this.els.quickMenu;
    menu.hidden = false;
    const vw = window.innerWidth, vh = window.innerHeight;
    // Prima misura, poi riposiziona per non uscire dallo schermo.
    const rect = menu.getBoundingClientRect();
    let left = Math.min(x, vw - rect.width - 12);
    let top = Math.min(y, vh - rect.height - 12);
    left = Math.max(8, left);
    top = Math.max(8, top);
    menu.style.left = left + "px";
    menu.style.top = top + "px";
  },

  hideQuickMenu() {
    this.els.quickMenu.hidden = true;
  },

  showModal(el) { el.hidden = false; },
  hideModal(el) { el.hidden = true; },

  renderMiniCalendar(viewYear, viewMonth, selectedDate, today, onPickDay) {
    const label = new Date(viewYear, viewMonth, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    this.els.calMonthLabel.textContent = label;

    const grid = this.els.miniCalGrid;
    grid.innerHTML = "";

    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    // Lunedi come primo giorno della settimana.
    let startOffset = (firstOfMonth.getDay() + 6) % 7;
    const startDate = new Date(viewYear, viewMonth, 1 - startOffset);

    for (let i = 0; i < 42; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);

      const btn = document.createElement("button");
      btn.className = "mini-cal-day";
      btn.textContent = d.getDate();

      if (d.getMonth() !== viewMonth) btn.classList.add("other-month");
      const dow = d.getDay();
      if (dow === 0 || dow === 6) btn.classList.add("weekend");
      if (this.isSameDay(d, today)) btn.classList.add("today");
      if (this.isSameDay(d, selectedDate)) btn.classList.add("selected");

      btn.addEventListener("click", () => onPickDay(d));
      grid.appendChild(btn);
    }
  },

  isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
};
