# ShiftFlow — dorade prema anotacijama

Dogovoreno: 23. novembra 2026.

Status: celine 1–3 su završene i pushovane kao `UI - 1` (`cf46f28`), `UI - 2` (`8fcaacd`) i `UI - 3` (`83c4a66`). Celina 4 je implementirana i proverena; korisnik je odobrio commit/push `UI - 4`.

## Način rada i nastavak

Sve izmene mogu da se rade u istom chatu, u lokalnom projektu `C:\Users\Cebo\Documents\shift-flow-basic-main`. Prelazak u VS Code ekstenziju nije potreban.

Raditi kroz četiri uzastopne, zasebno proverljive celine:

1. UI i podešavanja.
2. Označavanje postojećeg unosa.
3. Kopiranje potreba tima.
4. Raznovrsnije generisanje rasporeda.

Pre svake celine pregledati trenutno radno stablo i sačuvati postojeće izmene. Pročitati `AGENTS.md` i relevantni instalirani Next.js vodič pre pisanja koda. Posle svake celine pregledati diff i rezultate provera pre prelaska na sledeću.

Osnov za anotacije je projekat posle commita `08aa1ea` (`UI finish`). Ne vraćati radno stablo na taj commit ako u međuvremenu postoje nove izmene. U trenutku zapisivanja plana već postoji izmena `next-env.d.ts` nastala uz aktivni dev pregled; ne prepisivati je kao deo čuvanja ovog dokumenta.

Ovaj dokument beleži 21 prvobitni komentar i naknadno dodat komentar 22 o generatoru. Broj 21 već pripada prijavi/odjavi.

## 1. UI i podešavanja

### Uklanjanje suvišnih tekstova

Ukloniti sledeće označene elemente samo na navedenim mestima, bez globalnog uklanjanja istih reči iz drugih modula:

| Komentar | Mesto | Ukloniti |
| --- | --- | --- |
| 1 | Pregled, kartica popunjenosti | „Sva mesta su popunjena“ |
| 2 | Pregled, broj zaposlenih danas | „zaposlenih“ ispod brojke |
| 3 | Pregled, svi aktivni podsetnici | „sa rokom“ |
| 4 | Pregled, broj dospelih podsetnika | „Nema dospelih podsetnika“ ispod nule |
| 5 | Pregled, aktivni podsetnici | „Najbliži rokovi na jednom mestu“ |
| 6 | Pregled, ugrađeni raspored | „Pregledajte i uredite izabranu nedelju.“ |
| 7 | Zaposleni, fusnota | „Zaposleni se vode kao evidencija i ne moraju da imaju korisnički nalog.“ |
| 8 | Dostupnost, zaglavlje | Oznaku „Europe/Belgrade“ |
| 9 | Dostupnost, opis | „Kliknite na dan da promenite dostupnost. Pravila se ponavljaju svake nedelje.“ |
| 14 | Podešavanja, pozicije | „Pozicija „Menadžer“ ne daje pristup nalogu.“ |
| 16 | Podešavanja artikala | „Početno stanje važi dok artikal nema potvrđen inventar.“ |

Zadržati brojke, naslove, upozorenja, greške i informacije o nedostupnim podacima. Uklanjanje teksta iz komentara 1 ne uklanja prikaz nedostajućih mesta. Komentar 4 ne zahteva uklanjanje drugih praznih stanja ili poruka o grešci u Notes modulu.

### Indeks, moduli i raspored kartica

- **Komentar 11:** sve linkove indeksa podešavanja prikazati kao jednobojne, neutralne dugmiće sa tankim okvirom, u urednoj mreži koja se prilagođava telefonu. Zadržati navigaciju i fokus do stvarno postojećih sekcija.
- **Komentar 12:** ukloniti obavezni „Raspored“ iz prikazanog izbora modula. Modul ostaje uključen u podacima i postojećoj logici; ne uklanjati ga iz registra modula niti menjati obaveznost.
- **Komentar 13:** ukloniti stalnu uspešnu poruku „Izbor je sačuvan.“ Zadržati prikaz učitavanja, čuvanja, greške i ponovnog pokušaja.
- **Komentar 15:** pozicije, dodavanje smene i potrebe izabrane nedelje prikazati kao sekcije pune širine, jednu ispod druge, i na desktopu. Ne dodavati sadržaj samo radi popunjavanja prostora.
- **Komentar 17:** naslove sekcija i podsekcija u Podešavanjima istaći postojećom prigušenom zelenom. Očuvati hijerarhiju naslova i kontrast u obe teme; ne bojiti sve oznake polja i običan tekst kao naslove.
- **Komentari 18–19:** ukloniti informativne panele „Podešavanja Notes i podsetnika“ i „Podešavanja pazara“, kao i njihove linkove u indeksu. Funkcionalnost oba modula ostaje ista. To nisu izmenjiva podešavanja.

