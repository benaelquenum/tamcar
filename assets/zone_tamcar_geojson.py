"""Génère le polygone de la zone de service TamCar, pour `pmtiles extract --region`.

La zone est définie en base par cinq disques de 15 km (voir la migration
20260727170000_service_zone_ouidah.sql). Une bbox rectangulaire couvrirait
5 800 km², dont une large part d'océan et de lagune ; l'union des disques en
fait environ la moitié — autant de tuiles en moins à héberger et à servir.

Les centres sont recopiés depuis _is_within_service_zone : toute évolution de
la zone de service doit être répercutée ici.
"""
import json
import math

from shapely.geometry import Polygon, mapping
from shapely.ops import unary_union

RAYON_M = 15000
CENTRES = [
    ("Ouidah", 2.085, 6.363),
    ("Pahou", 2.200, 6.383),
    ("Cotonou", 2.435, 6.365),
    ("Sèmè-Podji", 2.625, 6.365),
    ("Porto-Novo", 2.605, 6.497),
]
MARGE_M = 2000          # navigation en bordure de zone
SEGMENTS = 96           # finesse des disques

DEG_LAT_M = 111_320.0


def disque(lng: float, lat: float, rayon_m: float) -> Polygon:
    """Disque géodésique approché — le facteur cos(lat) corrige la longitude."""
    dlat = rayon_m / DEG_LAT_M
    dlng = rayon_m / (DEG_LAT_M * math.cos(math.radians(lat)))
    pts = [
        (
            lng + dlng * math.cos(2 * math.pi * i / SEGMENTS),
            lat + dlat * math.sin(2 * math.pi * i / SEGMENTS),
        )
        for i in range(SEGMENTS)
    ]
    return Polygon(pts)


zone = unary_union([disque(lng, lat, RAYON_M + MARGE_M) for _, lng, lat in CENTRES])

geojson = {
    "type": "Feature",
    "properties": {"nom": "Zone de service TamCar", "rayon_m": RAYON_M, "marge_m": MARGE_M},
    "geometry": mapping(zone),
}

with open("zone-tamcar.geojson", "w", encoding="utf-8") as f:
    json.dump(geojson, f, ensure_ascii=False)

minx, miny, maxx, maxy = zone.bounds
# Surface approchée : on repasse en mètres au parallèle moyen.
lat_moy = (miny + maxy) / 2
km2 = zone.area * (DEG_LAT_M / 1000) ** 2 * math.cos(math.radians(lat_moy))
bbox_km2 = (maxx - minx) * (maxy - miny) * (DEG_LAT_M / 1000) ** 2 * math.cos(
    math.radians(lat_moy)
)
print(f"bbox   : {minx:.3f},{miny:.3f},{maxx:.3f},{maxy:.3f}")
print(f"surface polygone : {km2:.0f} km²")
print(f"surface bbox     : {bbox_km2:.0f} km²  ({100 * km2 / bbox_km2:.0f} % retenus)")
