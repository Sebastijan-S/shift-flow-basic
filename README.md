# ShiftFlow Basic

Next.js, TypeScript, Supabase PostgreSQL/Auth/RLS i postojeći Tailwind/UI sistem. Premium funkcije nisu uključene.

## Pokretanje

Node.js 24.22.1 (`.node-version`) i pnpm 11.25.0 (`packageManager`). Posle preuzimanja pokrenuti `pnpm install --frozen-lockfile`. Kopirati .env.example u .env.local i uneti NEXT_PUBLIC_SUPABASE_URL i NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Javne vrednosti se ugrađuju tokom statičkog builda; tajni administrativni ključ nije deo klijenta.

- pnpm dev — lokalna aplikacija na http://127.0.0.1:3000
- pnpm exec tsc --noEmit --incremental false — TypeScript
- pnpm test — generator, istorija, konkurentno čuvanje i PostgreSQL integracija
- pnpm build — produkcioni statički izlaz u out/

scripts/next.mjs normalizuje Windows putanje. Zadržan je statički export; Supabase je zaseban backend.

Za objavljivanje preko GitHub-a i Cloudflare Pages pogledati [CLOUDFLARE.md](CLOUDFLARE.md).

## Urađeno za Basic

- Izolovan demo sa 10 zaposlenih, 42 smene i 336 sati; nova firma počinje prazna.
- Prilagođene pozicije, više pozicija po zaposlenom, deaktiviranje, cilj sati i opcioni lični maksimum.
- Dodavanje smena, boja, vremena i dana upotrebe; dodele čuvaju svoja vremena i mogu se pojedinačno menjati.
- Nedeljna, datumska i delimična dostupnost, odobrena odsustva, nedostupnost i želje za slobodnim danom. Zamena zaposlenog beleži prethodnu i novu osobu.
- Osnovne potrebe po danu/smeni/poziciji i izuzeci za izabranu nedelju/datume.
- Deterministički generator sa 36 prolaza, jedinstvenim ID-jevima i očuvanim zaključavanjima. Ne garantuje optimalno rešenje. Prioritet je broj popunjenih mesta, zatim konflikti i raspodela sati/preferencije.
- Brza izmena dodele i vremena, dupliranje jedne dodele, kopiranje nedelje, drag-and-drop, nedeljni/dnevni/list prikaz.
- Lokalni format 2 sa migracijom starog stanja; korisnik i firma imaju zaseban keš. Lokalna Undo istorija se ne šalje u cloud i ograničava se pri pisanju.
- Serijski autosave, trajni red nepotvrđenih upisa, idempotentni operation ID i tačan status potvrde. Nezavisne izmene se spajaju; poslednja prihvaćena izmena istog polja ostaje uz serverski audit. Brisanje naspram konkurentne izmene se ne prepisuje prećutno. Undo/Redo odbija prepisivanje novije promene istog polja.
- Poslednja objavljena verzija ostaje dostupna dok se priprema novi nacrt. Validne izmene objavljene nedelje osvežavaju njenu projekciju.
- Privatni tokeni važe 60 dana, mogu se rotirati i opozvati. Otvoren javni prikaz proverava izmene na 30 sekundi i pri fokusu.
- Poseban PNG/PDF prikaz tima bez internih napomena, odsustava, dostupnosti i ciljnog fonda. PDF koristi dijalog štampe pregledača.
- Vlasnik upravlja pristupom i nazivom firme; menadžer zaposlenima, pozicijama, pravilima i rasporedom. Korisnik može pripadati više objekata. Pozivni link je vezan za potvrđenu email adresu i važi 7 dana; email se ne šalje automatski.
- Vlasnik ili menadžer može da izda jedan radnički link po objektu za rad na rasporedu, generatoru, dostupnosti i odsustvima. Zamena odmah opoziva prethodni link, a link se može i zasebno opozvati. Radnički prikaz nema administrativne stranice ni dugme za objavljivanje. U bazi anonimna uloga nema direktan pristup tabelama; poseban RPC proverava hash linka pri svakom čitanju i upisu i odbija izmene drugih polja i novo objavljivanje.
- Vođena priprema objekta i eksplicitan početak 21 dana probe. Cena i limit zaposlenih nisu hardkodovani. Plaćeni nastavak zahteva pouzdanu administrativnu potvrdu prema dogovoru o pilotu.
- Serverska obaveštenja i korisničko stanje pročitano.

