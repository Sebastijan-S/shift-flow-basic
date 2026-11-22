# SHIFTFLOW — AI MASTER PROMPT ZA RAD U VS CODE-U

**Namena:** Ovaj dokument je prenosivo projektno uputstvo za AI asistenta koji radi nad stvarnim ShiftFlow repozitorijumom. Kopiraj ceo dokument ili njegov „stalni kontekst“ + prompt odabrane faze u novi AI chat. Nije zamena za pregled koda. **Jedna faza = jedan ciklus implementacije i provere.**

**Izvor odluka:** zajedničko funkcionalno planiranje, zaključeno 20.11.2026. Prateći PDF: `ShiftFlow_Specifikacija_Proizvoda.pdf`. PDF je ljudski pregled; ovaj `.md` fajl je operativno uputstvo za rad u repozitorijumu.

---

## A. KAKO KORISTITI OVAJ DOKUMENT U SVAKOM NOVOM CHATU

1. Otvori postojeći ShiftFlow projekat u VS Code-u.
2. U AI chat prvo priloži **ovaj master prompt** i trenutni `docs/SHIFTFLOW_IMPLEMENTATION_LOG.md` (ako postoji); ako alat ne ume da čita priložene fajlove, nalepi relevantne delove.
3. U poruci imenuj fazu koju pokrećeš. Za početak napiši: **„Kreni sa Fazom 1.“**
4. Codex pregleda relevantan kod, odmah radi u okviru zadate faze, pokreće provere i prikazuje rezultat za pregled.
5. Posle pregleda vlasnik šalje novu instrukciju, npr. „Kreni sa Fazom 2“ ili „Push na GitHub“. Svaka instrukcija pokreće samo tu akciju. Ako se chat prekine, priloži isti master prompt, postojeći log i trenutni Git status/diff.
6. Ako log već postoji i koristi se u projektu, dopuni ga. Ako ga nema, rezime faze ostavi u chatu dok vlasnik ne zatraži fajl.

### Brzi tekst za novi chat

> Radi samo fazu koju sam naveo u poruci. Pregledaj stvarni kod i moje postojeće izmene, zatim odmah implementiraj i proveri tu fazu. Na kraju napiši šta si promenio, rezultate provera i kako da pregledam rezultat. Tu stani. Posle mog pregleda nastavljaš sa sledećom fazom ili radiš push na GitHub samo kada ti to izričito kažem.

---

## B. STALNI PRODUKTNI KONTEKST — OBAVEZNO POŠTOVATI

**Šta je ShiftFlow:** modularna aplikacija za kafiće, barove i restorane, prvenstveno za vlasnike i menadžere. Treba da štedi vreme, a ne da stvori dodatnu administraciju. Nije POS, fiskalna kasa, knjigovodstveni program niti potpuni obračun poreza na zarade.

**Šta već postoji, prema vlasniku projekta:** zaposleni, pozicije, dostupnost/odsustva, pravila smena, raspored, automatsko generisanje rasporeda, levi meni, postojeća podešavanja. **Raspored je GOTOV.** Postoje dva linka/pristupa: glavni pregled i poseban ograničeni pristup za osobu koja pravi raspored. Ne uvoditi novi sistem uloga. Tehnički rad i dalje mora da proveri šta je zaista implementirano i dostupno.

**Opšta pravila:**
- Svaki novi modul ima sopstvenu stavku u postojećem levom meniju i sopstvena podešavanja.
- Lokal može uključiti/isključiti modul. Isključen modul ne postoji u meniju/dashboardu, ali njegovi podaci se ne brišu.
- Raspored i postojeća navigacija moraju da rade kao ranije.
- Dashboard prikazuje samo operativne preglede aktivnih modula; **ne prikazuje zbirne zarade, odnos zarade/pazar, ukupne poslovne grafikone**. Postojeći raspored ide ISPOD gornjih kartica, brzih akcija i podsetnika.
- Ne uvoditi bespotrebno obavezne dnevne unose ili automatska zaključavanja.
- Izolovati podatke svakog lokala i poštovati bezbednost postojećeg ograničenog linka. Ovo nije zahtev za novu permission arhitekturu.
- Koristi jezik, stil, naming i UI sistem već prisutan u kodu. UI tekst po pravilu srpski (latinica), osim ako postojeća aplikacija koristi drugu usaglašenu lokalizaciju.

### B1. Evidencija radnih sati i obračun