### Prijava i odjava — komentar 21

- U gornju traku dodati vidljivo dugme „Prijava“ za neprijavljenog korisnika, odnosno korisnički meni sa odjavom za prijavljenog.
- Kontrola mora biti dostupna na telefonu i desktopu.
- Koristiti postojeći obrazac prijave i postojeći postupak odjave, uključujući proveru nesačuvanih promena i prikaz greške ako odjava ne može da se završi.
- Radnički pristup zadržava svoja ograničenja. Ne uvoditi nove privilegije ili novi postupak autentifikacije.

## 2. Jednostavniji unos — komentar 20

Korisnik je posle razjašnjenja izabrao **označavanje postojeće vrednosti**, umesto pražnjenja polja i vraćanja stare vrednosti.

- Pri ulasku u brojčano polje ili kratak tekstualni unos označiti postojeću vrednost, tako da je prvi ukucani znak zameni.
- Obuhvatiti iznose, količine, sate, broj ljudi, nazive i kratke oznake kroz zajednički pomoćni mehanizam. Obuhvatiti i brojčane unose koji tehnički koriste tekstualno polje sa `inputMode="decimal"`.
- Izuzeti pretragu, duge beleške/napomene, datume, vremena, prijavu, kao i zaključana i neizmenjiva polja. Postojeće ponašanje polja za kopiranje linkova ostaje isto.
- Označavati jednom pri dobijanju fokusa; naredni klikovi unutar istog polja omogućavaju normalno postavljanje kursora.
- Fokus ne menja vrednost i ne pokreće čuvanje. Ne menjati tipove polja, validaciju, preciznost ni razliku između praznog unosa i nule.
- Posebno proveriti miša, Tab i dodir. Ne uvoditi globalno pražnjenje preko `onChange`, jer neka polja odmah čuvaju promenu i praznu vrednost pretvaraju u nulu.

Provera izvodljivosti tokom planiranja: u instaliranom Google Chrome-u prvi ukucani znak zamenio je ceo označeni unos i za `type="number"` i za tekstualno polje sa decimalnim unosom. To ne zamenjuje proveru stvarnih obrazaca i mobilnog prikaza.

## 3. Kopiranje potreba tima — komentar 10

Korisnik bira jednostavno kopiranje i naknadno pojedinačno uređivanje, bez trajno povezanog zajedničkog obrasca i novog sistema izuzetaka.

- Uz svaki dan dodati akciju **„Kopiraj na ostale dane“**.
- Kopirati broj ljudi za sve postojeće smene i pozicije izvornog dana na ostalih šest dana. Izvorni dan ostaje isti; postojeće vrednosti ciljnih dana se zamenjuju. Jasno naznačiti ovu posledicu uz akciju.
- Akciju ponuditi i za osnovni nedeljni obrazac u Pravilima rada i u editoru potreba samo za izabranu nedelju u Podešavanjima.
- Kopiranje predstavlja jednu sačuvanu izmenu koju je moguće poništiti. Posle kopiranja svaki dan može nezavisno da se uređuje.
- Redovna subota sa više zaposlenih uređuje se u osnovnom obrascu; jednokratna promena u potrebama izabrane nedelje. Time su dostupne obe tražene vrste izuzetka.
- Koristiti postojeće `requirements` i `requirementOverrides` strukture. Ne uvoditi migraciju ili novu baznu šemu.
- Sačuvane potrebe ne menjaju već generisani raspored dok korisnik ponovo ne pokrene generisanje. Očuvati pravila o danima korišćenja smene i postojeće granice brojčanih unosa.

## 4. Raznovrsnije generisanje — komentar 22

Trenutni generator je namerno determinističan. Korisnik želi novu kombinaciju pri svakom pokretanju generisanja, bez posebnog dodatnog dugmeta.

