-- Le site web TamCar (espace partenaire) enregistre lui aussi l'acceptation des CGU + politique de
-- confidentialité : on autorise la valeur d'application « site » (en plus de client / driver).

alter table public.terms_acceptances drop constraint if exists terms_acceptances_app_check;
alter table public.terms_acceptances
  add constraint terms_acceptances_app_check check (app in ('client', 'driver', 'site'));