- Planirane smene su polazna osnova. Menadžer tokom perioda može da menja evidentirane sate. Sati ostaju otvoreni do isplate plate za ceo tim.
- Svaki radnik nezavisno bira metod plaćanja: **po satu (default)**, **po smeni** ili **fiksna mesečna plata**. Individualne satnice/iznosi.
- Kada je plata isplaćena, menadžer jednom potvrđuje sate za ceo tim tog lokala. Ista radnja zaključava obračun svih zaposlenih, čuva njihove sate i iznose u istoriji i otvara novi period sa nula sati za sve. Naknadna promena rasporeda ili satnice ne menja zaključen obračun. Ponovljena potvrda istog perioda ne stvara drugi obračun.
- PDF za štampanje/potpis: zaposlenog, period, odrađene sate, način obračuna, iznos, mesto za potpis; potpis znači **potvrdu sati i obračunatog iznosa, NE potvrdu prijema novca**.
- Promena cene rada danas ne menja već potvrđene obračune.
- **NE DODAVATI** avanse, isplate, bonus/penal/korekcione finansijske stavke, automatski check-in, pause, noćne smene. Nepotpuni mesec za fiksnu platu NIJE definisan; ne izmišljati pravilo, tražiti odluku pre relevantnog koda.

### B2. Knjiga šanka + inventar — JEDAN modul

- Lokali koriste različite knjige; ne uvoditi obavezne normative, recepte i POS povezivanje.
- Jedna osnovna tabela: artikal, preneto/prethodno, nabavljeno, ukupno, novo stanje, utrošeno; jedinica mere je podešavanje artikla (npr. kom, kg, g, l, ml).
- Jednačine: `ukupno = prethodno + nabavljeno` i `novo = ukupno - utrošeno`; korisnik slobodno menja sve relevantne vrednosti. Kada unese utrošeno, računaj novo; kada unese novo, računaj utrošeno. Kada menja osnovna polja, mora postojati eksplicitna i razumljiva logika šta ostaje ručno upisano. Validirati i objasniti nedoslednost; bez tihog kvarenja stanja.
- Prvi popis počinje početnim stanjem. Sledeća knjiga preuzima završno stanje prethodne završene knjige.
- Nova knjiga može imati isti ili kasniji datum od poslednje završene. Više knjiga istog dana ide redom kojim se završavaju. Posle petkove knjige ne može se dodati nova za prethodnu sredu. Opciono polje „oznaka smene“; nema obaveznog rasporeda popisa.
- Svi jednom dodati i **još neobrisani** artikli se pojavljuju u svakoj novoj knjizi, čak i sa 0 (npr. topla čokolada). U podešavanjima: dodaj, preimenuj, izmeni, obriši iz budućih knjiga. Bez posebne UI akcije „arhiviraj“. Zadržati istorijski naziv/vrednosti za starije zapise.
- Završavanje: sačuvaj podatke, omogući **PDF download na zahtev**, ne skladišti gotov PDF fajl na serveru, sledeća knjiga dobija preneta stanja kada je korisnik otvori.
- Poslednjih **5 završenih knjiga** korisnik vidi i može ručno da menja; starije ostaju privremeno u bazi uz još neodlučen retention, ali nisu u standardnom prikazu za izmenu.
- **Ispravka stare knjige NE SME automatski promeniti kasnije knjige ili trenutno stanje.** Nema domino korekcija. Sačuvaj trag izmene; ponovo generisani PDF može prikazati novu verziju istih podataka.
- Inventar je samo pregled poslednjeg potvrđenog stanja i datuma. Nema zasebnog inventarskog unosa, minimuma, crvenih upozorenja, dobavljača, porudžbina ili normativa.

### B3. Evidencija pazara

- Dozvoli dnevne i smenske unose; više unosa istog datuma bez zabrane. Opciono označavanje smene.
- Datum na koji se unos odnosi bira korisnik; naknadni unos i izmena su normalni.
- Dva polja `gotovina` i `kartice`, može jedno ili oba; `ukupno` izračunati. Nije obavezno popuniti oba.
- Bez obaveznog svakodnevnog unosa, bez zaključavanja dana, bez generisanja nula za datume bez unosa.
- U modulu su zbir i poslednji unos. Na dashboardu prikaži iznos poslednjeg pojedinačnog unosa (gotovina + kartice tog zapisa) i datum na koji se odnosi. Redosled određuje vreme kreiranja: ako je poslednji dodat pazar za raniji datum, kartica prikazuje baš taj unos. Izmena ranijeg zapisa zadržava njegov redosled.