- Svako korisničko pokretanje generisanja dobija novo slučajno seme za izbor između dozvoljenih kandidata.
- Generator u `src/lib/scheduler.ts` proširiti opcionim parametrom semena. Isti ulaz i isto seme daju isti rezultat, radi pouzdanih testova; postojeći pozivi bez semena zadržavaju determinističko ponašanje.
- Zadržati proveru dostupnosti, pozicija, odmora, fonda sati, preklapanja, potreba tima i pravila za susedne nedelje.
- Popunjenost i kvalitet raspodele ostaju važniji od raznovrsnosti. Nasumični izbor ne sme da zaobiđe postojeće zabrane.
- Zaključane smene čuvaju se kada je uključena postojeća opcija „Zadrži zaključane smene“.
- Željena smena ostaje prednost, bez novog pravila „isključivo ova smena“. Korisnik je izričito izabrao zadržavanje sadašnje želje.
- Zaključavanje važi za konkretnu smenu u konkretnom rasporedu; ne pretvarati ga u trajno ograničenje zaposlenog za sve buduće nedelje.
- Drugačiji raspored nije garantovan kada ograničenja ostavljaju samo jedno dozvoljeno rešenje. Ne uvoditi istorijsko balansiranje između nedelja niti novu baznu šemu.
- Zadržati postojeće ručno uređivanje, poništavanje generisanja, objavljivanje i prava pristupa.

## Provere i kriterijumi prihvatanja

### UI i pristup

- Proveriti 390 × 844 i 1440 × 900, obe teme, tastaturu, dodir, prazna/popunjena stanja i navigaciju do svih preostalih sekcija.
- Proveriti minimalan i proširen izbor modula: indeks ne sme sadržati linkove ka uklonjenim ili nevidljivim sekcijama.
- Potvrditi da obavezni Raspored i dalje radi, a greške čuvanja modula ostaju vidljive.
- Proveriti otvaranje postojeće prijave iz gornje trake, prikaz prijavljenog korisnika i postojeće bezbedno ponašanje odjave. Ne praviti stvarne naloge ili produkcione upise radi testiranja.

### Unos

- Proveriti zamenu vrednosti prvim znakom, slučajan fokus bez izmene, normalno naknadno postavljanje kursora i izostanak automatskog upisa pri označavanju.
- Obuhvatiti kontrolisana i nekontrolisana polja, brojčane i decimalne tekstualne unose, nulu, prazan unos i validacione granice.
- Potvrditi da izuzeta polja ostaju standardna.

### Potrebe tima

- Proveriti trajnost kopiranja posle reload-a, nulte i različite vrednosti ciljnih dana, pojedinačne izmene posle kopiranja i poništavanje cele operacije.
- Proveriti razdvojenost osnovnog i nedeljnog obrasca, postojeće ograničenje dana korišćenja smena i očuvanje već generisanih rasporeda.

### Generator

- Testirati ponovljivost istog semena i očuvanje determinističkog ponašanja poziva bez semena.
- Na test primeru sa više dozvoljenih rešenja potvrditi različite rasporede kroz više semena; ne zasnivati test na neponovljivom slučajnom rezultatu.
- Proveriti zaključavanje, popunjenost, raspodelu sati, željene smene, nedostupnost, ograničenja odmora i susedne nedelje.
- Potvrditi da raznovrsnost ne uvodi blokirajuće konflikte i ne prikriva nedostajuća mesta kada zahtev nije moguće ispuniti.

### Završna provera i predaja

- Koristiti izolovane demo/test podatke za sve upise.
- Sačuvati snimke pre i posle, pregledan diff, rezultate i ograničenja provera.
- Pokrenuti postojeće testove, TypeScript i produkcioni build preko postojećih repozitorijumskih skripti.
- Postojeći lokalni server ostaje dostupan za korisnikov pregled; ne pokretati dodatne servere bez potrebe.
- Ovaj dogovor obuhvata lokalnu implementaciju kada korisnik zatraži nastavak. Samo zapisivanje plana ne odobrava implementaciju, novi commit ili push. Novi commit i push zahtevaju poseban zahtev.

## Praćenje napretka