## Supabase

Povezan projekat: https://sbvicmcgghoshrghbybq.supabase.co. Migracije do `20261114224339_planner_access.sql` i nova `20261121081606_shiftflow_modules_and_pilot.sql` primenjene su kroz Supabase MCP. Ranija `20261117000000_planner_private_notes.sql` još nije primenjena na povezani projekat; njen SQL nije menjan u Fazi 1. Privilegovana implementacija je u private šemi; javni RPC-jevi su SECURITY INVOKER wrapperi sa tačno određenim dozvolama. Direktno pisanje tabela iz klijenta je zabranjeno. save_workspace_v2 atomski ažurira normalizovane podatke, dokument, audit i potvrdu operacije. Svaki upis proverava aktuelno članstvo.

Za praznu dodatnu bazu primeniti SQL fajlove iz supabase/migrations redom. Ne primenjivati ih ponovo na već podešen projekat. Imena ranijih lokalnih migracija usklađena su sa verzijama u povezanom projektu.

Migracija `20261114224339_planner_access.sql` je primenjena na povezani projekat. Za pregled interfejsa bez upisa u bazu, tokom `pnpm dev` otvoriti `http://127.0.0.1:3000/?planner-preview=1`. To koristi zaseban lokalni demo. Stvarne dozvole i opoziv pokriva izolovani PostgreSQL test `tests/planner-access.test.ts`.

U Supabase Auth podesiti Site URL i dozvoljene redirect adrese za produkcioni domen i lokalni razvoj. Email potvrda se poštuje. Vlasnik se registruje u aplikaciji; Supabase platform nalog nije isti nalog kao korisnik ShiftFlow-a.

Hosting publika ostaje kao na postojećem Site-u. Za linkove zaposlenih bez prijave i spoljne menadžere potrebno je da sama stranica aplikacije bude dostupna toj publici; RLS i privatni tokeni zasebno štite poslovne podatke.

## Provere i preostale pilot odluke

### Faza 1 — modularna osnova i pilot (prihvaćena; commit ca83193)

- `src/lib/modules.ts` je registar modula sa odvojenim izborom lokala i dostupnošću implementacije. Raspored je obavezan; postojeći Pregled je podrazumevano uključen. Budući moduli su podrazumevano isključeni i označeni „U pripremi“. Njihov izbor može da se sačuva, ali se ne pojavljuju u meniju dok nisu implementirani. Nova faza povezuje stvarni ekran i njegova podešavanja sa istim registrom.
- Podešavanja se čuvaju po lokalu u `company_modules`, preko `set_company_module`, uz evidenciju promena u `company_module_changes`. Vlasnik i postojeći menadžer koriste isti model članstva. Promena izbora ne piše u dokument rasporeda i ne briše podatke modula. Ograničeni link ne može pristupiti tim tabelama/RPC-ju. Demo koristi zaseban lokalni ključ `shiftflow:demo:modules:v1`; cloud podešavanja se ne prepisuju demo izborom.
- Status `pilot` nema `trial_ends_at`, odbrojavanje ili automatsku blokadu upisa. Postojeći statusi i obična proba od 21 dan ostaju podržani. Nijedan postojeći lokal nije automatski prebačen u pilot, a novi nalog ne može sam sebi dodeliti pilot status.
- Nove zavisnosti i env promene nisu potrebne. Nova migracija je primenjena na povezanu bazu; na praznoj bazi primenjuju se svi SQL fajlovi redom. Pre primene ranijih nedostajućih migracija na postojeću bazu proveriti stvarnu istoriju.

