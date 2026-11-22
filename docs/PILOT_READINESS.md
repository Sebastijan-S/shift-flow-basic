# ShiftFlow — priprema četiri pilot-lokala

Datum: 22.11.2026. Obuhvat: odobrene Faze 1–5, povlačenje izveštaja i operativni dashboard. Ovo je operativno uputstvo za osnivače, ne implementacioni log.

## Status pre prvog rada

Automatske provere Faze 8 prolaze: 60 testova, TypeScript i produkcioni build. Testirani su izolacija lokala, menadžer, opozvano članstvo, ograničeni link, audit, zaključavanje/reset obračuna, knjige i lokalni oporavak. Dodati su testovi zakašnjelih zahteva tokom promene naloga/lokala, grešaka mreže i oštećenog reda izmena. Smoke provere koriste stvarni kod komponenti, simulirane servise/hook okruženje i statički React render; nisu zamena za klikove u Chrome-u.

Ostaju sledeće provere pre svakodnevnog rada sa stvarnim podacima, ovim redosledom:

1. **Browser i uređaji:** integrated browser i Chrome alat nisu dostupni („browser access host is unavailable“). Osnivač treba lično da potvrdi glavne tokove, tastaturu, 320/392 px, štampu/PDF paginaciju i mrežni prekid. Za automatsku vizuelnu proveru treba osposobiti browser access host za integrated browser ili povezani Google Chrome.
2. **Stvarna rezervna kopija:** potvrditi poslednju uspešnu kopiju Supabase projekta i probno vraćanje u odvojeno test okruženje. Faza 8 nije preuzimala produkcione podatke ni testirala produkcioni restore. PGlite backup/restore test potvrđuje samo izolovani PostgreSQL model.
3. **Auth podešavanja:** proveriti produkcioni Site URL, email redirect odredišta i prijavu vlasnika/menadžera. Supabase advisor i dalje prijavljuje isključenu zaštitu od kompromitovanih lozinki i postojeće RLS politike za authenticated ulogu koje mogu obuhvatiti anonimni Auth nalog. Članstvo se dodatno proverava; to upozorenje nije dokaz pristupa tuđem lokalu. Odluku o Auth podešavanjima proveriti u konzoli; u ovoj fazi nisu menjana.
4. **Potpis osnivača za svaki lokal:** tek nakon prolaska checkliste ispod dogovoriti početak stvarnog korišćenja. Nije rađeno masovno uključivanje modula, promena pilot statusa ili dodavanje probnih zapisa stvarnim lokalima.

## Ručni onboarding sa vlasnikom

