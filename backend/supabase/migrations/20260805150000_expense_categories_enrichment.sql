-- ============================================================
-- TamCar Office — Enrichissement des catégories d'opérations (2026-08-05)
--
--   35 catégories organisées en 5 groupes (le tri « sort » fait office
--   de groupe pour l'affichage) :
--     10-99   Dépenses courantes            (charges, classe 6)
--     100-169 Équipements & immobilisations (actifs, classe 2 — un
--             ordinateur ou un tricycle n'est PAS une charge : l'écriture
--             débite le compte d'immobilisation ; l'amortissement viendra
--             en fin d'exercice par OD)
--     170-199 Personnel & social
--     200-249 Impôts, taxes & finances (dont avances/cautions, classe 4/2)
--     250+    Divers
--   Upsert idempotent : relançable, corrige aussi les libellés existants.
-- ============================================================

insert into public.bo_expense_categories (code, label, account_code, sort) values
  -- ----- Dépenses courantes -----
  ('loyer',            'Loyer et charges des bureaux',                     '622',  10),
  ('eau_energie',      'Eau et électricité',                               '6051', 15),
  ('carburant',        'Carburant et lubrifiants',                         '6052', 20),
  ('telecom',          'Téléphone, internet, SMS',                         '6281', 25),
  ('numerique',        'Hébergement et services numériques (abonnements)', '6288', 30),
  ('fournitures',      'Fournitures de bureau (consommables)',             '6055', 35),
  ('petit_materiel',   'Petit matériel et outillage (non durable)',        '6058', 40),
  ('entretien',        'Entretien et réparations',                         '624',  45),
  ('deplacements',     'Transports et déplacements',                       '618',  50),
  ('marketing',        'Marketing, communication, impression',             '627',  55),
  ('receptions',       'Réceptions, invités, représentation',              '638',  60),
  ('gardiennage',      'Gardiennage, nettoyage, sécurité',                 '638',  65),
  ('assurances',       'Assurances',                                       '625',  70),
  ('honoraires',       'Honoraires et commissions',                        '632',  75),
  ('formation',        'Formation du personnel',                           '633',  80),
  -- ----- Équipements & immobilisations -----
  ('materiel_informatique', 'Matériel informatique (ordinateur, imprimante, téléphone)', '2442', 100),
  ('materiel_bureau',  'Matériel de bureau (équipement durable)',          '2441', 105),
  ('mobilier',         'Mobilier de bureau',                               '2444', 110),
  ('logiciels',        'Logiciel ou licence (achat durable)',              '213',  115),
  ('amenagements',     'Aménagements et travaux des locaux',               '235',  120),
  ('achat_tricycle',   'Achat de tricycle (flotte)',                       '2451', 125),
  ('achat_moto',       'Achat de moto (flotte)',                           '2452', 130),
  ('achat_vehicule',   'Achat d''un autre véhicule',                       '2458', 135),
  ('avance_immo',      'Avance sur commande d''immobilisation (concessionnaire…)', '252', 140),
  ('caution',          'Caution / dépôt de garantie versé (loyer…)',       '275',  145),
  -- ----- Personnel & social -----
  ('salaires',         'Salaires nets payés',                              '661',  170),
  ('avance_salaire',   'Avance sur salaire (personnel)',                   '421',  175),
  ('cnss',             'Cotisations CNSS',                                 '6641', 180),
  -- ----- Impôts, taxes & finances -----
  ('impots_taxes',     'Taxes et redevances (ANATT…)',                     '648',  200),
  ('patente',          'Patente et impôts directs',                        '641',  205),
  ('enregistrement',   'Droits d''enregistrement (contrats, actes)',       '646',  210),
  ('frais_bancaires',  'Frais bancaires',                                  '631',  215),
  ('frais_momo',       'Frais Mobile Money / agrégateur',                  '6318', 220),
  ('interets',         'Intérêts d''emprunt',                              '671',  225),
  ('avance_fournisseur', 'Avance versée à un fournisseur',                 '4091', 230),
  -- ----- Divers -----
  ('autres',           'Autres dépenses',                                  '658',  250)
on conflict (code) do update
  set label = excluded.label,
      account_code = excluded.account_code,
      sort = excluded.sort;