Osnivači pri ručnom podešavanju izabranog pilot-lokala, preko pouzdane administracije/SQL Editora, postavljaju sledeće vrednosti (zameniti `LOKAL_UUID` proverenim ID-jem jednog lokala):

```sql
update public.companies
set access_status = 'pilot', trial_ends_at = null
where id = 'LOKAL_UUID'::uuid
returning id, name, access_status, trial_ends_at;
```

Stari datum početka probe može ostati kao istorijski podatak. Ova operacija ne menja raspored ili pristupne linkove. Vraćanje aplikacije na prethodni frontend ne zahteva brisanje novih tabela; sačuvati izbore i audit, a status pilot-lokala ne vraćati na isteklu probu.

Provere Faze 1: 22/22 automatska testa, TypeScript i produkcioni statički build prolaze. Testovi koriste izolovani PostgreSQL/PGlite, uključuju četiri lokala, upise vlasnika i menadžera, opozvano članstvo, pogrešne unose, zabranu direktnog/anonimnog pisanja i pilot upise vlasnika/planera nakon 21 dana. Chrome demo provera obuhvata isključivanje Pregleda, osvežavanje bez gubitka izbora ili rasporeda i čuvanje izbora budućeg modula bez nove stavke u meniju. Lokalni planner-preview prikazuje samo Raspored i Dostupnost. UI sa stvarnim prijavljenim vlasnikom/menadžerom i stvarnim pilot-lokalom još nije ručno proveren. Supabase advisor zadržava upozorenja o anonymous sign-in politikama (članstvo se ipak proverava) i ranije upozorenje o zaštiti lozinki; anonimna DB uloga nema pristup novim tabelama.