1. Potvrditi identitet vlasnika, naziv i tačan ID jednog lokala. Vlasnik koristi svoj nalog; zaposleni ne moraju imati naloge. Ne prepisivati tuđe lokalne kopije u novi lokal.
2. U pouzdanoj administraciji proveriti da izabrani besplatni pilot ima `access_status = 'pilot'` i `trial_ends_at = null`. Ako nije, osnivač menja isključivo provereni ID prema SQL primeru u README-u. Proveriti poruku „Pilot je aktivan“, bez odbrojavanja. Ne pokretati 21 dan probe za pilot.
3. Sa vlasnikom uneti zaposlene, pozicije, smene, potrebe, limite i dostupnost/odsustva. Napraviti jednu nedelju, proveriti nedostajuća mesta i zabrane, generisati i ručno ispraviti smenu. Sačekati „Sinhronizovano“, osvežiti i proveriti sačuvano stanje.
4. Uključiti samo potrebne module. Isključivanje skriva ekran i čuva podatke. Izveštaji nisu opcija. Pregled je opcion, a raspored je uvek uključen.
5. Za sate dogovoriti stvarni početak otvorenog perioda i cenu/metod po zaposlenom. Preuzimanje rasporeda je eksplicitno. Nepotpuni mesec fiksne plate traži ručno potvrđen iznos. Zaključiti obračun tek kada je plata isplaćena i ceo tim proveren; time se čuva arhiva i otvara period sa nula sati. PDF potpis potvrđuje sate/iznos, ne prijem novca. Ne zaključivati stvarni period samo radi probe.
6. Za pazar objasniti datum prometa, opcionu smenu i nezavisne gotovinu/kartice. Bez zapisa nije nula. Više unosa istog dana je dozvoljeno; poslednji pojedinačni unos prati kreiranje, ne najveći datum prometa.
7. Za knjigu šanka potvrditi nazive, jedinice i početna stanja, uključujući artikle sa nulom. Otvoriti/sačuvati nacrt i pokazati izbor ručnog polja. Završenom knjigom potvrđuje se inventar; ispravka stare knjige ne menja kasnije knjige ni inventar. Poslednjih pet je dostupno za izmenu; starije ostaju u bazi. PDF se preuzima kroz dijalog štampe.
8. Dodati belešku i podsetnik na test lokalu ili odobren stvarni podsetnik. Pokazati rok u Europe/Belgrade, završavanje i ceo Notes modul. Nema spoljašnjih obaveštenja.
9. Ako je potreban menadžer, vlasnik pravi poziv za njegovu potvrđenu email adresu. Poseban link za planera daje samo raspored/dostupnost/odsustva. Deljeni objavljeni raspored daje samo prikaz tima. Linkove čuvati kao pristupne podatke; demonstraciju zamene/opoziva raditi na test lokalu da se ne prekine rad pilotu.
10. Zabeležiti kontakt za podršku, datum obuke, uređaje i osobu odgovornu za backup. Cilj: vlasnik samostalno napravi/ispravi raspored i prođe osnovni dnevni tok. Izmeriti trajanje, ne pretpostaviti da je cilj ispod pet minuta postignut.

## Checklista za svaki od četiri pilota

Popunjava se interno; lična imena, email adrese, pristupni linkovi i poslovni podaci ne unose se u javni Git repozitorijum.

| Provera | Pilot 1 | Pilot 2 | Pilot 3 | Pilot 4 |
| --- | --- | --- | --- | --- |
| Proveren ID, vlasnik i pilot bez isteka | ☐ | ☐ | ☐ | ☐ |
| Tim, smene, pravila i dostupnost potvrđeni | ☐ | ☐ | ☐ | ☐ |
| Generator, ručna izmena, undo i refresh | ☐ | ☐ | ☐ | ☐ |
| Objavljivanje, izvoz i privatnost oba linka | ☐ | ☐ | ☐ | ☐ |
| Izbor modula i podaci opstaju posle isključenja/refresha | ☐ | ☐ | ☐ | ☐ |
| Prazno/nula, datum danas i poslednji pojedinačni pazar | ☐ | ☐ | ☐ | ☐ |
| Otvoreni sati, arhiva/reset i PDF demonstrirani bez lažnog zaključivanja | ☐ | ☐ | ☐ | ☐ |
| Nacrt, prenos knjige, nulti artikal i ispravka bez kaskade | ☐ | ☐ | ☐ | ☐ |
| Notes: rok, redosled i završavanje | ☐ | ☐ | ☐ | ☐ |
| Vlasnik/menadžer/drugi lokal/opozvan pristup provereni | ☐ | ☐ | ☐ | ☐ |
| 320/392 px, tastatura, fokus i višestrani PDF | ☐ | ☐ | ☐ | ☐ |
| Mrežni prekid i oporavak na test lokalu | ☐ | ☐ | ☐ | ☐ |
| Stvarni backup i odvojeni restore potvrđeni | ☐ | ☐ | ☐ | ☐ |
| Obuka, trajanje toka i prihvatanje osnivača zabeleženi | ☐ | ☐ | ☐ | ☐ |

## Greška mreže i lokalni oporavak

Dok postoji „Čeka slanje“, „Pokušaj ponovo“ ili poruka o lokalnom oporavku, ne brisati podatke pregledača, ne zatvarati poslednju korisnu karticu i ne menjati nalog radi rešavanja greške. Sačuvati vreme, lokal i tekst greške za podršku. Vratiti mrežu i koristiti „Pokušaj ponovo“; nakon potvrde osvežiti i uporediti stanje. Ponovljeni zahtev rasporeda zadržava originalni operation ID. Ne kopirati red upisa između lokala/naloga.