- [x] Razjašnjene anotacije i sačuvan plan.
- [x] Celina 1: UI i podešavanja — završeno, pregledano i odobreno; isporuka `UI - 1`.
- [x] Celina 2: označavanje postojećeg unosa — završeno i pushovano kao `UI - 2` (`8fcaacd`).
- [x] Celina 3: kopiranje potreba tima — završeno i pushovano kao `UI - 3` (`83c4a66`).
- [x] Celina 4: raznovrsnije generisanje — završeno i provereno; odobrena isporuka `UI - 4`.
- [x] Završni pregled diffa, snimaka, testova, TypeScript-a i builda — poslednja celina: 70/70 testova, check/build i browser provere.

Pri nastavku ažurirati ovaj spisak prema stvarno završenom radu i zabeležiti eventualne nove dogovore, bez pretpostavljanja da je neoznačena celina implementirana.

## Pregled celine 1 — 23. novembar 2026.

- Implementirani su samo komentari iz prve celine. Koraci 2–4 ostaju za kasnije.
- Prošlo je 61/61 testova, TypeScript i produkcioni build.
- Chrome provere: 390 × 844 i 1440 × 900, obe teme, uklonjeni opisi, raspored sekcija, fokus linkova indeksa, minimalni/prošireni izbor modula, trajnost izbora i vidljivost greške, otvaranje prijave.
- Upisi tokom provera koriste izolovane demo profile. Novi test proverava blokiranje duple odjave, prikaz neuspele odjave i mogućnost ponovnog pokušaja.
- Snimci, test skripta, logovi i pregled izmena nalaze se u `artifacts/ui-1/`.
- Preview na portu 3000 ostaje dostupan korisniku.
- Korisnik je pregledao i odobrio rezultat i izričito zatražio commit/push sa porukom `UI - 1`.
- Sledeći chat nastavlja samo celinu 2; korisnik dobija handoff kao prompt za kopiranje, bez zasebnog handoff fajla.

## Pregled celine 2 — 23. novembar 2026.

- Implementiran je zajednički `selectOnFocus` mehanizam, izričito dodat brojčanim poljima, decimalnim tekstualnim unosima, nazivima i kratkim oznakama u rasporedu, zaposlenima, pravilima rada, podešavanjima, pazaru, obračunu i knjizi šanka.
- Fokus samo označava vrednost. Prvi znak je zamenjuje; naredni klik/dodir omogućava kursor. Sačuvani su tipovi, postojeći handleri, validacija, preciznost i postojeće tumačenje praznog unosa/nule. Pretraga, napomene, datumi/vremena, prijava, readonly/disabled polja i selekcija linkova ostaju izuzeti.
- Chrome provere u izolovanim profilima: 1440 × 900 i 390 × 844, svetla/tamna tema, miš i emulirani dodir, Tab/Shift+Tab, autofocus u dijalogu zaposlenog, kontrolisani i nekontrolisani unosi, nula/prazno/decimale, postojeće granice. Nije rađena provera na fizičkom telefonu ili u Safari-ju.
- Automatsko čuvanje potreba: fokus i izlazak iz polja nisu promenili skladište; unos pravi tačno jednu istorijsku stavku i opstaje posle reload-a. Provereno i postojeće ograničavanje vrednosti na 0–20. Koraci 3 i 4 nisu menjani.
- Prošlo je 61/61 testova, `npm run check` i `npm run build`. Snimci, ponovljiva browser skripta, logovi, pregled diffa i izveštaj su u `artifacts/ui-2/`.
- Sačuvane su zatečene lokalne izmene, uključujući obrisani handoff i automatske `.next/dev/types` putanje. Handoff nije vraćen.
- Preview ostaje na portu 3000 kao statički produkcioni build. Next dev je pri ponovljenim reload-ima povremeno prijavljivao internu grešku „Router action dispatched before initialization“ i posle restarta; završni browser prolaz nad produkcionim preview-om prolazi bez grešaka. Preview ne osvežava buduće izmene koda automatski. Nema novog commita ili push-a; potreban je korisnički pregled i posebno odobrenje.

- Naknadni dogovor: korisnik je odobrio commit/push celine 2 kao `UI - 2`, zatim implementaciju i zaseban commit/push celine 3 kao `UI - 3`. Celina 4 ostaje van ovog zahteva.

## Pregled celine 3 — 23. novembar 2026.

