// Mappa dei colori standard di Google Calendar (colorId -> esadecimale),
// cosi i blocchi orari nella dashboard usano automaticamente
// lo stesso colore che l'utente ha assegnato ai singoli eventi su Calendar.
const GOOGLE_EVENT_COLORS = {
  "1": "#7986cb", // Lavanda
  "2": "#33b679", // Salvia
  "3": "#8e24aa", // Uva
  "4": "#e67c73", // Fenicottero
  "5": "#f6c026", // Banana
  "6": "#f5511d", // Mandarino
  "7": "#039be5", // Pavone
  "8": "#616161", // Grafite
  "9": "#3f51b5", // Mirtillo
  "10": "#0b8043", // Basilico
  "11": "#d60000"  // Pomodoro
};

function colorForEvent(colorId) {
  return GOOGLE_EVENT_COLORS[colorId] || "#3f51b5";
  }

// Solo gli eventi scolastici: giallo (Banana, medie) e verde (Salvia o
// Basilico, liceo). Gli eventi personali (impegni, appuntamenti) di solito
// non hanno nessuno di questi colori assegnato e vengono quindi esclusi
// dalla dashboard.
const SCHOOL_COLOR_IDS = ["2", "5", "10"];

function isSchoolEvent(colorId) {
  return SCHOOL_COLOR_IDS.includes(colorId);
}