### B4. Notes i podsetnici

- Jedan modul. Beleška je slobodan tekst; opcioni datum/vreme čine je podsetnikom.
- Lista aktivnih podsetnika, označavanje završenim, izmena i brisanje.
- **Samo unutar aplikacije**; bez push, SMS ili e-mail notifikacija.

### B5. Izveštaji — PINNED IDEA (odloženo, van pilota)

Odluka vlasnika 22.11.2026: izveštaji su previše nepregledni za trenutni pilot. Implementacija Faze 6 je povučena iz aplikacije i baze; ostaje samo ideja za eventualnu kasniju, jednostavniju verziju. Ne vraćati ekran, podešavanja, agregacije, RPC-jeve ili pozadinski kod bez novog izričitog zahteva. Istorijske migracije i migracija povlačenja ostaju kao trag, bez aktivnih report funkcija. Faza 7 ne zavisi od izveštaja.

### B6. Dashboard

Od vrha ka dnu: (1) operativne kartice samo uključenih modula: danas raspoređeni, evidentirani sati, iznos poslednjeg pojedinačnog unosa pazara sa datumom na koji se odnosi, datum poslednje knjige; (2) brze akcije aktivnih modula; (3) aktivni podsetnici; (4) **postojeći raspored** ispod svega, sa originalnim UI ponašanjem. Nema poslovnog BI pregleda i zbirnih plata na dashboardu. Ne praviti novu komponentu rasporeda ako se postojeća može ponovo upotrebiti.

### B7. Komercijalna i onboarding ograničenja

- Za svaki lokal se naplaćuje posebno; ne implementirati upravljanje više lokala sa jednim administratorskim nalogom.
- Opcija **20 EUR/lokal/mesec, sve uključeno** je samo predlog; stara ideja Basic 15 EUR / Premium 25 EUR nije formalno zatvorena. **Ne implementirati naplatu, pricing gate ili planove bez dodatne odluke.**
- Prvo 4 besplatna pilota u Zrenjaninu, potom cilj 10 kupaca u Novom Sadu. Trajanje pilota je otvoreno. Postojeći rok od 21 dan ne primenjivati na pilot-lokale. U Fazi 1 proveriti postojeći istek i obezbediti da pilot-lokal nema automatsko odbrojavanje ili blokadu zbog tog roka. Prvih oko 15–30 klijenata osnivači lično podešavaju. Ne razvijati sada Excel import niti automatski self-service onboarding.

### B8. Eksplicitno van opsega

Nove role/permissions, digitalne checkliste, smene koje sami radnici menjaju, formalni dnevnik smene, Excel import, normativi, POS/fiskalne integracije, minimalna upozorenja u inventaru, dobavljači, avansi, evidencija isplate novca, napredno planiranje noćnog rada i pauza, masovni poslovni dashboard, push notifikacije, višelokacijski administratorski panel, trajni storage PDF fajlova.

---

## C. OBAVEZAN NAČIN RADA AI PROGRAMERA

**Na početku zadate faze:**

1. Pregledaj trenutni Git diff, uputstva repozitorijuma, relevantan kod, migracije i testove. U Fazi 1 utvrdi kako su povezani postojeći meni, podešavanja i podaci lokala.
2. Čim vlasnik imenuje fazu, možeš odmah menjati kod i testirati. Poseban plan i odobravanje plana nisu koraci u ovom toku.
3. Ako nedostaje važna poslovna odluka, izdvoji samo taj slučaj i pitaj za odluku. Dovrši nezavisne delove iste faze.

**Tokom odobrenog rada:**

- Sačuvaj postojeće ponašanje rasporeda, odsustava i druga postojeća podešavanja.
- Prvo migracija i model, zatim servisne funkcije/API, zatim UI, zatim testovi, u skladu sa stvarnim stackom.
- Ne uvodi novu biblioteku ili infrastrukturu ako postojeći projekat već ima adekvatno rešenje; objasni svaku novu zavisnost.
- Implementiraj tenant-scoping / filtere po lokalu i bezbednu validaciju ulaza; ograničeni link ne sme slučajno dobiti nove finansijske podatke.
- Ne menjaj nevezani kod, ne radi opšti redesign, ne briši postojeće migracije i produkcione podatke.
- Kod, datumi, novac, decimalne količine i brojači moraju imati deterministične testove, uključujući prazne i pogrešne ulaze.
- Ako nešto ne možeš da testiraš (nema servisa/ključeva), napiši tačno šta nije provereno.