- Dodata je akcija „Kopiraj na ostale dane“ uz svaki dan u osnovnom obrascu (Pravila rada) i potrebama izabrane nedelje (Podešavanja), sa upozorenjem da zamenjuje potrebe ostalih šest dana i uputstvom za poništavanje.
- Jedan klik čuva jednu izmenu kroz postojeću istoriju. Kopira sve postojeće smene i pozicije, uključujući nulu i podrazumevanu nulu za nedostajuće vrednosti; izvor ostaje isti, a dani se zatim uređuju nezavisno.
- Kopiranje poštuje dozvoljene dane korišćenja smena. Smena neaktivna izvornog dana prenosi nulu na dozvoljene ciljne dane; ne pravi potrebe na danima kojima smena ne pripada. Zapisi van trenutnog editora ostaju sačuvani.
- Osnovni obrazac i `requirementOverrides` za konkretnu nedelju ostaju razdvojeni, kao i ostale nedelje. Postojeći rasporedi i njihovi snimci potreba ostaju nepromenjeni do novog generisanja. Nema migracije, promene validacionih granica ili izmena generatora.
- Prošlo je 65/65 testova (četiri nova testa kopiranja/istorije), `npm run check` i `npm run build`.
- Browser provere: Chrome 390 × 844 i 1440 × 900, obe teme; tastatura/Enter i emulirani dodir; oba editora, nula/20/prilagođena pozicija, ograničeni dani smene, jedna istorijska stavka, reload, undo/redo i naknadna nezavisna izmena jednog dana. Isključivo izolovani demo profili, bez produkcionih upisa.
- Dokazi su u `artifacts/ui-3/`: skripta i demo primer, snimci pre/posle kopiranja, rezultati, logovi i pregledan diff. Nije testiran fizički telefon/Safari.
- Preview na portu 3000 i dalje poslužuje uspešan produkcioni build; sad sadrži korak 3. Korisnik je izričito odobrio zaseban commit/push `UI - 3` odmah po implementaciji i proverama. Korak 4 ostaje za kasnije.

## Pregled celine 4 — 23. novembar 2026.

- Svako korisničko pokretanje generatora dobija novo 32-bitno seme preko `crypto.getRandomValues`. Nema novog dugmeta ili podešavanja.
- `generateSchedule` prima opciono četvrto polje `seed`. Isti ulaz i seme daju isti rezultat; bez semena rezultat ostaje identičan prethodnom generatoru (potvrđen tačnim regresionim otiskom).
- Zadržano je svih 36 dosadašnjih pokušaja i dodato 36 pokušaja sa semenom. Nasumičan izbor među jednakim ocenama koristi lokalni reproduktivan PRNG. Rezultat se bira istim redosledom merila: nepopunjena mesta, konflikti, raspodela fonda sati, željene smene; seme ne može da izabere lošiji rezultat od najbolje prethodne ocene.
- Sve provere dozvoljenosti ostaju iste. Zaključane smene ostaju iste kada je opcija uključena; opcija isključena omogućava ponovno generisanje svega. Zaključavanje se ne prenosi u druge nedelje, a željena smena ostaje preferenca.
- Poruka posle generisanja sada koristi potrebe novog rasporeda, uključujući nedeljne izuzetke i dane korišćenja smena, da broj preostalih mesta bude tačan.
- Prošlo je 70/70 testova (pet novih za seme, raznovrsnost, kvalitet, zabrane i zaključavanje), `npm run check` i `npm run build`. Na izolovanom demo primeru 12 fiksnih semena daje 12 različitih potpuno popunjenih rasporeda, bez blokirajućih konflikata. Isti rezultat je očekivan kada postoji samo jedno dozvoljeno rešenje.
- Chrome provere pre/posle: 390 × 844 i 1440 × 900, obe teme; tastatura i emulirani dodir, novo seme po pokretanju, tačni rezultati za kontrolisana semena, zaključavanje uključeno/isključeno, jedna istorijska stavka po generisanju, reload, undo/redo, dozvoljena objava kompletnog nacrta i blokirana objava nepopunjenog nedeljnog izuzetka uz tačan broj praznih mesta. Nema stvarnih naloga/upisa.
- Dokazi i pregledan diff su u `artifacts/ui-4/`. Nije proveravan fizički telefon ili Safari. Generator ima dvostruko više pokušaja kada dobije seme; merenja demo primera su u `metrics.json`.
- Preview ostaje na `http://localhost:3000` kao osvežen produkcioni build. Korisnik je naknadno izričito odobrio commit/push koraka 4 kao `UI - 4`.