Komande provere (direktne Node komande rade i kada `pnpm` nije u PATH-u):

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/tsx/dist/cli.mjs --test tests/*.test.ts
node scripts/next.mjs build --webpack
node scripts/next.mjs dev --webpack --hostname 127.0.0.1
```

Ručna provera: u Podešavanja → Moduli lokala isključiti Pregled (nestaje iz menija), osvežiti stranicu (izbor ostaje), ponovo ga uključiti (vraća se), uključiti modul u pripremi (izbor ostaje bez prazne stranice), zatim proveriti postojeći raspored i odsustva. Na drugom lokalu izbori moraju ostati nezavisni. Na stvarnom pilot-lokalu mora pisati „Pilot je aktivan“, bez roka, uz uspešno čuvanje i preko planerskog linka.

Automatski testovi obuhvataju četiri izolovana objekta, zabrane pristupa, atomske upise i ponavljanje istog zahteva, datumsko odsustvo, noćni rad, duple ID-jeve uz zaključavanje, istorijska vremena/objave, poziv postojećem korisniku, prava menadžera, privatnost linka i sporo/neuspešno čuvanje. Auth se u PostgreSQL testovima simulira; stvarna registracija, email potvrda i svakodnevni rad više korisnika proveravaju se na stvarnim nalozima.

Za pilot ostaju merenje toka ispod pet minuta u četiri stvarna objekta, doterivanje inline/cascading menija, mobilnog prevlačenja i grupnih korekcija prema posmatranju, pregled zastarelih offline promena istog polja pre njihovog ponovnog slanja, naprednija raspodela vikenda kroz više nedelja i konačna pravila naplate/čuvanja podataka. Automatska naplata nije uvedena. Promene računanja vremena (DST) za planirane sate nisu zasebno obrađene; trajanje se računa po lokalnim časovima.

### Faza 2 — radni sati i obračun (21.11.2026, prihvaćena za commit/push)

Modul `hours` je dostupan preko postojećeg registra. Uključuje se u Podešavanja → Moduli lokala, dobija svoj meni i svoja podešavanja cene rada. Isključivanje skriva ekran i podešavanja, a podaci ostaju u bazi. Ograničeni planerski pristup nema ovaj ekran, finansijske podatke niti dozvolu za nove RPC-jeve.

Prvi period se otvara sa izabranim početkom. Menadžer izričito preuzima/osvežava smene od početka perioda do izabranog datuma (najkasnije danas). Uvoz koristi sačuvani raspored, uključujući pojedinačna vremena dodela. Ručne ispravke odrađenih sati ostaju pri ponovnom uvozu, čak i ako se planirana smena promeni ili obriše. Nula sati na smeni znači da nije odrađena i ne ulazi u broj odrađenih smena. Raspored, odsustva i sinhronizacija koriste postojeći tok; finansijski dokumenti su zasebni.

Odluke vlasnika tokom Faze 2:

- Zbir vremena svakog zaposlenog u periodu zaokružuje se na najbliži ceo sat, od 30 minuta naviše; ne zaokružuje se svaka smena zasebno. Izvorni minuti ostaju za pregled i istoriju. Ovo ne menja planirane sate postojećeg rasporeda.
- Valuta je RSD, dve decimale. Cene i iznosi se čuvaju/računaju kao celobrojne pare; nema računanja novca decimalnim JavaScript brojevima.
- Svaki zaposleni ima individualnu cenu i metod: po satu (podrazumevano), po odrađenoj smeni ili fiksna mesečna plata. Podrazumevana cena je 0 RSD, jasno vidljiva pre zaključavanja.
- Za fiksnu platu u nepotpunom kalendarskom mesecu menadžer izričito unosi iznos za taj period; i 0 je dozvoljen eksplicitan unos. Bez unosa zaključavanje celog tima se odbija. Za potpun kalendarski mesec koristi se podešena mesečna plata.
- Na dodatni izričit zahtev vlasnika uveden je ručni dodatni **iznos** za prekovremeni rad po zaposlenom. Nema posebne satnice ili automatskog računanja prekovremenog rada. Dodatak se prikazuje u istoriji/PDF-u i resetuje u novom periodu.

Posle isplate menadžer potvrđuje ceo tim jednom. Server u jednoj transakciji proverava verzije otvorenog obračuna i rasporeda, računa iznose, čuva neizmenjiv snimak i otvara sledeći period od narednog datuma sa nula sati i bez ručnih iznosa. Cene rada ostaju podešene. Ponavljanje zahteva za isti ID perioda vraća postojeći rezultat; ne zaključava novi period. Promena cene, imena ili rasporeda ne prepravlja istoriju. Prazni periodi su podržani; fiksna plata i tada prati gore navedeno pravilo.

PDF se generiše na zahtev iz zaključenog snimka, preko izolovanog dokumenta i Chrome dijaloga Štampa → Sačuvaj kao PDF, kao postojeći PDF rasporeda. Svaki zaposleni dobija stranu sa periodom, satima, metodom, cenom, osnovnim iznosom, dodatkom, ukupnim iznosom i mestom za potpis. Tekst izričito kaže da potpis potvrđuje sate i obračunati iznos, **ne prijem novca**. PDF se ne čuva na serveru; isti snimak se može ponovo izvesti.

Migracija `20261121084710_shiftflow_hours.sql` primenjena je na povezani projekat `sbvicmcgghoshrghbybq`; lokalno ime usklađeno je sa stvarnom verzijom iz Supabase istorije. Kreira `hours_ledgers`, `hours_snapshots`, `hours_changes`, javne SECURITY INVOKER RPC-jeve `read_hours`/`hours_command` i privilegovane funkcije u private šemi. RLS je uključen; direktna čitanja/upisi tabela nisu dozvoljeni ni prijavljenom klijentu. Svaki RPC proverava postojeće članstvo i uključen modul; upis proverava i status probe. Nema zavisnosti od neprimenjene `20261117000000_planner_private_notes.sql`; ona nije primenjena ni u ovoj fazi. Nema novih runtime zavisnosti ili env promena. Ne pokretati nekritički sve pending migracije nad povezanom bazom.

Završne provere Faze 2: `node node_modules/typescript/bin/tsc --noEmit --incremental false` — uspešno; `node node_modules/tsx/dist/cli.mjs --test tests/*.test.ts` — **26/26 prolazi**; `node scripts/next.mjs build --webpack` — uspešan statički produkcioni build; `git diff --check` — uspešno. Razvojni server pokrenut je komandom `node scripts/next.mjs dev --webpack --hostname 127.0.0.1` za Chrome proveru i zaustavljen pre završnog builda.

Automatske provere pokrivaju sve metode, različite cene, dve smene, granicu 29/30 minuta i zaokruživanje zbira, ručnu ispravku, dodatak, nepotpun/potpun mesec, atomsku potvrdu celog tima, rollback neuspelog zaključavanja, konkurentni dupli zahtev, istorijske iznose, prazan period/tim, zastarele verzije, promene rasporeda, menadžera/opozvano članstvo, tri lokala, zabranu anonimnog/direktnog pristupa, očuvanje pri isključivanju i ponovljen sadržaj dokumenta za potpis. SQL testovi rade i sa i bez stare neprimenjene migracije privatnih napomena. Auth se simulira u izolovanom PGlite PostgreSQL-u.

Chrome demo provera: aktivacija modula i njegovog menija, otvaranje perioda, uvoz 36 smena do 21.11, promena individualne satnice na 350,25 RSD, dodatak od 1.250,50 RSD, potvrda svih 10 zaposlenih, istorijski iznos 12.458,50 RSD za 32 h i novi period sa nula sati. Pri otvaranju PDF štampe Computer Use je prekinuo pristup jer nije mogao pouzdano utvrditi URL; vizuelna PDF provera i stvarno preuzimanje ostaju za ručnu proveru. UI sa stvarnim prijavljenim vlasnikom/menadžerom i drugim lokalom nije ručno proveren. Na povezanoj bazi provereni su primena migracije, uključeni RLS i zabrana anonimnog/direktnog pristupa; nisu kreirani testni obračuni stvarnih lokala. Advisor daje INFO za RLS bez politika na tri nove tabele (namerno: pristup samo preko RPC-ja); ranija auth upozorenja nisu menjana.

Ručna checklista za pregled:

1. Uključiti modul, otvoriti prvi period, podesiti različite metode/cene i preuzeti postojeći raspored. Raspored i odsustva moraju ostati isti.
2. Ispraviti sate jedne smene, promeniti njen raspored, ponoviti uvoz: ručno ispravljeni sati ostaju. Proveriti 7 h 29 min → 7 h i 7 h 30 min → 8 h na zbiru perioda.
3. Za nepotpun mesec fiksne plate ostaviti prazan iznos: zajednička potvrda nije dozvoljena. Uneti iznos i dodatak za prekovremeni rad, pa potvrditi ceo tim.
4. Proveriti sve članove istorijskog snimka i novi period sa nula sati. Ponovljen zahtev starog perioda ne pravi duplikat. Promeniti cenu rada/raspored: istorija ostaje ista.
5. Izvesti PDF dva puta, proveriti sve strane, dijakritiku, iznose i tekst o potpisu; sačuvati lokalno i proveriti štampu na A4.
6. Isključiti i ponovo uključiti modul, zatim osvežiti: istorija i cene ostaju. Na drugom lokalu nema prvog obračuna. Planerski link i dalje ima samo raspored/dostupnost.

Nema otvorenog poslovnog pitanja za nepotpun mesec, zaokruživanje ili valutu: rešena su odlukama iz ovog razgovora. Preostaju navedene ručne provere. Faza 3, avansi, evidencija isplate novca, bonusi/penali, pauze, dolasci, poseban noćni obračun, porezi, nove uloge i finansijski dashboard nisu uvedeni. Nije uveden implementacioni log; rezime ostaje ovde i u chatu. Nema commit/push akcije bez novog zahteva vlasnika.
