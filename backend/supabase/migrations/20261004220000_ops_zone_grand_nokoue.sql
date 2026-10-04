-- La zone « Cotonou » du responsable opérations devient « Grand Nokoué » : un seul responsable
-- pour toute la zone (Cotonou, Abomey-Calavi, Sèmè-Podji, Ouidah, Porto-Novo), dans un rayon
-- de 45 km autour de Cotonou (le rattachement des courses ne change pas, seul le nom change).
--
-- ops_city_managers.city suit le renommage (on update cascade) ; rides.ops_city et
-- ops_commission_log.city sont de simples textes, mis à jour ici.

update public.ops_cities set city = 'Grand Nokoué' where city = 'Cotonou';

update public.rides set ops_city = 'Grand Nokoué' where ops_city = 'Cotonou';

update public.ops_commission_log set city = 'Grand Nokoué' where city = 'Cotonou';
