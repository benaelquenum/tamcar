-- ============================================================
-- TamCar Office — Phase 3 : états financiers SYSCOHADA (2026-08-06)
--
--   Génère le Bilan (actif/passif), le Compte de résultat et le Tableau
--   des flux de trésorerie à partir des écritures, selon la structure de
--   la liasse eBilan de la DGI Bénin (Système Normal).
--
--   PRINCIPE : chaque ligne de la liasse porte une référence (AD, XB, DZ…)
--   et se calcule soit à partir de fourchettes de comptes (lignes de
--   détail), soit en agrégeant d'autres références (sous-totaux et totaux).
--   Cette grille est stockée dans bo_fs_lines : elle se corrige donc en SQL,
--   sans redéploiement applicatif.
--
--   CÔTÉ DU SOLDE (colonne `side`) — indispensable pour les comptes de
--   tiers, qui figurent à l'actif ou au passif selon le sens de leur solde :
--     'net_debit'  : solde net, rendu positif si débiteur (actif, charges)
--     'net_credit' : solde net, rendu positif si créditeur (passif, produits)
--     'debit'      : uniquement les comptes à solde débiteur (créances)
--     'credit'     : uniquement les comptes à solde créditeur (dettes)
--   Ainsi le compte 431 (CNSS) alimente « Autres créances » s'il est
--   débiteur et « Dettes fiscales et sociales » s'il est créditeur, sans
--   jamais être compté deux fois.
--
--   LIMITES ASSUMÉES (à relire avec l'expert-comptable avant tout dépôt) :
--     · Les 36 notes annexées ne sont pas générées — elles relèvent de la
--       révision par l'expert-comptable inscrit à l'ONECCA.
--     · Le résultat de l'exercice est calculé comme (produits − charges)
--       sur les classes 6/7/8, plus le compte 13 s'il est déjà mouvementé.
--     · Le TFT suppose que les acquisitions d'immobilisations de la
--       période correspondent aux mouvements débiteurs de la classe 2.
-- ============================================================

-- ---------- 1. Grille des lignes de la liasse ----------
create table if not exists public.bo_fs_lines (
  statement      text not null check (statement in ('actif', 'passif', 'resultat')),
  ref            text not null,
  label          text not null,
  sort           int  not null,
  level          int  not null default 0,   -- 0 = détail ; > 0 = agrégat (résolu par ordre croissant)
  is_total       boolean not null default false,
  accounts       text[],                    -- préfixes de comptes (lignes de détail)
  amort_accounts text[],                    -- préfixes d'amortissements / dépréciations
  side           text not null default 'net_debit'
                 check (side in ('net_debit', 'net_credit', 'debit', 'credit')),
  sign           int  not null default 1,   -- contribution de la ligne aux agrégats
  components     text[],                    -- références à agréger
  note_no        text,
  primary key (statement, ref)
);

alter table public.bo_fs_lines enable row level security;

drop policy if exists bo_fs_lines_select on public.bo_fs_lines;
create policy bo_fs_lines_select on public.bo_fs_lines
  for select using (public.is_backoffice_reader());

grant select on public.bo_fs_lines to authenticated;

-- ---------- 2. Calcul d'un montant ----------
-- p_from null => cumul depuis l'origine (bilan) ; sinon mouvements de la période.
create or replace function public._bo_fs_amount(
  p_prefixes text[],
  p_side     text,
  p_from     date,
  p_to       date
)
returns bigint
language sql stable security definer set search_path = public as $$
  with per_account as (
    select l.account_code as code,
           sum(l.debit_fcfa - l.credit_fcfa)::bigint as bal
    from public.bo_entry_lines l
    join public.bo_entries e on e.id = l.entry_id
    where e.entry_date <= p_to
      and (p_from is null or e.entry_date >= p_from)
      and p_prefixes is not null
      and exists (
        select 1 from unnest(p_prefixes) as pfx(prefix)
        where l.account_code like pfx.prefix || '%'
      )
    group by l.account_code
  )
  select coalesce(sum(
    case when p_side in ('net_credit', 'credit') then -bal else bal end
  ), 0)::bigint
  from per_account
  where p_side in ('net_debit', 'net_credit')
     or (p_side = 'debit'  and bal > 0)
     or (p_side = 'credit' and bal < 0);
$$;

-- ---------- 3. Bilan et compte de résultat ----------
create or replace function public.bo_financial_statement(
  p_statement text,
  p_to        date,
  p_from      date default null,      -- null pour le bilan (cumul)
  p_prev_to   date default null,
  p_prev_from date default null
)
returns table (
  ref      text,
  label    text,
  sort     int,
  level    int,
  is_total boolean,
  sign     int,
  brut     bigint,
  amort    bigint,
  net      bigint,
  prev_net bigint,
  note_no  text
)
language plpgsql stable security definer set search_path = public as $$
declare
  -- Accumulateur ref -> {b: brut, a: amortissements, n: net, p: net N-1}.
  -- Un jsonb plutôt qu'une table temporaire : une table temporaire recréée
  -- à chaque appel invalide les plans plpgsql mis en cache (« relation with
  -- OID ... does not exist ») quand la fonction est appelée plusieurs fois
  -- dans la même transaction, ce que fait bo_fs_checks.
  v      jsonb := '{}'::jsonb;
  v_sign jsonb;
  r      record;
  v_lvl  int;
  v_max  int;
  b bigint; a bigint; n bigint; p bigint; s int;
  comp text;
begin
  if not public.is_backoffice_reader() then
    raise exception 'Accès refusé' using errcode = 'P0001';
  end if;

  select jsonb_object_agg(l.ref, l.sign) into v_sign
  from public.bo_fs_lines l where l.statement = p_statement;

  -- Lignes de détail
  for r in
    select * from public.bo_fs_lines l
    where l.statement = p_statement and l.level = 0
  loop
    b := public._bo_fs_amount(r.accounts, r.side, p_from, p_to);
    a := case when r.amort_accounts is not null
              then public._bo_fs_amount(r.amort_accounts, 'net_credit', p_from, p_to)
              else 0 end;
    p := case when p_prev_to is not null
              then public._bo_fs_amount(r.accounts, r.side, p_prev_from, p_prev_to)
                 - case when r.amort_accounts is not null
                        then public._bo_fs_amount(r.amort_accounts, 'net_credit', p_prev_from, p_prev_to)
                        else 0 end
              else 0 end;
    v := v || jsonb_build_object(r.ref,
           jsonb_build_object('b', b, 'a', a, 'n', b - a, 'p', p));
  end loop;

  -- Agrégats, niveau par niveau (les composantes sont toujours d'un niveau inférieur)
  select max(l.level) into v_max
  from public.bo_fs_lines l where l.statement = p_statement;

  for v_lvl in 1 .. coalesce(v_max, 0) loop
    for r in
      select * from public.bo_fs_lines l
      where l.statement = p_statement and l.level = v_lvl
    loop
      b := 0; a := 0; n := 0; p := 0;
      foreach comp in array coalesce(r.components, array[]::text[]) loop
        s := coalesce((v_sign->>comp)::int, 1);
        b := b + coalesce((v->comp->>'b')::bigint, 0) * s;
        a := a + coalesce((v->comp->>'a')::bigint, 0) * s;
        n := n + coalesce((v->comp->>'n')::bigint, 0) * s;
        p := p + coalesce((v->comp->>'p')::bigint, 0) * s;
      end loop;
      v := v || jsonb_build_object(r.ref,
             jsonb_build_object('b', b, 'a', a, 'n', n, 'p', p));
    end loop;
  end loop;

  return query
    select l.ref, l.label, l.sort, l.level, l.is_total, l.sign,
           coalesce((v->l.ref->>'b')::bigint, 0),
           coalesce((v->l.ref->>'a')::bigint, 0),
           coalesce((v->l.ref->>'n')::bigint, 0),
           coalesce((v->l.ref->>'p')::bigint, 0),
           l.note_no
    from public.bo_fs_lines l
    where l.statement = p_statement
    order by l.sort;
end;
$$;

grant execute on function public.bo_financial_statement(text, date, date, date, date) to authenticated;

-- ---------- 4. Tableau des flux de trésorerie ----------
-- Méthode CAFG, structure ZA → ZH de la liasse. Les lignes de variation
-- comparent les soldes à l'ouverture et à la clôture ; les autres lignes
-- reprennent les mouvements de la période.
create or replace function public.bo_cash_flow(p_from date, p_to date)
returns table (ref text, label text, sort int, is_total boolean, amount bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_open  date := p_from - 1;
  za bigint; fa bigint; fb bigint; fc bigint; fd bigint; fe bigint; zb bigint;
  ff bigint; fg bigint; fh bigint; fi bigint; fj bigint; zc bigint;
  fk bigint; fl bigint; fm bigint; fn bigint; zd bigint;
  fo bigint; fp bigint; fq bigint; ze bigint; zf bigint; zg bigint; zh bigint;
  v_result bigint;
begin
  if not public.is_backoffice_reader() then
    raise exception 'Accès refusé' using errcode = 'P0001';
  end if;

  -- Trésorerie nette à l'ouverture (actif − passif)
  za := public._bo_fs_amount(array['50','51','52','53','54','57','58'], 'debit', null, v_open)
      - public._bo_fs_amount(array['52','53','561','564','565','566'], 'credit', null, v_open);

  -- Capacité d'autofinancement globale
  v_result := public._bo_fs_amount(array['6','7','8','13'], 'net_credit', p_from, p_to);
  fa := v_result
      + public._bo_fs_amount(array['681','691','697'], 'net_debit', p_from, p_to)   -- dotations
      - public._bo_fs_amount(array['791','797','798','799'], 'net_credit', p_from, p_to) -- reprises
      + public._bo_fs_amount(array['81'], 'net_debit', p_from, p_to)                -- valeurs comptables des cessions
      - public._bo_fs_amount(array['82'], 'net_credit', p_from, p_to);              -- produits des cessions

  -- Variations du besoin en fonds de roulement (une augmentation d'actif consomme de la trésorerie)
  fb := -(public._bo_fs_amount(array['485','488'], 'debit', null, p_to)
        - public._bo_fs_amount(array['485','488'], 'debit', null, v_open));
  fc := -(public._bo_fs_amount(array['3'], 'net_debit', null, p_to)
        - public._bo_fs_amount(array['3'], 'net_debit', null, v_open));
  fd := -(public._bo_fs_amount(array['409','41','42','43','44','45','46','47'], 'debit', null, p_to)
        - public._bo_fs_amount(array['409','41','42','43','44','45','46','47'], 'debit', null, v_open));
  fe :=  (public._bo_fs_amount(array['419','401','402','408','42','43','44','45','46','47','481','482','484'], 'credit', null, p_to)
        - public._bo_fs_amount(array['419','401','402','408','42','43','44','45','46','47','481','482','484'], 'credit', null, v_open));
  zb := fa + fb + fc + fd + fe;

  -- Investissement (mouvements débiteurs = acquisitions, créditeurs = cessions)
  ff := -public._bo_fs_amount(array['21'], 'net_debit', p_from, p_to);
  fg := -public._bo_fs_amount(array['22','23','24','25'], 'net_debit', p_from, p_to);
  fh := -public._bo_fs_amount(array['26','27'], 'net_debit', p_from, p_to);
  fi :=  public._bo_fs_amount(array['82'], 'net_credit', p_from, p_to);
  fj := 0;
  zc := ff + fg + fh + fi + fj;

  -- Financement par capitaux propres
  fk := public._bo_fs_amount(array['101','102','103','104'], 'net_credit', p_from, p_to);
  fl := public._bo_fs_amount(array['14'], 'net_credit', p_from, p_to);
  fm := -public._bo_fs_amount(array['109'], 'net_debit', p_from, p_to);
  fn := -public._bo_fs_amount(array['465'], 'net_debit', p_from, p_to);
  zd := fk + fl + fm + fn;

  -- Financement par capitaux étrangers
  fo := public._bo_fs_amount(array['16','17'], 'net_credit', p_from, p_to);
  fp := public._bo_fs_amount(array['18'], 'net_credit', p_from, p_to);
  fq := 0;   -- les remboursements figurent déjà en négatif dans FO (solde net de la période)
  ze := fo + fp + fq;
  zf := zd + ze;

  zg := zb + zc + zf;
  zh := zg + za;

  return query
  select * from (values
    ('ZA', 'Trésorerie nette au 1er jour de la période', 10, true,  za),
    ('FA', 'Capacité d''autofinancement globale (CAFG)', 20, false, fa),
    ('FB', 'Variation de l''actif circulant HAO',        30, false, fb),
    ('FC', 'Variation des stocks',                       40, false, fc),
    ('FD', 'Variation des créances',                     50, false, fd),
    ('FE', 'Variation du passif circulant',              60, false, fe),
    ('ZB', 'Flux de trésorerie des activités opérationnelles', 70, true, zb),
    ('FF', 'Acquisitions d''immobilisations incorporelles',    80, false, ff),
    ('FG', 'Acquisitions d''immobilisations corporelles',      90, false, fg),
    ('FH', 'Acquisitions d''immobilisations financières',     100, false, fh),
    ('FI', 'Cessions d''immobilisations incorporelles et corporelles', 110, false, fi),
    ('FJ', 'Cessions d''immobilisations financières',         120, false, fj),
    ('ZC', 'Flux de trésorerie des activités d''investissement', 130, true, zc),
    ('FK', 'Augmentations de capital par apports nouveaux',   140, false, fk),
    ('FL', 'Subventions d''investissement reçues',            150, false, fl),
    ('FM', 'Prélèvements sur le capital',                     160, false, fm),
    ('FN', 'Dividendes versés',                               170, false, fn),
    ('ZD', 'Flux de trésorerie des capitaux propres',         180, true, zd),
    ('FO', 'Emprunts (net de la période)',                    190, false, fo),
    ('FP', 'Autres dettes financières',                       200, false, fp),
    ('FQ', 'Remboursements des emprunts',                     210, false, fq),
    ('ZE', 'Flux de trésorerie des capitaux étrangers',       220, true, ze),
    ('ZF', 'Flux de trésorerie des activités de financement', 230, true, zf),
    ('ZG', 'Variation de la trésorerie nette de la période',  240, true, zg),
    ('ZH', 'Trésorerie nette à la clôture de la période',     250, true, zh)
  ) as t(ref, label, sort, is_total, amount);
end;
$$;

grant execute on function public.bo_cash_flow(date, date) to authenticated;

-- ---------- 5. Contrôles de cohérence ----------
create or replace function public.bo_fs_checks(p_to date, p_from date default null)
returns table (label text, left_value bigint, right_value bigint, ok boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_actif    bigint;
  v_passif   bigint;
  v_resultat bigint;
  v_cj       bigint;
  v_deb      bigint;
  v_cred     bigint;
begin
  if not public.is_backoffice_reader() then
    raise exception 'Accès refusé' using errcode = 'P0001';
  end if;

  select f.net into v_actif
  from public.bo_financial_statement('actif', p_to) f where f.ref = 'BZ';
  select f.net into v_passif
  from public.bo_financial_statement('passif', p_to) f where f.ref = 'DZ';
  select f.net into v_resultat
  from public.bo_financial_statement('resultat', p_to, coalesce(p_from, date_trunc('year', p_to)::date)) f
  where f.ref = 'XI';
  select f.net into v_cj
  from public.bo_financial_statement('passif', p_to) f where f.ref = 'CJ';

  select coalesce(sum(l.debit_fcfa), 0), coalesce(sum(l.credit_fcfa), 0)
  into v_deb, v_cred
  from public.bo_entry_lines l
  join public.bo_entries e on e.id = l.entry_id
  where e.entry_date <= p_to;

  return query
  select * from (values
    ('Total actif = Total passif',            coalesce(v_actif, 0),  coalesce(v_passif, 0),
       coalesce(v_actif, 0) = coalesce(v_passif, 0)),
    ('Résultat du bilan = Résultat du compte de résultat', coalesce(v_cj, 0), coalesce(v_resultat, 0),
       coalesce(v_cj, 0) = coalesce(v_resultat, 0)),
    ('Total des débits = Total des crédits',  v_deb, v_cred, v_deb = v_cred)
  ) as t(label, left_value, right_value, ok);
end;
$$;

grant execute on function public.bo_fs_checks(date, date) to authenticated;

-- ---------- 5 bis. Verrouillage des fonctions internes ----------
-- Les fonctions préfixées d'un « _ » sont des rouages internes appelés par
-- les RPC publiques (elles-mêmes protégées par un contrôle de rôle). Or
-- PostgreSQL accorde EXECUTE à PUBLIC par défaut, et PostgREST expose tout
-- le schéma public : sans ces révocations, n'importe quel compte connecté —
-- un client de l'application, par exemple — pourrait les appeler
-- directement et créer des écritures comptables ou lire les agrégats.
revoke all on function public._bo_fs_amount(text[], text, date, date)
  from public, anon, authenticated;
revoke all on function public._bo_insert_entry(text, date, text, jsonb, text, text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public._bo_expense_entry(date, text, bigint, text, text, uuid, text)
  from public, anon, authenticated;

-- ---------- 6. Grille de la liasse ----------
delete from public.bo_fs_lines;

-- ===== BILAN — ACTIF =====
insert into public.bo_fs_lines
  (statement, ref, label, sort, level, is_total, accounts, amort_accounts, side, sign, components, note_no) values
 ('actif','AE','Frais de développement et de prospection',20,0,false,array['211'],array['2811'],'net_debit',1,null,'3'),
 ('actif','AF','Brevets, licences, logiciels et droits similaires',30,0,false,array['212','213'],array['2812','2813'],'net_debit',1,null,'3'),
 ('actif','AG','Fonds commercial et droit au bail',40,0,false,array['215','216'],array['2815'],'net_debit',1,null,'3'),
 ('actif','AH','Autres immobilisations incorporelles',50,0,false,array['218'],array['2818'],'net_debit',1,null,'3'),
 ('actif','AD','IMMOBILISATIONS INCORPORELLES',10,1,true,null,null,'net_debit',1,array['AE','AF','AG','AH'],'3'),
 ('actif','AJ','Terrains',70,0,false,array['22'],array['282'],'net_debit',1,null,'3'),
 ('actif','AK','Bâtiments',80,0,false,array['231','232','233','234'],array['2831','2832','2833','2834'],'net_debit',1,null,'3'),
 ('actif','AL','Aménagements, agencements et installations',90,0,false,array['235','237','238'],array['2835','2837','2838'],'net_debit',1,null,'3'),
 ('actif','AM','Matériel, mobilier et actifs biologiques',100,0,false,array['241','244'],array['2841','2844'],'net_debit',1,null,'3'),
 ('actif','AN','Matériel de transport',110,0,false,array['245'],array['2845'],'net_debit',1,null,'3'),
 ('actif','AP','Avances et acomptes versés sur immobilisations',120,0,false,array['251','252'],null,'net_debit',1,null,'3'),
 ('actif','AI','IMMOBILISATIONS CORPORELLES',60,1,true,null,null,'net_debit',1,array['AJ','AK','AL','AM','AN','AP'],'3'),
 ('actif','AR','Titres de participation',140,0,false,array['26'],array['296'],'net_debit',1,null,'4'),
 ('actif','AS','Autres immobilisations financières',150,0,false,array['27'],array['297'],'net_debit',1,null,'4'),
 ('actif','AQ','IMMOBILISATIONS FINANCIÈRES',130,1,true,null,null,'net_debit',1,array['AR','AS'],'4'),
 ('actif','AZ','TOTAL ACTIF IMMOBILISÉ',160,2,true,null,null,'net_debit',1,array['AD','AI','AQ'],null),
 ('actif','BA','ACTIF CIRCULANT HAO',170,0,false,array['485','488'],null,'debit',1,null,'5'),
 ('actif','BB','STOCKS ET ENCOURS',180,0,false,array['3'],array['39'],'net_debit',1,null,'6'),
 ('actif','BH','Fournisseurs, avances versées',200,0,false,array['409'],null,'debit',1,null,'17'),
 ('actif','BI','Clients',210,0,false,array['41'],array['491'],'debit',1,null,'7'),
 ('actif','BJ','Autres créances',220,0,false,array['42','43','44','45','46','47'],array['492','493','494','495','496','497'],'debit',1,null,'8'),
 ('actif','BG','CRÉANCES ET EMPLOIS ASSIMILÉS',190,1,true,null,null,'net_debit',1,array['BH','BI','BJ'],null),
 ('actif','BK','TOTAL ACTIF CIRCULANT',230,2,true,null,null,'net_debit',1,array['BA','BB','BG'],null),
 ('actif','BQ','Titres de placement',240,0,false,array['50'],array['590'],'net_debit',1,null,'9'),
 ('actif','BR','Valeurs à encaisser',250,0,false,array['51'],null,'debit',1,null,'10'),
 ('actif','BS','Banques, chèques postaux, caisse et assimilés',260,0,false,array['52','53','54','57','58'],array['591','594'],'debit',1,null,'11'),
 ('actif','BT','TOTAL TRÉSORERIE-ACTIF',270,2,true,null,null,'net_debit',1,array['BQ','BR','BS'],null),
 ('actif','BU','Écart de conversion-Actif',280,0,false,array['478'],null,'net_debit',1,null,'12'),
 ('actif','BZ','TOTAL GÉNÉRAL',290,3,true,null,null,'net_debit',1,array['AZ','BK','BT','BU'],null);

-- ===== BILAN — PASSIF =====
insert into public.bo_fs_lines
  (statement, ref, label, sort, level, is_total, accounts, amort_accounts, side, sign, components, note_no) values
 ('passif','CA','Capital',10,0,false,array['101','102','103'],null,'net_credit',1,null,'13'),
 ('passif','CB','Apporteurs, capital non appelé (−)',20,0,false,array['109'],null,'net_debit',-1,null,'13'),
 ('passif','CD','Primes liées au capital social',30,0,false,array['104'],null,'net_credit',1,null,'14'),
 ('passif','CE','Écarts de réévaluation',40,0,false,array['105','106'],null,'net_credit',1,null,'3e'),
 ('passif','CF','Réserves indisponibles',50,0,false,array['111','112','113'],null,'net_credit',1,null,'14'),
 ('passif','CG','Réserves libres',60,0,false,array['118'],null,'net_credit',1,null,'14'),
 ('passif','CH','Report à nouveau (+ ou −)',70,0,false,array['12'],null,'net_credit',1,null,'14'),
 ('passif','CJ','Résultat net de l''exercice (bénéfice + ou perte −)',80,0,false,array['6','7','8','13'],null,'net_credit',1,null,null),
 ('passif','CL','Subventions d''investissement',90,0,false,array['14'],null,'net_credit',1,null,'15'),
 ('passif','CM','Provisions réglementées',100,0,false,array['15'],null,'net_credit',1,null,'15'),
 ('passif','CP','TOTAL CAPITAUX PROPRES ET RESSOURCES ASSIMILÉES',110,1,true,null,null,'net_credit',1,array['CA','CB','CD','CE','CF','CG','CH','CJ','CL','CM'],null),
 ('passif','DA','Emprunts et dettes financières diverses',120,0,false,array['16','18'],null,'net_credit',1,null,'16'),
 ('passif','DB','Dettes de location acquisition',130,0,false,array['17'],null,'net_credit',1,null,'16'),
 ('passif','DC','Provisions pour risques et charges',140,0,false,array['19'],null,'net_credit',1,null,'16'),
 ('passif','DD','TOTAL DETTES FINANCIÈRES ET RESSOURCES ASSIMILÉES',150,1,true,null,null,'net_credit',1,array['DA','DB','DC'],null),
 ('passif','DF','TOTAL RESSOURCES STABLES',160,2,true,null,null,'net_credit',1,array['CP','DD'],null),
 ('passif','DH','Dettes circulantes HAO',170,0,false,array['481','482','484'],null,'credit',1,null,'5'),
 ('passif','DI','Clients, avances reçues',180,0,false,array['419'],null,'net_credit',1,null,'7'),
 ('passif','DJ','Fournisseurs d''exploitation',190,0,false,array['401','402','408'],null,'credit',1,null,'17'),
 ('passif','DK','Dettes fiscales et sociales',200,0,false,array['42','43','44'],null,'credit',1,null,'18'),
 ('passif','DM','Autres dettes',210,0,false,array['45','46','47'],null,'credit',1,null,'19'),
 ('passif','DN','Provisions pour risques à court terme',220,0,false,array['499','599'],null,'net_credit',1,null,'19'),
 ('passif','DP','TOTAL PASSIF CIRCULANT',230,1,true,null,null,'net_credit',1,array['DH','DI','DJ','DK','DM','DN'],null),
 ('passif','DQ','Banques, crédits d''escompte',240,0,false,array['564','565'],null,'net_credit',1,null,'20'),
 ('passif','DR','Banques, établissements financiers et crédits de trésorerie',250,0,false,array['52','53','561','566'],null,'credit',1,null,'20'),
 ('passif','DT','TOTAL TRÉSORERIE-PASSIF',260,1,true,null,null,'net_credit',1,array['DQ','DR'],null),
 ('passif','DV','Écart de conversion-Passif',270,0,false,array['479'],null,'net_credit',1,null,'12'),
 ('passif','DZ','TOTAL GÉNÉRAL',280,3,true,null,null,'net_credit',1,array['DF','DP','DT','DV'],null);

-- ===== COMPTE DE RÉSULTAT =====
insert into public.bo_fs_lines
  (statement, ref, label, sort, level, is_total, accounts, amort_accounts, side, sign, components, note_no) values
 ('resultat','TA','Ventes de marchandises',10,0,false,array['701'],null,'net_credit',1,null,'21'),
 ('resultat','RA','Achats de marchandises',20,0,false,array['601'],null,'net_debit',-1,null,'22'),
 ('resultat','RB','Variation de stocks de marchandises',30,0,false,array['6031'],null,'net_debit',-1,null,'6'),
 ('resultat','XA','MARGE COMMERCIALE',40,1,true,null,null,'net_credit',1,array['TA','RA','RB'],null),
 ('resultat','TB','Ventes de produits fabriqués',50,0,false,array['702','703','704'],null,'net_credit',1,null,'21'),
 ('resultat','TC','Travaux, services vendus',60,0,false,array['705','706'],null,'net_credit',1,null,'21'),
 ('resultat','TD','Produits accessoires',70,0,false,array['707'],null,'net_credit',1,null,'21'),
 ('resultat','XB','CHIFFRE D''AFFAIRES',80,1,true,null,null,'net_credit',1,array['TA','TB','TC','TD'],null),
 ('resultat','TE','Production stockée (ou déstockage)',90,0,false,array['73'],null,'net_credit',1,null,'6'),
 ('resultat','TF','Production immobilisée',100,0,false,array['72'],null,'net_credit',1,null,'21'),
 ('resultat','TG','Subventions d''exploitation',110,0,false,array['71'],null,'net_credit',1,null,'21'),
 ('resultat','TH','Autres produits',120,0,false,array['75'],null,'net_credit',1,null,'21'),
 ('resultat','TI','Transferts de charges d''exploitation',130,0,false,array['781'],null,'net_credit',1,null,'12'),
 ('resultat','RC','Achats de matières premières et fournitures liées',140,0,false,array['602'],null,'net_debit',-1,null,'22'),
 ('resultat','RD','Variation de stocks de matières premières',150,0,false,array['6032'],null,'net_debit',-1,null,'6'),
 ('resultat','RE','Autres achats',160,0,false,array['604','605','608'],null,'net_debit',-1,null,'22'),
 ('resultat','RF','Variation de stocks d''autres approvisionnements',170,0,false,array['6033'],null,'net_debit',-1,null,'6'),
 ('resultat','RG','Transports',180,0,false,array['61'],null,'net_debit',-1,null,'23'),
 ('resultat','RH','Services extérieurs',190,0,false,array['62','63'],null,'net_debit',-1,null,'24'),
 ('resultat','RI','Impôts et taxes',200,0,false,array['64'],null,'net_debit',-1,null,'25'),
 ('resultat','RJ','Autres charges',210,0,false,array['65'],null,'net_debit',-1,null,'26'),
 ('resultat','XC','VALEUR AJOUTÉE',220,2,true,null,null,'net_credit',1,array['XB','RA','RB','TE','TF','TG','TH','TI','RC','RD','RE','RF','RG','RH','RI','RJ'],null),
 ('resultat','RK','Charges de personnel',230,0,false,array['66'],null,'net_debit',-1,null,'27'),
 ('resultat','XD','EXCÉDENT BRUT D''EXPLOITATION',240,3,true,null,null,'net_credit',1,array['XC','RK'],null),
 ('resultat','TJ','Reprises d''amortissements, provisions et dépréciations',250,0,false,array['791','798','799'],null,'net_credit',1,null,'28'),
 ('resultat','RL','Dotations aux amortissements, aux provisions et dépréciations',260,0,false,array['681','691'],null,'net_debit',-1,null,'28'),
 ('resultat','XE','RÉSULTAT D''EXPLOITATION',270,4,true,null,null,'net_credit',1,array['XD','TJ','RL'],null),
 ('resultat','TK','Revenus financiers et assimilés',280,0,false,array['77'],null,'net_credit',1,null,'29'),
 ('resultat','TL','Reprises de provisions et dépréciations financières',290,0,false,array['797'],null,'net_credit',1,null,'28'),
 ('resultat','TM','Transferts de charges financières',300,0,false,array['787'],null,'net_credit',1,null,'12'),
 ('resultat','RM','Frais financiers et charges assimilées',310,0,false,array['67'],null,'net_debit',-1,null,'29'),
 ('resultat','RN','Dotations aux provisions et dépréciations financières',320,0,false,array['697'],null,'net_debit',-1,null,'28'),
 ('resultat','XF','RÉSULTAT FINANCIER',330,1,true,null,null,'net_credit',1,array['TK','TL','TM','RM','RN'],null),
 ('resultat','XG','RÉSULTAT DES ACTIVITÉS ORDINAIRES',340,5,true,null,null,'net_credit',1,array['XE','XF'],null),
 ('resultat','TN','Produits des cessions d''immobilisations',350,0,false,array['82'],null,'net_credit',1,null,'3D'),
 ('resultat','TO','Autres produits HAO',360,0,false,array['84','86','88'],null,'net_credit',1,null,'30'),
 ('resultat','RO','Valeurs comptables des cessions d''immobilisations',370,0,false,array['81'],null,'net_debit',-1,null,'3D'),
 ('resultat','RP','Autres charges HAO',380,0,false,array['83','85'],null,'net_debit',-1,null,'30'),
 ('resultat','XH','RÉSULTAT HORS ACTIVITÉS ORDINAIRES',390,1,true,null,null,'net_credit',1,array['TN','TO','RO','RP'],null),
 ('resultat','RQ','Participation des travailleurs',400,0,false,array['87'],null,'net_debit',-1,null,'30'),
 ('resultat','RS','Impôts sur le résultat',410,0,false,array['89'],null,'net_debit',-1,null,null),
 ('resultat','XI','RÉSULTAT NET',420,6,true,null,null,'net_credit',1,array['XG','XH','RQ','RS'],null);
