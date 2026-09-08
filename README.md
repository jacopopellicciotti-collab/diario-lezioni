# Diario di bordo

Webapp personale per registrare, ora per ora, cosa succede davvero a lezione:
la dashboard mostra le ore previste secondo Google Calendar, permette di
segnare una lezione come svolta (con una nota), modificata (materia diversa
da quella pianificata) o saltata, e salva tutto in un foglio Google Sheets
("Diario di bordo") nel tuo Drive personale.

L'app **non** chiama direttamente Claude: e pensata per lavorare insieme al
task pianificato di Cowork che gia aggiorna la tua Programmazione e il
Calendar. Il task legge il foglio Diario di bordo e usa quelle informazioni
per riconciliare eventuali scostamenti dal programma. In questo modo non
serve nessuna API key di Anthropic ne alcun backend: e un sito statico,
ospitabile gratis su GitHub Pages, che parla solo con le API di Google
direttamente dal browser.

## Cosa devi fare tu (una tantum)

### 1. Creare un progetto Google Cloud e abilitare le API

1. Vai su https://console.cloud.google.com/ e crea un nuovo progetto (es.
   "Diario di bordo").
2. Nel menu "API e servizi" > "Libreria", cerca e abilita:
   - **Google Calendar API**
   - **Google Sheets API**

### 2. Configurare la schermata di consenso OAuth

1. In "API e servizi" > "Schermata consenso OAuth", scegli tipo **Esterno**.
2. Inserisci un nome app (es. "Diario di bordo"), la tua email come
   contatto.
3. Negli ambiti (scope) puoi lasciare quelli di default: l'app li richiedera
   direttamente al momento dell'accesso (`calendar.readonly` e
   `spreadsheets`).
4. Nella sezione "Utenti di test", aggiungi il tuo indirizzo
   jacopo.pellicciotti@gmail.com. Puoi lasciare l'app in stato **Test**:
   dato che l'app chiede sempre un nuovo accesso (nessun token viene
   conservato a lungo termine nel browser), lo stato Test va benissimo e
   non ha bisogno della verifica di Google.

### 3. Creare le credenziali OAuth (Client ID)

1. In "API e servizi" > "Credenziali" > "Crea credenziali" > "ID client
   OAuth".
2. Tipo applicazione: **Applicazione web**.
3. In "Origini JavaScript autorizzate" aggiungi l'indirizzo dove pubblicherai
   l'app, ad esempio:
   - `https://<tuo-utente-github>.github.io`
   - (facoltativo, per fare prove) `http://localhost:5500` o simile
4. Salva: otterrai un **Client ID** del tipo
   `xxxxxxxxxx.apps.googleusercontent.com`. Non serve alcun "Client secret"
   (l'app e client-side pura).

### 4. Pubblicare l'app su GitHub Pages

1. Crea un nuovo repository su GitHub (puo essere privato: GitHub Pages
   funziona anche su repository privati con un piano GitHub Pro, oppure
   rendilo pubblico dato che non contiene nessuna chiave segreta: il Client
   ID OAuth e pensato per essere visibile pubblicamente).
2. Carica tutti i file di questa cartella (`index.html`, `css/`, `js/`,
   questo `README.md`) nel repository, ad esempio dalla cartella scaricata:

   ```bash
   cd diario-lezioni
   git init
   git add .
   git commit -m "Prima versione del diario di bordo"
   git branch -M main
   git remote add origin https://github.com/<tuo-utente>/<tuo-repo>.git
   git push -u origin main
   ```

3. Su GitHub, vai in "Settings" > "Pages", imposta la sorgente su branch
   `main`, cartella `/ (root)`. Dopo un minuto l'app sara raggiungibile su
   `https://<tuo-utente-github>.github.io/<tuo-repo>/`.

   Se l'indirizzo finale e diverso da quello che avevi messo al punto 3
   (Origini JavaScript autorizzate), torna in Google Cloud e aggiungilo.

### 5. Primo avvio

1. Apri l'indirizzo GitHub Pages sul telefono, tablet o computer.
2. Al primo avvio si apre automaticamente il pannello Impostazioni: incolla
   il **Client ID** creato al punto 3 e salva.
3. Clicca "Accedi con Google" e autorizza l'app (vedrai l'avviso "app non
   verificata": e normale per un'app personale in stato Test, clicca su
   "Avanzate" poi "Vai a Diario di bordo (non sicuro)" per procedere).
4. Al primo accesso l'app crea da sola, nel tuo Drive, un foglio chiamato
   **"Diario di bordo"** con le colonne gia pronte, e ricorda il suo ID
   nelle impostazioni del browser che stai usando.

Ripeti il punto 3 su ogni dispositivo/browser che userai (telefono, tablet,
computer): le impostazioni sono salvate localmente in ciascun browser, non
condivise fra dispositivi. Se vuoi usare esattamente lo stesso foglio su piu
dispositivi, dopo aver creato il foglio sul primo dispositivo copia il suo
ID (lo trovi nell'URL del foglio su Google Sheets, la parte fra `/d/` e
`/edit`) e incollalo nel campo "ID foglio" delle Impostazioni sugli altri
dispositivi, cosi scrivono tutti sullo stesso diario invece di crearne uno
a testa.

## Uso quotidiano

- La dashboard mostra le ore di lezione di oggi secondo il tuo Google
  Calendar (calendario `primary` del tuo account personale).
- **Click/tap su un'ora**: si apre il pannello per scrivere cosa hai fatto
  (viene salvato come "svolta").
- **Click destro (desktop) o pulsante "⋯" (qualsiasi dispositivo)**: apre un
  menu rapido con tre azioni: scrivere la nota, segnare che hai fatto altro
  (cambia materia), segnare la lezione come saltata (con motivo).
- **Icona calendario in alto a destra / pannello a lato**: per spostarti su
  un altro giorno scolastico, passato o futuro.
- Ogni salvataggio aggiunge una riga al foglio "Diario di bordo": nulla
  viene mai sovrascritto, cosi resta uno storico completo. Se correggi due
  volte la stessa ora, la dashboard mostra sempre l'ultima registrazione,
  ma le precedenti restano nel foglio come cronologia.

### La sessione scade dopo circa un'ora

Per restare un'app puramente statica (senza backend, senza server tuo da
mantenere) il token di accesso a Google dura circa un'ora, poi va rifatto
un accesso: se un salvataggio fallisce con un messaggio di sessione scaduta,
tocca semplicemente di nuovo "Accedi con Google", quello che stavi scrivendo
resta nel campo di testo pronto per essere salvato.

### Costi

Zero. GitHub Pages e gratuito, le chiamate a Calendar e Sheets API sono
gratuite per un uso personale come questo (ben sotto le soglie gratuite di
Google), e non serve nessuna API key di Anthropic: la parte di
ragionamento (confronto con il programma, aggiornamento della
Programmazione) e gia gestita dal task pianificato di Cowork che usa il tuo
abbonamento Claude.
