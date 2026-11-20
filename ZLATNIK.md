# Kerf — zlatník

Upravená verze [Kerf](https://github.com/vul-os/kerf) pro modelování šperků, rozložením
a ovládáním podobná 3DESIGN CAD. Vše je česky.

## Spuštění

### Windows

1. Musíte mít nainstalovaný **Python 3.11+** (při instalaci zaškrtněte *Add python.exe to PATH*)
   a **Node.js 22 LTS**.
2. Stáhněte repozitář (zelené tlačítko **Code → Download ZIP** a rozbalte ho, nebo `git clone`).
3. Dvakrát klikněte na **`scripts\zlatnik\spustit-zlatnik.bat`**.
   - Poprvé se nainstaluje vše potřebné, trvá to několik minut.
   - Pak se v prohlížeči otevře **http://localhost:8080**.
4. Při prvním otevření si nastavíte heslo. Je to heslo jen k vašemu Kerfu na tomhle počítači.
5. Okno s černou konzolí nechte otevřené, dokud s Kerfem pracujete. Zavřením se Kerf vypne.

Projekty se ukládají do `%USERPROFILE%\.kerf\kerf.db`.
Po aktualizaci kódu (`git pull` nebo nový ZIP) skript sám znovu sestaví rozhraní.

### Linux / macOS

```
./scripts/zlatnik/spustit-zlatnik.sh
```

## Jak se pracuje

- **Nový projekt → Jewelry**, otevře se pracovní plocha ve stylu 3Designu:
  - vlevo **Strom** (prvky modelu) a **Vlastnosti** vybraného prvku
    (✓ hotovo, ✗ smazat, ↶ ↷ zpět/znovu),
  - uprostřed 3D okno. Otáčení levým tlačítkem myši, posun pravým, zoom kolečkem.
    Pohledy ISO / Zp (zepředu) / Sh (shora) / Zl (zleva) a Zoom vše jsou v horní liště,
  - vpravo **Nástroje** po skupinách a **Nápověda** k nástroji pod myší.
- **Prsteny → Solitér** vytvoří jedním klikem obroučku, kotlík se 6 krapnami a briliant 6,5 mm.
- Kotlíky, kameny a lůžka přidané k prstenu se samy posadí na vrchol obroučky
  a drží se ho i při změně velikosti nebo síly stěny.
- **Velikost prstenu**: systém *CZ / EU* = vnitřní obvod v mm (např. 54). Umí i US, UK a JP.
- **Poloha** u každého prvku: posun X/Y/Z, otočení a měřítko.
- **Oko** ve Stromu prvek dočasně vypne, koš ho smaže. Šipky nahoru/dolů procházejí strom,
  klávesa Delete maže.
- **Kov** (horní lišta): žluté, bílé a růžové zlato Au 585 / Au 750, stříbro Ag 925, platina Pt 950.
  Ve spodní liště je **hmotnost kovu v gramech** (bez kamenů).
- **Export**: *STL — jen kov* pro odlití nebo tisk vosku, *3MF* pro slicery,
  *OBJ / GLB* i s kameny.
- **Další operace** otevře celý katalog Kerfu: plochy, NURBS, vzory a další.
  Ne všechny operace z katalogu běží přímo v prohlížeči. Panel Nástroje obsahuje jen ty,
  které jsou ověřené.

## Co bylo opraveno oproti původnímu Kerfu

- Geometrické jádro v prohlížeči nevykreslilo žádný model (nesoulad verzí OpenCascade.js,
  chybná triangulace, chybné typy hran a ploch).
- Změna velikosti prstenu a parametrů kamenů neměla na model vliv.
- Booleovské operace mezi tělesy (vyříznutí lůžka, sjednocení kotlíku s obroučkou) končily chybou.
- Prsten měl osmihranný průřez, teď je hladký (B-spline profil).
- Modely z prvků nešlo exportovat.
