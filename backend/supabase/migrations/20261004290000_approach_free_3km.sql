-- Prime d'approche : distance gratuite portée de 1 km à 3 km (décision de Terence, 2026-10-05).
-- Un chauffeur à moins de 3 km du client n'a pas de prime ; au-delà, la prime court sur les kilomètres
-- supplémentaires (25 F moto, 50 F tricycle, 100 F voiture par km), plafonnée à 200 F par course.
-- CGU 13 ter mises à jour dans les deux applications (version 2026-10-14).
update public.program_rules set value = 3000, updated_at = now() where key = 'approach_free_m';
