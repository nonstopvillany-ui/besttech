// A v25 beépített munkafázis-sablonjai és kategóriái (forras/app.js: SEED, CATS).
// Szándékosan CSAK megnevezés, napszám és kategória – személynév nincs benne;
// az alapértelmezett felelősök/dolgozók a projektek importált adataiból jönnek.
export const LEGACY_CATEGORIES: Array<[string, string]> = [
  ['Szerkezetépítés', '#2379bd'], ['Gépészet', '#2b9658'], ['Tető', '#8c56bd'], ['Festés', '#b46c29'],
  ['Homlokzat', '#609d35'], ['Burkolás', '#c49a25'], ['Szerelvényezés', '#1b8a8f'], ['Egyéb', '#637c90'],
];

export const LEGACY_SEED_TEMPLATES: Array<[name: string, days: number, category: string]> = [
  ['Humusz leszedés', 1, 'Szerkezetépítés'],
  ['Kitűzés, alapásás', 1, 'Szerkezetépítés'],
  ['Alapozás – vasalás, beton', 2, 'Szerkezetépítés'],
  ['Zsalukő, lábazat', 1, 'Szerkezetépítés'],
  ['Gépészet – alapvezetékek', 1, 'Gépészet'],
  ['Vízóraakna létesítése', 1, 'Gépészet'],
  ['Villanyóra-mérőszekrény létesítése', 1, 'Gépészet'],
  ['Szerelőbeton', 1, 'Szerkezetépítés'],
  ['Főfalazás', 2, 'Szerkezetépítés'],
  ['Koszorú – vasalás, zsaluzás', 3, 'Szerkezetépítés'],
  ['Koszorú betonozás', 1, 'Szerkezetépítés'],
  ['Tető (szerkezet, héjazat, bádog)', 15, 'Tető'],
  ['Födém hőszigetelés + GK váz', 2, 'Szerkezetépítés'],
  ['Válaszfalazás', 2, 'Szerkezetépítés'],
  ['Nyílászárók beépítése', 2, 'Szerkezetépítés'],
  ['Gépészet – helyiségek', 4, 'Gépészet'],
  ['Festés 1. ütem', 5, 'Festés'],
  ['Homlokzat – EPS + háló', 3, 'Homlokzat'],
  ['Homlokzat – végső vakolat', 2, 'Homlokzat'],
  ['Burkolás', 15, 'Burkolás'],
  ['Festés 2. ütem', 5, 'Festés'],
  ['Villanyszerelvényezés', 2, 'Szerelvényezés'],
  ['Vízszerelvényezés', 2, 'Szerelvényezés'],
];