**Posle svake faze obavezno ispiši:**

1. Rezime implementiranog i šta je ostalo van opsega.
2. Spisak dodatih/izmenjenih fajlova.
3. Migracije, eventualne env promene i potrebne komande.
4. Komande testiranja + stvarni rezultat (uspeh/neuspeh/nepokrenuto).
5. Checklist ručne provere u UI, sa očekivanim rezultatima.
6. Poznati rizici, otvorena pitanja i šta čuva kompatibilnost.
7. Dopuni postojeći implementacioni log ili ostavi rezime u chatu ako log još nije uveden.
8. **Tu stani.** Vlasnik pregleda rezultat i zasebno bira sledeću fazu ili push na GitHub.

### Predlog formata `docs/SHIFTFLOW_IMPLEMENTATION_LOG.md`

```md
# ShiftFlow — Implementation Log
Datum poslednje izmene:
Trenutna faza:
Status: NIJE POČETO / U IZRADI / NA PREGLEDU / PRIHVAĆENO
Commit/branch:

## Šta već postoji (potvrđeno kodom)
...
## Završene faze
- [ ] Faza 1: Pregled postojećeg koda i modularna osnova
- [ ] Faza 2: Sati i obračun
- [ ] Faza 3: Pazar
- [ ] Faza 4: Notes
- [ ] Faza 5: Knjiga šanka
- [ ] Faza 6: Izveštaji — povučeno, pinned idea, van pilota
- [ ] Faza 7: Dashboard
- [ ] Faza 8: Stabilizacija
## Tekuća faza / testovi / nerešena pitanja
...
## Promenjeni fajlovi i migracije
...
## Sledeća odobrena akcija
...
```

---

## D. FAZE — SPECIFIČNI PROMPTOVI I KRITERIJUMI PRIHVATANJA

### FAZA 1 — PREGLED KODA, MODULARNA OSNOVA I PILOT

**Prompt:**

> Pregledaj postojeći meni, podešavanja, način čuvanja podataka i pravila probnog perioda. Odmah implementiraj temelje modularnosti po lokalu. Svaki modul ima mesto u postojećem meniju i svoja podešavanja kada postane dostupan. Isključivanje uklanja prikaz i čuva podatke. Sačuvaj postojeće ponašanje rasporeda i odsustava. Obezbedi da za besplatne pilot-lokale trajanje ostane otvoreno i da ih postojeći probni rok ne blokira. Testiraj rezultat, prikaži izmene i stani na pregled.

**Prihvatanje:** promene togglova opstaju posle refresha, vezane su za pravi lokal, ne brišu podatke, postojeći raspored i ograničeni link rade, nema praznih/klikabilnih placeholder stranica koje glume gotove module. Pilot-lokal može da nastavi rad i posle 21 dana, bez poruke o isteku ili blokade upisa.

### FAZA 2 — RADNI SATI I OBRAČUN

**Prompt:**

> Implementiraj samo modul za sate i obračun na osnovu postojećeg rasporeda. Satnica je default; po radniku može i iznos po smeni ili fiksna mesečna plata. Menadžer uređuje otvorene sate. Tek kada je plata isplaćena, jednom potvrđuje sate za ceo tim lokala. Zaključavanje, upis svih sati i iznosa u istoriju i početak novog perioda od nule za ceo tim čine jednu celinu. Zaključeni obračun ostaje isti i posle promene rasporeda ili satnice. PDF za potpis sadrži sate i obračunati iznos, bez tvrdnje da je isplata izvršena. Ne dodavati avanse, pauze, noćne smene ili payroll poreze. Nepotpuni mesec za fiksnu platu nije definisan: prvo predloži varijante i zatraži odluku pre implementacije tog pravila.

**Slučajevi za test:** različite satnice, dve smene radnika, ispravka otvorenih sati, zajednička potvrda pri isplati usred meseca, novi period sa nula sati za svakog zaposlenog, naknadna izmena rasporeda, ponovni export PDF-a, promena satnice posle zatvaranja, duplo kliknuto zaključivanje, prazan period, fiksna plata sa potpunim mesecom. Nedorečen slučaj nepotpunog meseca ne označavati kao rešen.