Neispravan JSON reda izmena ne šalje se naslepo: čuvanje vraća neuspeh uz poruku, a originalni lokalni ključ ostaje. Podrška prvo čuva kopiju lokalnih podataka na zaštićenom mestu, pa poredi potvrđene serverske verzije i pojedinačne operacije. Nema automatskog brisanja oštećene kopije. Obrasci pazara, beleški i knjige nisu trajni offline red; knjiga zahteva eksplicitno „Sačuvaj nacrt“. Posle neizvesnog odgovora prvo osvežiti i utvrditi da li je radnja potvrđena.

## Rezervne kopije i proba vraćanja

Kopija izvornog koda na GitHub-u nije kopija poslovnih podataka. Osnivač proverava dostupnost i poslednji uspešan backup u Supabase Database → Backups; dostupnost i retention zavise od plana. Ako odgovarajuća kopija nije dostupna, pripremiti provereni izvoz i kopiju van projekta prema [zvaničnom vodiču za backups](https://supabase.com/docs/guides/platform/backups).

Za CLI izvoz prvo proveriti instaliranu verziju, `supabase db dump --help` i [aktuelno uputstvo za backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Sačuvati šemu, podatke, potrebne role i posebno istoriju `supabase_migrations`, kao i primenjena Auth podešavanja i prilagođene trigere. Backup baze ne uključuje Storage objekte; ova aplikacija nema trajno skladištenje PDF-a. Lozinke/connection string i dump fajlovi ostaju van Gita, zaštićeni i dostupni samo ovlašćenoj podršci.

Pre prvog pilota i posle značajne promene proveriti vraćanje kopije u **odvojeno test okruženje**. Uporediti dokumente rasporeda/verzije, članstva, module i njihove audite, sate i zaključene snimke, pazar, Notes, knjige/nacrt/inventar, potvrde upisa i ograničene linkove. Proveriti RLS i javne SECURITY INVOKER/private funkcije, prijavu i odsustvo izveštaja. Proveriti da postojeći podaci ne izazivaju pravljenje drugog početnog obračuna ili knjige. Unapred dogovoriti prihvatljiv gubitak podataka i vreme oporavka sa vlasnikom; oni nisu već potvrđeni ovim testom.

Automatski `recovery-database.test.ts` radi pun PGlite PGDATA dump/restore sa navedenim podacima i proverava jednakost sačuvanih tabela i zabranu poslovnih čitanja za anonimnog korisnika. Proverava i rollback neuspešne probne DDL transakcije. Ne proverava Supabase upravljane Auth servise, realnu konkurenciju više konekcija ili dostupnost hosted backup-a.

## Povratak aplikacije i migracije

Pre izdanja zabeležiti Git SHA, poslednji ispravan frontend deployment, istoriju udaljenih migracija i backup. Za ovu stabilizaciju prethodna verzija je `7ae55b8`; nema novih DB migracija ni promene formata podataka.

Ako novi frontend blokira rad, prvo sačuvati nepotvrđene izmene i vratiti prethodni provereni statički deployment kroz hosting. Ako hosting nema takvu mogućnost, napraviti zaseban pregledan Git revert stabilizacionog commit-a, zatim build/push kroz uobičajen tok; ne koristiti force push ili reset istorije. Povratak na stariji frontend ponovo uvodi tadašnje poznate greške, pa posle povratka posebno proveriti lokal/nalog i sinhronizaciju.

Ne brisati tabele, audit ili migracionu istoriju radi vraćanja frontend-a. Ne pokretati sve pending migracije: `20261117000000_planner_private_notes.sql` nije primenjena na `sbvicmcgghoshrghbybq`. Migracije `20261121232701_shiftflow_reports.sql` i `20261121233849_remove_pilot_reports.sql` jesu primenjene; ne vraćati report funkcije. Buduća DB ispravka zahteva novu pregledanu migraciju i probu na kopiji. Ako je potreban restore stvarne baze, zabeležiti tačku povratka i kasnije upise, dogovoriti prekid sa pogođenim korisnicima i probu prvo uraditi odvojeno; ovaj rad nije izvršavao produkcioni restore.
