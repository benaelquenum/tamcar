"""Partie 11 : les trois nouvelles tables (locations VIP, tarifs de location, compteur de data) entrent dans leurs domaines."""
from _patchlib import Fichier

g = Fichier('gen_partie11.py')
g.rep(
    """('Courses', 'b', 'Courses et réservations, arrêts, messages, appels, liens de suivi, notes, alertes SOS.',
     {'rides', 'ride_stops', 'ride_messages', 'ride_calls', 'ride_share_links', 'ratings', 'sos_alerts'}),""",
    """('Courses', 'b', 'Courses, réservations et locations, arrêts, messages, appels, liens de suivi, notes, alertes SOS.',
     {'rides', 'ride_stops', 'ride_messages', 'ride_calls', 'ride_share_links', 'ratings', 'sos_alerts', 'vehicle_rentals'}),""")
g.rep(
    """{'drivers', 'vehicles', 'dealer_partners', 'dealer_advances', 'driver_applications', 'driver_appointments', 'driver_requests',
      'driver_warnings', 'ops_cities', 'ops_city_managers'}),""",
    """{'drivers', 'vehicles', 'dealer_partners', 'dealer_advances', 'driver_applications', 'driver_appointments', 'driver_requests',
      'driver_warnings', 'ops_cities', 'ops_city_managers', 'driver_data_usage'}),""")
g.rep(
    """('Tarifs, lieux, promotions', 'o', 'Grilles de prix, prix du corridor, points de rabattement, lieux, codes promo, bannières.',
     {'pricing_tiers', 'corridor_prices', 'checkpoints', 'places', 'promo_codes', 'promo_code_redemptions', 'home_banners'}),""",
    """('Tarifs, lieux, promotions', 'o', 'Grilles de prix, tarifs de location, prix du corridor, points de rabattement, lieux, codes promo, bannières.',
     {'pricing_tiers', 'rental_rates', 'corridor_prices', 'checkpoints', 'places', 'promo_codes', 'promo_code_redemptions', 'home_banners'}),""")
g.ecrire()