### FAZA 3 — EVIDENCIJA PAZARA

**Prompt:**

> Implementiraj samo pazar. Datum korisnik bira; moguće je više unosa za isti datum i opciono po smeni. Gotovina i kartice su nezavisna opciona polja, ukupno se računa; jedna popunjena stavka je dovoljna. Naknadni unos i uređivanje su normalni, nema obaveznih unosa ni automatskog zaključavanja. Prikaz u modulu je jednostavan, sa ukupnim zbirima i poslednjim unetim pazarom. Ne tretiraj datume bez zapisa kao pazar 0. Dashboard ovde eventualno samo pripremi za kasnije povezivanje, bez velikog dizajna. Pripremi iznos i datum poslednjeg pojedinačnog unosa prema B3.

**Testovi:** dva zapisa istog datuma (kartica prikazuje samo drugi iznos), zapis unet danas za raniji datum (kartica prelazi na taj zapis), samo gotovina, samo kartica, oba polja, izmena, zbir, negativna vrednost, prazni dani, vremenska zona/datumi.

### FAZA 4 — NOTES I PODSETNICI

**Prompt:**

> Implementiraj jedan modul „Notes i podsetnici“. Beleška sa tekstom i opcionim datumom/vremenom; ako ima datum/vreme, prikazuje se kao podsetnik. Korisnik može uređivati, brisati i označiti završeno. Sve ostaje unutar aplikacije. Ne uvoditi SMS, email, push, digitalni dnevnik smene ili checkliste.

**Testovi:** bez datuma = beleška, sa datumom = podsetnik, prošao rok, završeno, izmena, brisanje, isključen modul, sortiranje po datumu.

### FAZA 5 — KNJIGA ŠANKA + INVENTAR (NAJOSETLJIVIJA FAZA)

**Prompt:**

> Implementiraj samo jedinstveni modul „Knjiga šanka i inventar“ prema master promptu. Podešavanja artikala sa jedinicom mere; jednom dodati artikli ostaju u svim budućim knjigama čak i kada je stanje 0 dok ih korisnik ne obriše iz budućih. Tabela: preneto, nabavljeno, ukupno, novo stanje, utrošeno; obe metode unosa rade i sve relevantne vrednosti se mogu ručno ispraviti. Prva knjiga počinje početnim stanjem. Svaka sledeća preuzima stanje poslednje završene i ima isti ili kasniji datum. Više knjiga istog dana prati redosled završavanja. Oznaka smene je opciona. Na „Završi knjigu“ sačuvaj snimak i omogući PDF download bez trajnog čuvanja PDF fajla. Naredna knjiga preuzima stanja kada se otvori. Korisnik može uređivati poslednjih 5 završenih; starije su privremeno u bazi. Retroaktivna izmena jedne knjige NE KASKADIRA u kasnije knjige. Inventar = poslednje potvrđeno stanje i datum; bez upozorenja na minimum i normativa. Proveri istorijske nazive artikala, ručne ispravke i PDF na zahtev. Za još otvoreno pitanje istovremene promene ručnih polja primeni dogovor iz odeljka E.

**Testovi:** prvi unos, nepromenjen artikal sa 0 kroz 10 knjiga, nova nabavka, računanje iz utroška, računanje iz stanja, ručno menjanje prethodnog, decimalne jedinice, negativna/neispravna količina, više knjiga istog datuma prenosi stanje redom završavanja, pokušaj nove knjige za prethodnu sredu posle petka je odbijen, preuzimanje PDF-a, izmena poslednje i pete knjige, šesta/starija je samo u bazi, izmena stare ne menja novije, obrisan artikal ostaje u starim snimcima, restart/refresh bez gubitka.

### FAZA 6 — IZVEŠTAJI: POVUČENO / PINNED IDEA

Van trenutnog pilota prema odluci vlasnika 22.11.2026. Implementacija je uklonjena; ne pokretati ovu fazu niti ponovo uvoditi njenu logiku u Fazi 7 ili stabilizaciji. Ponovno planiranje zahteva novu odluku vlasnika.

### FAZA 7 — MENADŽERSKI DASHBOARD

**Aktuelna odluka vlasnika:** jednostavan operativni ekran, bez izveštaja. Po završetku ostaviti rezultat za lični pregled. Tek posle pregleda i posebnog zahteva ide završni commit/push pre Faze 8 (stabilizacija i ispravke). Ne raditi automatski push niti odmah prelaziti na stabilizaciju.

