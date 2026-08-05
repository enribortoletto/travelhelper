# Cosa devi darmi, e come — guida per te

Questo file non serve a me per costruire l'app (quello è `05-infrastructure-setup.md`, scritto per un agente) — serve a **te**, come lista pratica di cosa andare a creare/copiare in ogni servizio e come consegnarmelo in sicurezza. GitHub è già collegato (`enribortoletto/travelhelper`), non serve fare nulla lì.

---

## Prima di tutto: come consegnarmi le chiavi

**Mai incollare una chiave/segreto direttamente in chat.** Il modo giusto:

1. Nella cartella del progetto crea un file chiamato `.env.local` (è già escluso da Git, non finirà mai su GitHub — controllato, è già nel `.gitignore`).
2. Man mano che raccogli le chiavi qui sotto, incollale in quel file, una riga per ciascuna, nel formato `NOME_CHIAVE=valore`.
3. Quando hai finito (anche parzialmente, va bene procedere a step), dimmelo semplicemente in chat — es. *"ho messo le chiavi Supabase e Google Maps nel file"*. Io lo leggo direttamente da lì, non serve altro.

Ti scrivo qui sotto anche il nome esatto che ogni chiave dovrebbe avere nel file, così è già pronto.

---

## 1. Supabase — il backend

1. Vai su **supabase.com** → crea un account (se non ce l'hai) → **New Project**.
2. Scegli nome progetto, password del database (salvala da qualche parte sicura, non serve a me), regione.
3. A progetto creato: **Project Settings → API**.
4. Copia questi tre valori nel tuo `.env.local`:
   - `SUPABASE_URL` (campo "Project URL")
   - `SUPABASE_ANON_KEY` (campo "anon / public")
   - `SUPABASE_SERVICE_ROLE_KEY` (campo "service_role" — **questo è il più delicato**, non va mai esposto al frontend, ma a me serve per configurare le Edge Function)

Non devi creare tabelle, policy o funzioni tu: a quello penso io una volta che ho le chiavi.

## 2. Google Cloud — mappe e instradamento

1. Vai su **console.cloud.google.com** → crea/seleziona un progetto.
2. **APIs & Services → Library**: cerca e abilita, una per una: **Maps JavaScript API**, **Places API (New)**, **Directions API**, **Roads API** (quest'ultima è la meno ovvia da trovare, ma serve).
3. **APIs & Services → Credentials → Create Credentials → API key**: creane **due**. Per ciascuna, oltre alla restrizione per applicazione (referrer HTTP per una, nessuna per l'altra), c'è anche una sezione **"API restrictions"** con l'elenco delle 4 API abilitate — spunta solo quelle pertinenti a quella chiave, non tutte e 4 su entrambe (è proprio per limitare i danni se una chiave dovesse trapelare):
   - **Chiave 1** — "Restrict key" → "HTTP referrers" → il dominio del sito (quando lo saprai) → API restrictions: **Maps JavaScript API, Places API (New), Directions API, Roads API** (tutte e 4 — la usa il browser per mappa, ricerca luoghi, tempi di percorrenza e conferma posizione) → salvala nel file come `GOOGLE_MAPS_CLIENT_KEY`
   - **Chiave 2** — nessuna restrizione per applicazione, da tenere segreta → API restrictions: solo **Places API (New)** e **Directions API** (la usano le Edge Function per l'assistente AI e il ricalcolo dei ritardi — non le serve Maps JavaScript API, che è solo per il browser, né Roads API) → salvala come `GOOGLE_MAPS_SERVER_KEY`
4. Se non hai ancora il dominio finale, va bene lasciare la prima chiave senza restrizioni di referrer per ora e restringerla dopo — dimmelo e te lo ricordo io quando arriviamo al deploy.

## 3. Resend — email

1. Vai su **resend.com** → crea un account.
2. **Domains → Add Domain**: inserisci un dominio che possiedi (serve accesso al pannello DNS di quel dominio, per aggiungere i record che Resend ti mostra — SPF/DKIM). Se non hai ancora un dominio, questo passaggio può aspettare: dimmelo e lo saltiamo per ora (l'email di invito/reset password può appoggiarsi temporaneamente al sistema email integrato di Supabase).
3. **API Keys → Create API Key**: copialo come `RESEND_API_KEY`.

## 4. OpenAI — l'assistente AI

1. Vai su **platform.openai.com** → accedi/crea account.
2. Assicurati di avere un metodo di pagamento collegato (**Settings → Billing**) — senza credito l'API non risponde, anche con chiave valida.
3. **API Keys → Create new secret key**: copialo subito (non sarà più visibile dopo) come `OPENAI_API_KEY`.

## 5. Un provider di dati voli (facoltativo, solo per il tracciamento voli)

1. Vai su **rapidapi.com** → crea un account.
2. Cerca **"AeroDataBox"** nel marketplace → iscriviti al piano gratuito (o quello che preferisci).
3. Nella pagina dell'API trovi la tua **RapidAPI Key**: copiala come `AERODATABOX_API_KEY`.
4. Questo passaggio non è bloccante per il resto — se vuoi puoi saltarlo e aggiungerlo più avanti, il tracciamento voli è una funzionalità additiva.

## 6. Hosting del frontend + dominio (esempio con Vercel — Netlify/Cloudflare Pages sono equivalenti)

1. Crea l'account su **vercel.com** (puoi accedere direttamente con GitHub, colleghi tutto in un passaggio).
2. **Import Project** dal repo `enribortoletto/travelhelper` — conviene farlo quando il frontend esiste già (per ora c'è solo documentazione, non ci sarebbe nulla da buildare); te lo ricordo io quando siamo a quel punto.
3. Una volta importato, in **Project Settings → Environment Variables** vanno **solo le chiavi lato client** — mai i segreti server, che restano solo su Supabase:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GOOGLE_MAPS_CLIENT_KEY`
4. Dominio: quando ce l'hai, **Project Settings → Domains** — il certificato HTTPS lo gestisce Vercel da solo, basta puntare il DNS.

Con questo, ogni push su `main` fa deploy automatico — non serve altro, non serve darmi nessuna chiave per questa parte.

**Facoltativo**, solo se vuoi che gestisca io deploy/variabili da riga di comando invece che tu dalla dashboard: un **Vercel Access Token** (Account Settings → Tokens → Create Token) nel `.env.local` come `VERCEL_TOKEN`, più il nome esatto del progetto e se è sotto il tuo account personale o un team. Se preferisci restare sul flusso dashboard-only sopra, salta pure questa parte.

## 7. Le chiavi VAPID (notifiche push)

Non devi fare nulla qui — le genero io in automatico durante il build e te le mostro solo per conferma. Le cito solo perché sono nell'elenco completo dei "segreti" del progetto.

---

## Riepilogo — cosa mettere nel `.env.local`

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_MAPS_CLIENT_KEY=
GOOGLE_MAPS_SERVER_KEY=
RESEND_API_KEY=
OPENAI_API_KEY=
AERODATABOX_API_KEY=
VERCEL_TOKEN=          (facoltativo — solo se vuoi che gestisca io i deploy da CLI)
```

Nomi semplici qui apposta, per raccoglierle tutte in un unico posto — quando scrivo il codice sono io a sistemare quali vanno esposte al frontend con il prefisso che serve (es. `VITE_...`) e quali restano segrete solo lato server, non è qualcosa di cui devi occuparti tu.

Puoi procedere con calma e uno alla volta — non serve avere tutto pronto subito. Le uniche due voci senza cui non riesco a far partire nulla di concreto sono **Supabase** e **Google Cloud** (mappe): tutto il resto (email, AI, voli, hosting) può arrivare mano a mano che si costruiscono le funzionalità corrispondenti, seguendo l'ordine di `02` che ho già in `06`.