**Prompt:**

> Na postojećem dashboardu dodaj samo balansirani operativni pregled. Redosled: gornje kartice (danas na rasporedu, evidentirani sati, iznos poslednjeg pojedinačnog unosa pazara i datum na koji se odnosi, poslednja knjiga i datum), brze akcije za aktivne module, aktivni podsetnici, a ISPOD njih postojeća komponenta rasporeda u njenom sadašnjem obliku. Ako modul nije uključen, njegove kartice/akcije uopšte ne postoje i ostali elementi lepo popunjavaju prostor. NEMA prikaza ukupnih plata, odnosa rada i pazara, mesečnog/nedeljnog profita ni punog poslovnog pregleda na početnom ekranu. Ne menjaj logiku rasporeda.

**Testovi:** svi moduli uključeni, samo raspored uključen, uski ekran, bez pazara, bez knjiga, bez podsetnika, postojeći raspored bez regresije, brze akcije vode u odgovarajuće module.

### FAZA 8 — STABILIZACIJA I PILOT-SPREMNOST

**Prompt:**

> Uradi finalni integracioni pregled svih odobrenih faza bez dodavanja novih funkcija. Proveri regresije rasporeda, pristup svakom lokalu, zaštitu osetljivih podataka na ograničenom linku, audit izmene, migracije, PDF izvoz, arhivu i reset perioda, vremenske zone, sigurnosne kopije/povratak. Napravi checklist za četiri pilot-lokala i uputstvo za ručni onboarding koji osnivači rade lično. Ne radi masovni redesign. Daj spisak blokera i preporučeni redosled ispravki, pa traži odobrenje za svaku širu izmenu.

**Testovi:** smoke test svih glavnih ekrana, refresh, prazni podaci, slučajevi sa više lokala, više knjiga, neuspele mrežne operacije, rollback migracije i recovery plan, osnovna pristupačnost.

---

## E. OTVORENE ODLUKE — NE IZMIŠLJAJ REŠENJE

1. **Nepotpuni period sa fiksnom mesečnom platom.** Potrebno poslovno pravilo pre implementacije te grane.
2. **Pauze i noćne smene.** Van trenutnog opsega.
3. **Rounding/preciznost sati, novca i količina.** Uskladiti sa postojećim projektom i vlasnikom pre puštanja.
4. **Konflikt pri izmeni više ručnih polja knjige šanka.** Pre koda predstaviti konkretno UX pravilo i izračunavanje, pa sačekati odluku.
5. **Rok čuvanja knjiga starijih od 5.** Privremeno čuvanje je dogovoreno, automatsko brisanje nije.
6. **Koja je tačno aktuelna auth/DB arhitektura?** Proveriti repo, bez pretpostavki.
7. **Pravni format dokumenata / obaveze evidencije.** PDF je interna evidencija za potpis, ne garantuje usklađenost sa propisima; proveriti posebno ako se koristi kao zvanični dokument.
8. **Cena:** jedan paket ~20 EUR ili 15/25 EUR se odlučuje kasnije; nema sada billing razvoja.

---

## F. KONTROLNA LISTA PRED SVAKU PROMENU

- [ ] Čitao sam trenutni repozitorijum i log, nisam pogađao stack.
- [ ] Raspored ostaje neizmenjen osim neophodne integracije, sa testom regresije.
- [ ] Ova izmena je striktno unutar jedne odobrene faze.
- [ ] Novi podaci su vezani za pravi lokal i nisu dostupni tuđem lokalu.
- [ ] Novi moduli ne cure u postojeći ograničeni link.
- [ ] Isključivanje modula ne briše podatke.
- [ ] Ne gube se prethodni obračuni/knjige nakon izmene konfiguracije.
- [ ] PDF export ne zahteva trajno skladištenje PDF fajlova.
- [ ] Testirao sam prazna/nepotpuna stanja i dupli klik/zahtev.
- [ ] Testovi su pokrenuti ili je jasno napisano zašto nisu.
- [ ] Rezultat i provere su zabeleženi za pregled. Sledeću fazu ili push pokreće vlasnik posebnom porukom.

**Krajnje pravilo:** Bolje jedan stabilan, testiran modul koji je vlasnik odobrio nego pet novih odjednom. Vlasnik projekta određuje prelazak sa faze na fazu.
